import { requireUser } from "@/server/auth";
import { addExecution } from "@/server/services/trades";
import { addExecutionSchema } from "@/lib/validation/trades";
import { handleRouteError, ok, parseBody } from "@/lib/api";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const input = await parseBody(req, addExecutionSchema);
    const { execution, trade } = await addExecution(user.id, id, input, req);
    return ok({ execution, trade }, 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
