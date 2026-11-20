import { requireUser } from "@/server/auth";
import { loadAiJournalEvidence } from "@/server/services/ai-journal-evidence";
import { aiJournalConfig, generateAiJournal, reserveAiJournalRequest } from "@/server/services/ai-journal";
import { MIN_AI_JOURNAL_TRADES } from "@/lib/ai-journal";
import { ApiError, handleRouteError, ok } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Permintaan tidak diizinkan.");
    }
    const config = aiJournalConfig();
    if (!config) {
      console.warn("[ai-journal]", { stage: "configuration" });
      throw new ApiError(503, "Penyedia AI belum dikonfigurasi.");
    }
    const analysis = await loadAiJournalEvidence(user.id).catch(() => {
      console.warn("[ai-journal]", { stage: "trade_data" });
      throw new ApiError(503, "Data trade belum bisa dimuat untuk analisis AI. Silakan coba lagi.");
    });
    if (analysis.coverage.closedTrades < MIN_AI_JOURNAL_TRADES) {
      throw new ApiError(422, `Analisis AI membutuhkan minimal ${MIN_AI_JOURNAL_TRADES} trade tertutup dengan P/L tercatat.`);
    }
    await reserveAiJournalRequest(user.id).catch((error) => {
      if (error instanceof ApiError && error.status === 429) {
        console.warn("[ai-journal]", { stage: "quota" });
        throw error;
      }
      console.warn("[ai-journal]", { stage: "quota_store" });
      throw new ApiError(503, "Insight AI sementara tidak tersedia. Silakan coba lagi.");
    });
    const response = ok(await generateAiJournal(analysis, config));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
