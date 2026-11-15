import { requireUser } from "@/server/auth";
import { cancelWithdrawal } from "@/server/services/withdrawals";
import { handleRouteError, ok } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return ok(await cancelWithdrawal(user.id, id));
  } catch (e) {
    return handleRouteError(e);
  }
}
