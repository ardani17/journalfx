import { requireUser } from "@/server/auth";
import { uploadAttachment } from "@/server/services/attachments";
import { handleRouteError, ok, ApiError } from "@/lib/api";

const KINDS = new Set(["BEFORE", "ENTRY", "DURING", "EXIT"]);

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const form = await req.formData();
    const file = form.get("file");
    const kind = String(form.get("kind") ?? "ENTRY");
    if (!(file instanceof File)) throw new ApiError(400, "Field 'file' wajib berupa file");
    if (!KINDS.has(kind)) throw new ApiError(400, "Kind tidak valid");
    return ok(await uploadAttachment(user.id, id, file, kind as "BEFORE" | "ENTRY" | "DURING" | "EXIT", req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}
