import { requireUser } from "@/server/auth";
import { getActiveRule, updateRule } from "@/server/services/withdrawals";
import { wdRuleSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getActiveRule(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, wdRuleSchema);
    return ok(await updateRule(user.id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
