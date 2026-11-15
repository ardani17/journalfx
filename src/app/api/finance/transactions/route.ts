import { requireUser } from "@/server/auth";
import { addFinancialTransaction, listFinancialTransactions } from "@/server/services/finance";
import { financialTxSchema } from "@/lib/validation/finance";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await listFinancialTransactions(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, financialTxSchema);
    return ok(await addFinancialTransaction(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
