import { z } from "zod";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { requireUser } from "@/server/auth";
import { setActiveScenario } from "@/server/services/roadmap";

const activeScenarioSchema = z.object({ scenarioId: z.string().min(1).max(128).nullable() });

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const { scenarioId } = await parseBody(req, activeScenarioSchema);
    return ok(await setActiveScenario(user.id, scenarioId));
  } catch (e) {
    return handleRouteError(e);
  }
}
