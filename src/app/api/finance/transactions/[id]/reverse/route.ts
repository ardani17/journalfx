import { requireUser } from "@/server/auth";
import { reverseFinancialTransaction } from "@/server/services/finance";
import { handleRouteError, ok } from "@/lib/api";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    return ok(await reverseFinancialTransaction(user.id, id), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
