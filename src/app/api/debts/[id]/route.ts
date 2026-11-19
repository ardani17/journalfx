import { requireUser } from "@/server/auth";
import { serializeDebt, updateDebtTerms } from "@/server/services/finance";
import { debtTermsSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, debtTermsSchema);
    return ok(serializeDebt(await updateDebtTerms(user.id, id, input, req)));
  } catch (e) {
    return handleRouteError(e);
  }
}
