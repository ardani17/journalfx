import { requireUser } from "@/server/auth";
import { importStatement } from "@/server/services/imports";
import { handleRouteError, ok, ApiError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const form = await req.formData();
    const file = form.get("file");
    const accountId = String(form.get("accountId") ?? "");
    if (!(file instanceof File)) throw new ApiError(400, "Field 'file' wajib berupa file CSV");
    if (!accountId) throw new ApiError(400, "accountId wajib diisi");
    const text = await file.text();
    if (text.length > 5 * 1024 * 1024) throw new ApiError(400, "File maksimal 5 MB");
    return ok(await importStatement(user.id, accountId, text, req));
  } catch (e) {
    return handleRouteError(e);
  }
}
