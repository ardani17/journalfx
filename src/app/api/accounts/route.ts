import { requireUser } from "@/server/auth";
import { createAccount, listAccounts } from "@/server/services/accounts";
import { createAccountSchema } from "@/lib/validation/ledger";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listAccounts(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, createAccountSchema);
    return ok(await createAccount(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
