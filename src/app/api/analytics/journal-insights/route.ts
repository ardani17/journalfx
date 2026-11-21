import { requireUser } from "@/server/auth";
import { hasEnoughAiJournalTrades, loadAiJournalExport } from "@/server/services/ai-journal-export";
import { aiJournalConfig, generateAiJournal, reserveAiJournalRequest } from "@/server/services/ai-journal";
import { MIN_AI_JOURNAL_TRADES } from "@/lib/ai-journal";
import { ApiError, handleRouteError, ok } from "@/lib/api";

const insufficientTrades = `Analisis AI membutuhkan minimal ${MIN_AI_JOURNAL_TRADES} trade tertutup dengan P/L tercatat.`;

function tradeDataUnavailable(): never {
  console.warn("[ai-journal]", { stage: "trade_data" });
  throw new ApiError(503, "Data trade belum bisa dimuat untuk analisis AI. Silakan coba lagi.");
}

function noStore(response: Response) {
  response.headers.set("Cache-Control", "private, no-store");
  return response;
}

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
    if (!await hasEnoughAiJournalTrades(user.id).catch(tradeDataUnavailable)) {
      throw new ApiError(422, insufficientTrades);
    }
    await reserveAiJournalRequest(user.id).catch((error) => {
      if (error instanceof ApiError && error.status === 429) {
        console.warn("[ai-journal]", { stage: "quota" });
        throw error;
      }
      console.warn("[ai-journal]", { stage: "quota_store" });
      throw new ApiError(503, "Insight AI sementara tidak tersedia. Silakan coba lagi.");
    });
    const analysis = await loadAiJournalExport(user.id, user.timezone).catch(tradeDataUnavailable);
    if (analysis.payload.scope.closedTrades < MIN_AI_JOURNAL_TRADES) {
      throw new ApiError(422, insufficientTrades);
    }
    return noStore(ok(await generateAiJournal(analysis, config)));
  } catch (error) {
    return noStore(handleRouteError(error));
  }
}
