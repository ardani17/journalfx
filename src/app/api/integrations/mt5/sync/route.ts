import { requireUser } from "@/server/auth";
import { mt5Sync, mt5SyncStatus } from "@/server/services/mt5-sync";
import { handleRouteError, ok } from "@/lib/api";
import { readMt5Upload } from "@/server/mt5-report";

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await mt5SyncStatus(user.id));
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const { accountId, bytes } = await readMt5Upload(req);
    return ok(await mt5Sync(user.id, accountId, bytes, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
