import { requireUser } from "@/server/auth";
import { markAllRead } from "@/server/services/reviews";
import { handleRouteError, ok } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    await markAllRead(user.id);
    return ok({ read: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
