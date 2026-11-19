import { requireUser } from "@/server/auth";
import { runSimulation, simulationResponse } from "@/server/services/scenarios";
import { runSimulationSchema } from "@/lib/validation/planning";
import { handleRouteError, ok, parseBody } from "@/lib/api";

/** Ad-hoc simulation without saving a scenario. */
export async function POST(req: Request) {
  try {
    await requireUser();
    const input = await parseBody(req, runSimulationSchema);
    const { result } = runSimulation(input);
    return ok(simulationResponse(result));
  } catch (e) {
    return handleRouteError(e);
  }
}
