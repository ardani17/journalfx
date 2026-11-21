import { z } from "zod";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { AI_JOURNAL_PROVIDER_TIMEOUT_MS, type AiJournalAnalysis, type AiJournalFinding } from "@/lib/ai-journal";
import { fmtNum, fmtUSD } from "@/lib/money";
import type { AiJournalExport } from "./ai-journal-export";
import { AI_JOURNAL_PROMPT } from "./ai-journal-prompt";

const REQUESTS_PER_USER_PER_MINUTE = 1;
const TOTAL_REQUESTS_PER_MINUTE = 30;
const MAX_PROVIDER_RESPONSE_BYTES = 128 * 1024;

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

const findingSchema = z.strictObject({
  text: z.string().trim().min(1).max(800),
  evidenceIds: z.array(z.string().min(1).max(60)).min(1).max(4),
});
const resultSchema = z.strictObject({
  summary: z.string().trim().min(1).max(1500),
  strengths: z.array(findingSchema).max(3),
  mistakes: z.array(findingSchema).max(3),
  actionPlan: z.array(findingSchema).max(3),
});

const REPORT_FORMAT = [
  "Kembalikan hanya objek JSON dengan kunci summary, strengths, mistakes, dan actionPlan.",
  'summary adalah paragraf. Setiap elemen daftar berbentuk {"text":"uraian dalam bahasa Indonesia","evidenceIds":["id"]}.',
  "Gunakan ID overview untuk metrik keseluruhan atau ID dari breakdowns dan evidence. Teks akan ditampilkan bersama angka bukti yang dirender server.",
  "Jelaskan temuan dengan kata-kata dan gunakan referensi untuk angka historis. Angka dalam usulan aturan harus jelas sebagai target ke depan.",
  "Untuk setiap temuan gunakan hanya bukti dari JSON. Gunakan daftar kosong jika bukti tidak cukup dan jelaskan batasannya di summary.",
  "Sinyal indicator adalah indikasi, dan netPnlWithoutTheseTradesUsd hanya simulasi aritmetis. SL/TP yang kosong berarti tidak tercatat.",
  "Exit sebelum level TP tidak membuktikan bahwa pasar sempat mencapai target. Jangan menyimpulkan leverage atau niat dari data yang tidak tersedia.",
  "Pengaturan risiko berlaku saat ini. Semua angka P/L telah dihitung dalam USD. Periode mencakup seluruh tanggal entry trade yang memenuhi syarat.",
].join("\n");

type ProviderStage = "provider_network" | "provider_http" | "provider_response" | "provider_timeout";

function providerFailure(stage: ProviderStage, status?: number) {
  console.warn("[ai-journal]", status === undefined ? { stage } : { stage, status });
  return stage === "provider_timeout"
    ? new ApiError(504, "Penyedia AI terlalu lama merespons. Silakan coba lagi.")
    : new ApiError(502, "Insight AI gagal dibuat. Silakan coba lagi.");
}

function readProviderResponse(response: Response) {
  let bytes = 0;
  const boundedBody = response.body?.pipeThrough(new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      bytes += chunk.byteLength;
      if (bytes > MAX_PROVIDER_RESPONSE_BYTES) {
        controller.error(new Error("Provider response exceeds the size limit"));
      } else {
        controller.enqueue(chunk);
      }
    },
  }));
  return new Response(boundedBody).json();
}

export async function generateAiJournal(
  { json: exportJson, payload, labels }: AiJournalExport,
  config: NonNullable<ReturnType<typeof aiJournalConfig>>,
): Promise<AiJournalAnalysis> {
  const signal = AbortSignal.timeout(AI_JOURNAL_PROVIDER_TIMEOUT_MS);
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
          { role: "system", content: AI_JOURNAL_PROMPT + "\n\n### Format respons aplikasi\n" + REPORT_FORMAT },
          { role: "user", content: exportJson },
        ],
      }),
    });
    if (!response.ok) {
      await response.body?.cancel().catch(() => {});
      throw providerFailure("provider_http", response.status);
    }
    stage = "provider_response";
    const body = await readProviderResponse(response);
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== "string" || content.length > 12_000) throw new Error("Invalid provider response");
    const trimmed = content.trim();
    const json = /^```(?:json)?\s*([\s\S]+?)\s*```$/i.exec(trimmed)?.[1] ?? trimmed;
    const report = resultSchema.parse(JSON.parse(json));
    const { scope, coverage, metrics } = payload;
    const evidenceText = (label: string, data: { closedTrades: number; netPnlUsd: string; winRate: number | null }) =>
      label + " · " + data.closedTrades + " trade · P/L " + fmtUSD(data.netPnlUsd) +
      (data.winRate === null ? "" : " · tingkat kemenangan " + fmtNum(data.winRate, 2) + "%");
    const references = new Map([["overview", evidenceText("Seluruh trade tertutup", metrics)]]);
    for (const group of Object.values(payload.breakdowns).flat()) {
      references.set(group.id, evidenceText(labels.get(group.id) ?? group.id, group));
    }
    for (const pattern of payload.evidence) {
      references.set(pattern.id, (labels.get(pattern.id) ?? pattern.id) + " · " + pattern.trades +
        " trade · P/L " + fmtUSD(pattern.netPnlUsd) + " · simulasi P/L tanpa trade tersebut " +
        fmtUSD(pattern.netPnlWithoutTheseTradesUsd));
    }
    const render = ({ text, evidenceIds }: z.infer<typeof findingSchema>): AiJournalFinding => {
      if (new Set(evidenceIds).size !== evidenceIds.length) throw new Error("Duplicate evidence references");
      const evidence = evidenceIds.map((id) => {
        const proof = references.get(id);
        if (!proof) throw new Error("Unknown evidence reference");
        return proof;
      });
      return { text, evidence };
    };
    return { scope, coverage, metrics, analyzedAt: new Date().toISOString(), summary: report.summary,
      strengths: report.strengths.map(render), mistakes: report.mistakes.map(render), actionPlan: report.actionPlan.map(render) };
  } catch (error) {
    if (error instanceof ApiError) throw error;
    const timedOut = signal.aborted || (error instanceof DOMException && error.name === "TimeoutError");
    throw providerFailure(timedOut ? "provider_timeout" : stage);
  }
}
