import { requireUser } from "@/server/auth";
import { cancelTrade, getTrade } from "@/server/services/trades";
import { cancelTradeSchema } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return ok(await getTrade(user.id, id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { reason } = await parseBody(req, cancelTradeSchema);
    return ok(await cancelTrade(user.id, id, reason, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
