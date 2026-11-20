import { handleRouteError, ok, parseBody } from "@/lib/api";
import { createActivityTypeSchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { createActivityType } from "@/server/services/task-types";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, createActivityTypeSchema);
    return ok(await createActivityType(user.id, input), 201);
  } catch (error) {
    return handleRouteError(error);
  }
}
