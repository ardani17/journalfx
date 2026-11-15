import { requireUser } from "@/server/auth";
import { byStrategy, coreMetrics } from "@/server/services/analytics";
import { handleRouteError, ok } from "@/lib/api";

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const accountId = url.searchParams.get("accountId") ?? undefined;
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    const [core, strategies] = await Promise.all([
      coreMetrics(user.id, {
        ...(accountId ? { accountId } : {}),
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      }),
      byStrategy(user.id),
    ]);
    return ok({ core, strategies });
  } catch (e) {
    return handleRouteError(e);
  }
}
