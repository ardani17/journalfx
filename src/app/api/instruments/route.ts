import { handleRouteError, ok, parseBody } from "@/lib/api";
import { registerInstrumentSchema } from "@/lib/validation/trades";
import { requireUser } from "@/server/auth";
import { registerTradeInstrument } from "@/server/services/trades";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { symbol } = await parseBody(req, registerInstrumentSchema);
    return ok(await registerTradeInstrument(user.id, symbol, req));
  } catch (error) {
    return handleRouteError(error);
  }
}
