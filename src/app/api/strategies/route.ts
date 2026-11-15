import { requireUser } from "@/server/auth";
import { createStrategy, listStrategies } from "@/server/services/journal";
import { strategySchema } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listStrategies(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, strategySchema);
    return ok(await createStrategy(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
