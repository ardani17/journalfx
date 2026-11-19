import { requireUser } from "@/server/auth";
import { createTelegramLink } from "@/server/services/notify-channels";
import { handleRouteError, ok } from "@/lib/api";

export async function POST() {
  try {
    const user = await requireUser();
    const response = ok(await createTelegramLink(user.id));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
