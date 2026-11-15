import { requireUser } from "@/server/auth";
import { createDebt, listDebts } from "@/server/services/finance";
import { debtSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listDebts(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, debtSchema);
    return ok(await createDebt(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
