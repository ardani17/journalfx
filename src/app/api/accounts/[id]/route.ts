import { requireUser } from "@/server/auth";
import { updateAccount } from "@/server/services/accounts";
import { updateAccountSchema } from "@/lib/validation/ledger";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, updateAccountSchema);
    return ok(await updateAccount(user.id, id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
