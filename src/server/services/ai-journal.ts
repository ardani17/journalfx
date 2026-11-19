import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import type { Insight } from "@/lib/finance/insights";

export const MIN_JOURNAL_SAMPLE = 3;
const REQUESTS_PER_USER_PER_MINUTE = 1;
const TOTAL_REQUESTS_PER_MINUTE = 30;

export async function reserveAiJournalRequest(userId: string) {
  await prisma.$transaction(async (tx) => {
    for (const [key, limit] of [
      ["user:" + userId, REQUESTS_PER_USER_PER_MINUTE],
      ["global", TOTAL_REQUESTS_PER_MINUTE],
    ] as const) {
      const reserved = await tx.$queryRaw<{ key: string }[]>`
        INSERT INTO "AiJournalRateLimit" ("key", "windowStart", "requests")
        VALUES (${key}, date_trunc('minute', CURRENT_TIMESTAMP), 1)
        ON CONFLICT ("key") DO UPDATE SET
          "requests" = CASE WHEN "AiJournalRateLimit"."windowStart" = EXCLUDED."windowStart"
            THEN "AiJournalRateLimit"."requests" + 1 ELSE 1 END,
          "windowStart" = EXCLUDED."windowStart"
        WHERE "AiJournalRateLimit"."windowStart" < EXCLUDED."windowStart"
          OR ("AiJournalRateLimit"."windowStart" = EXCLUDED."windowStart"
            AND "AiJournalRateLimit"."requests" < ${limit})
        RETURNING "key"
      `;
      if (reserved.length === 0) {
        throw new ApiError(429, "Batas permintaan insight AI tercapai. Coba lagi dalam satu menit.");
      }
    }
  });
}

export function aiJournalConfig(env = process.env) {
  const base = env.AI_BASE_URL?.trim();
  const key = env.AI_API_KEY?.trim();
  const model = env.AI_MODEL?.trim();
  if (!base || !key || !model) return null;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash) return null;
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "[::1]", "localhost"].includes(url.hostname))) return null;
    url.pathname = url.pathname.replace(/\/+$/, "") + "/chat/completions";
    return { url, key, model };
  } catch {
    return null;
  }
}

type Coverage = { total: number; withJournal: number; complete: number };
const knownEvidence = /^(?:session-(?:asian|london|newyork|tanpa-sesi)|fomo-impact|missing-sl|revenge-pattern|completeness)$/;
const resultSchema = z.array(z.object({
  finding: z.string().trim().min(1).max(650),
  evidenceId: z.string(),
})).min(1).max(5);

export async function generateAiJournal(
  insights: Insight[],
  coverage: Coverage,
  config: NonNullable<ReturnType<typeof aiJournalConfig>>,
) {
  if (coverage.withJournal < MIN_JOURNAL_SAMPLE) throw new ApiError(422, "Belum cukup data jurnal untuk insight AI.");
  // Only built-in rules with fixed labels are eligible; mistake tags can contain free text.
  const evidence = new Map(insights.filter((item) => knownEvidence.test(item.id)).map((item) => [item.id, {
    id: item.id,
    statistic: item.title,
    sample: item.evidence,
  }]));

  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      redirect: "error",
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
      body: JSON.stringify({
        model: config.model,
        messages: [
          { role: "system", content: "Analisis pola dan disiplin trading secara retrospektif dalam bahasa Indonesia. Gunakan hanya fakta yang diberikan, nyatakan keterbatasan sampel, dan hindari prediksi atau sinyal. Balas hanya dengan array JSON berisi 1–5 objek dengan kunci finding dan evidenceId. evidenceId harus persis salah satu ID bukti yang diberikan." },
          { role: "user", content: JSON.stringify({ coverage, evidence: [...evidence.values()] }) },
        ],
      }),
    });
    if (!response.ok) throw new Error("Provider request failed");
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 12_000) throw new Error("Invalid provider response");
    return resultSchema.parse(JSON.parse(content)).map((item) => {
      const source = evidence.get(item.evidenceId);
      if (!source || item.finding.includes(config.key)) throw new Error("Invalid finding");
      return { finding: item.finding, evidence: source.sample };
    });
  } catch {
    throw new ApiError(502, "Insight AI gagal dibuat. Silakan coba lagi.");
  }
}
