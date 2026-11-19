import { requireUser } from "@/server/auth";
import { importStatement } from "@/server/services/imports";
import { handleRouteError, ok } from "@/lib/api";
import { readMt5Upload } from "@/server/mt5-report";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { accountId, bytes } = await readMt5Upload(req);
    return ok(await importStatement(user.id, accountId, bytes, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
