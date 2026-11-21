import { ApiError, handleRouteError, privateNoStore } from "@/lib/api";
import { aiJournalPdfInput } from "@/lib/validation/ai-journal-snapshot";
import { requireUser } from "@/server/auth";
import { getSavedAiJournalAnalysis, verifyAnalysisReceipt } from "@/server/services/ai-journal-history";
import { renderAiJournalPdf } from "@/server/services/ai-journal-pdf";
import { readReportInput } from "../report-input";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readReportInput(request, aiJournalPdfInput);
    const analysis = input.source === "current"
      ? await verifyAnalysisReceipt(user.id, input)
      : await getSavedAiJournalAnalysis(user.id, input.reportId);
    if (!analysis) throw new ApiError(404, "Laporan analisis tidak ditemukan.");

    const pdf = await renderAiJournalPdf(analysis);
    const timestamp = analysis.analyzedAt.slice(0, 16).replace("T", "-").replace(":", "");
    const filename = "analisis-ai-" + timestamp + "-" + input.reportId.slice(0, 8) + ".pdf";
    return privateNoStore(new Response(new Uint8Array(pdf), { headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": 'attachment; filename="' + filename + '"',
    } }));
  } catch (error) {
    return privateNoStore(handleRouteError(error));
  }
}
