import { z } from "zod";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { updateActivitySchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { deleteActivity, updateActivity } from "@/server/services/tasks";

type Context = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const id = z.uuid().parse((await params).id);
    const input = await parseBody(req, updateActivitySchema);
    return ok(await updateActivity(user.id, id, input));
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function DELETE(_req: Request, { params }: Context) {
  try {
    const user = await requireUser();
    const id = z.uuid().parse((await params).id);
    await deleteActivity(user.id, id);
    return ok(null);
  } catch (error) {
    return handleRouteError(error);
  }
}
