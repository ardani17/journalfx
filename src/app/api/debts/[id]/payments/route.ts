import { requireUser } from "@/server/auth";
import { payDebt, serializeDebt } from "@/server/services/finance";
import { debtPaymentSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, debtPaymentSchema);
    const { payment, debt } = await payDebt(user.id, id, input, req);
    return ok({ payment, debt: serializeDebt(debt) }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
