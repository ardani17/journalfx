import { handleRouteError, ok, parseBody } from "@/lib/api";
import { taskReflectionSchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { saveTaskReflection } from "@/server/services/tasks";

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, taskReflectionSchema);
    await saveTaskReflection(user.id, input);
    return ok(null);
  } catch (error) {
    return handleRouteError(error);
  }
}
