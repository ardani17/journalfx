import { handleRouteError, ok, parseBody } from "@/lib/api";
import { createActivitySchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { createActivity } from "@/server/services/tasks";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, createActivitySchema);
    const { id, created } = await createActivity(user.id, input);
    return ok({ id }, created ? 201 : 200);
  } catch (error) {
    return handleRouteError(error);
  }
}
