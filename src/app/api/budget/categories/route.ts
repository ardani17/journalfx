import { requireUser } from "@/server/auth";
import { addCategory } from "@/server/services/finance";
import { categorySchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, categorySchema);
    return ok(await addCategory(user.id, input.name, input.plannedAmount, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    const { removeCategory } = await import("@/server/services/finance");
    await removeCategory(user.id, id, req);
    return ok({ deleted: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
