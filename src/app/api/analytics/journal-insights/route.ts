import { requireUser } from "@/server/auth";
import { aiJournalConfig, generateAiJournal, MIN_JOURNAL_SAMPLE, reserveAiJournalRequest } from "@/server/services/ai-journal";
import { buildInsights } from "@/server/services/economic-events";
import { ApiError, handleRouteError, ok } from "@/lib/api";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    if (request.headers.get("sec-fetch-site") === "cross-site") {
      throw new ApiError(403, "Permintaan tidak diizinkan.");
    }
    const config = aiJournalConfig();
    if (!config) throw new ApiError(503, "Insight AI belum dikonfigurasi.");
    const { insights, dataCoverage } = await buildInsights(user.id);
    if (dataCoverage.withJournal < MIN_JOURNAL_SAMPLE) {
      throw new ApiError(422, "Belum cukup data jurnal untuk insight AI.");
    }
    await reserveAiJournalRequest(user.id);
    const response = ok(await generateAiJournal(insights, dataCoverage, config));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
