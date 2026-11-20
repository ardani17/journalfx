import { handleRouteError, ok, parseBody } from "@/lib/api";
import { activityTypeIdSchema, renameActivityTypeSchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { archiveActivityType, renameActivityType } from "@/server/services/task-types";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const id = activityTypeIdSchema.parse((await params).id);
    const { name } = await parseBody(req, renameActivityTypeSchema);
    return ok(await renameActivityType(user.id, id, name));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const id = activityTypeIdSchema.parse((await params).id);
    await archiveActivityType(user.id, id);
    return ok(null);
  } catch (error) {
    return handleRouteError(error);
  }
}
