import { requireUser } from "@/server/auth";
import { runSavedSimulation, simulationResponse } from "@/server/services/scenarios";
import { handleRouteError, ok } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return ok(simulationResponse(await runSavedSimulation(user.id, id)));
  } catch (e) {
    return handleRouteError(e);
  }
}
