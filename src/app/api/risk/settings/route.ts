import { requireUser } from "@/server/auth";
import { getRiskSettings, updateRiskSettings } from "@/server/services/risk";
import { riskSettingsSchema } from "@/lib/validation/planning";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await getRiskSettings(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PATCH(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, riskSettingsSchema);
    return ok(await updateRiskSettings(user.id, input, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
