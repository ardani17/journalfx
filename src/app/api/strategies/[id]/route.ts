import { requireUser } from "@/server/auth";
import { updateStrategy } from "@/server/services/journal";
import { strategyUpdateSchema } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, strategyUpdateSchema);
    return ok(await updateStrategy(user.id, id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
