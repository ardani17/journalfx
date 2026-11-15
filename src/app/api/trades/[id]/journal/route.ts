import { requireUser } from "@/server/auth";
import { upsertJournal } from "@/server/services/journal";
import { updateJournalSchema } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, updateJournalSchema);
    return ok(await upsertJournal(user.id, id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
