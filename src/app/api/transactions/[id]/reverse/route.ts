import { requireUser } from "@/server/auth";
import { reverseTransaction } from "@/server/services/ledger";
import { reverseTransactionSchema } from "@/lib/validation/ledger";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { reason } = await parseBody(req, reverseTransactionSchema);
    return ok(await reverseTransaction(user.id, id, reason, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
