import { requireUser } from "@/server/auth";
import { listWithdrawals, requestWithdrawal } from "@/server/services/withdrawals";
import { wdRequestSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listWithdrawals(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, wdRequestSchema);
    return ok(await requestWithdrawal(user.id, input.amountUsd, input.note, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
