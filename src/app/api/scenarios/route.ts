import { requireUser } from "@/server/auth";
import { createScenario, listScenarios, runSimulation } from "@/server/services/scenarios";
import { scenarioSchema } from "@/lib/validation/planning";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listScenarios(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, scenarioSchema);
    const { result } = runSimulation(input);
    const saved = await createScenario(user.id, input, req);
    return ok({ scenario: saved, summary: { cyclesCount: result.cyclesCount, reached: result.reached } }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
