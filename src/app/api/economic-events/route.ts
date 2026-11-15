import { z } from "zod";
import { requireUser } from "@/server/auth";
import { addEvent, deleteEvent, listEvents } from "@/server/services/economic-events";
import { handleRouteError, ok, parseBody, ApiError } from "@/lib/api";

const eventSchema = z.object({
  at: z.string().datetime({ offset: true }),
  currency: z.string().trim().length(3).default("USD"),
  title: z.string().trim().min(2).max(120),
  impact: z.enum(["low", "medium", "high"]).default("medium"),
});

export async function GET(req: Request) {
  try {
    const user = await requireUser();
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    return ok(
      await listEvents(user.id, {
        ...(from ? { from: new Date(from) } : {}),
        ...(to ? { to: new Date(to) } : {}),
      }),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, eventSchema);
    return ok(await addEvent(user.id, input, req), 201);
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function DELETE(req: Request) {
  try {
    const user = await requireUser();
    const id = new URL(req.url).searchParams.get("id") ?? "";
    if (!id) throw new ApiError(400, "id wajib diisi");
    await deleteEvent(user.id, id, req);
    return ok({ deleted: true });
  } catch (e) {
    return handleRouteError(e);
  }
}
