import { requireUser } from "@/server/auth";
import { deleteScenario } from "@/server/services/scenarios";
import { handleRouteError, ok } from "@/lib/api";

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteScenario(user.id, id);
    return ok({ deleted: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
