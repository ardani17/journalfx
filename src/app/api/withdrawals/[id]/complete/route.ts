import { requireUser } from "@/server/auth";
import { completeWithdrawal } from "@/server/services/withdrawals";
import { wdCompleteSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, wdCompleteSchema);
    return ok(await completeWithdrawal(user.id, id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
