import { handleRouteError, ok, privateNoStore } from "@/lib/api";
import { saveAiJournalInput } from "@/lib/validation/ai-journal-snapshot";
import { requireUser } from "@/server/auth";
import { saveAiJournalAnalysis } from "@/server/services/ai-journal-history";
import { readReportInput } from "../report-input";

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const input = await readReportInput(request, saveAiJournalInput);
    return privateNoStore(ok(await saveAiJournalAnalysis(user.id, input)));
  } catch (error) {
    return privateNoStore(handleRouteError(error));
  }
}
