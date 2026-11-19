import { requireUser } from "@/server/auth";
import { aiJournalConfig, generateAiJournal } from "@/server/services/ai-journal";
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
    const response = ok(await generateAiJournal(insights, dataCoverage, config));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
