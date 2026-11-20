import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import type { AiJournalAnalysis } from "@/lib/ai-journal";
import { renderAiJournalFinding, REVIEW_ACTIONS, type AiJournalEvidence } from "./ai-journal-evidence";

const REQUESTS_PER_USER_PER_MINUTE = 1;
const TOTAL_REQUESTS_PER_MINUTE = 30;
const PROVIDER_TIMEOUT_MS = 15_000;

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
    const path = url.pathname.replace(/\/+$/, "");
    url.pathname = path.endsWith("/chat/completions") ? path : path + "/chat/completions";
    return { url, key, model };
  } catch {
    return null;
  }
}

const resultSchema = z.array(z.strictObject({
  evidenceId: z.string().min(1).max(60),
  actionId: z.string().min(1).max(60),
})).min(1).max(5);

type ProviderStage = "provider_network" | "provider_http" | "provider_response" | "provider_timeout";

function providerFailure(stage: ProviderStage, status?: number) {
  console.warn("[ai-journal]", status === undefined ? { stage } : { stage, status });
  return stage === "provider_timeout"
    ? new ApiError(504, "Penyedia AI terlalu lama merespons. Silakan coba lagi.")
    : new ApiError(502, "Insight AI gagal dibuat. Silakan coba lagi.");
}

export async function generateAiJournal(
  { coverage, evidence }: AiJournalEvidence,
  config: NonNullable<ReturnType<typeof aiJournalConfig>>,
): Promise<AiJournalAnalysis> {
  const actionIds = new Set(evidence.flatMap((item) => item.actionIds));
  const payload = {
    coverage,
    evidence: evidence.map(({ id, groups, actionIds }) => ({
      id,
      groups: groups.map(({ alias, metrics }) => ({ label: alias, ...metrics })),
      actionIds,
    })),
    actions: Object.fromEntries([...actionIds].map((id) => [id, REVIEW_ACTIONS[id]])),
  };

  const signal = AbortSignal.timeout(PROVIDER_TIMEOUT_MS);
  let stage: ProviderStage = "provider_network";
  try {
    const response = await fetch(config.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${config.key}`, "Content-Type": "application/json" },
      redirect: "error",
      cache: "no-store",
      signal,
      body: JSON.stringify({
        model: config.model,
        stream: false,
        messages: [
          {
            role: "system",
            content: "Pilih 1–5 temuan retrospektif yang paling relevan untuk meninjau performa dan disiplin trading. Utamakan perbandingan yang memiliki selisih dan ukuran sampel bermakna saat tersedia. Untuk setiap ID bukti yang dipilih, pilih satu ID tindakan yang paling sesuai dari actionIds bukti itu. Gunakan setiap ID bukti satu kali. Balas hanya dengan array JSON, misalnya [{\"evidenceId\":\"overview\",\"actionId\":\"review-exits\"}].",
          },
          { role: "user", content: JSON.stringify(payload) },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw providerFailure("provider_http", response.status);
    }
    stage = "provider_response";
    const body = await response.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 12_000) throw new Error("Invalid provider response");
    const trimmed = content.trim();
    const json = /^```(?:json)?\s*([\s\S]+?)\s*```$/i.exec(trimmed)?.[1] ?? trimmed;
    const selected = new Set<string>();
    const findings = resultSchema.parse(JSON.parse(json)).map((item) => {
      const source = evidence.find(({ id }) => id === item.evidenceId);
      const action = source?.actionIds.find((id) => id === item.actionId);
      if (!source || !action || selected.has(source.id)) throw new Error("Invalid selection");
      selected.add(source.id);
      return renderAiJournalFinding(source, action);
    });
    return { coverage, findings };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = signal.aborted || (error instanceof DOMException && error.name === "TimeoutError");
    throw providerFailure(timedOut ? "provider_timeout" : stage);
  }
}
