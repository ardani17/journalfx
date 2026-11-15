import { requireUser } from "@/server/auth";
import { deleteAttachment, readAttachment } from "@/server/services/attachments";
import { handleRouteError } from "@/lib/api";

/** Private file serving — ownership verified per request; never static. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    const { data, mimeType, fileName } = await readAttachment(user.id, id);
    return new Response(new Uint8Array(data), {
      headers: {
        "content-type": mimeType,
        "content-disposition": `inline; filename="${encodeURIComponent(fileName)}"`,
        "cache-control": "private, max-age=3600",
        "x-content-type-options": "nosniff",
      },
    });
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireUser();
    const { id } = await params;
    await deleteAttachment(user.id, id);
    return Response.json({ ok: true, data: null });
  } catch (e) {
    return handleRouteError(e);
  }
}
