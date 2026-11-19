import { z } from "zod";
import { requireUser } from "@/server/auth";
import { channelConfig, dispatchNotification, updateChannel } from "@/server/services/notify-channels";
import { prisma } from "@/server/db";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";

const channelSchema = z.strictObject({
  quietStartHour: z.coerce.number().int().min(0).max(23).optional(),
  quietEndHour: z.coerce.number().int().min(0).max(23).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    const response = ok(await channelConfig(user.id));
    response.headers.set("Cache-Control", "private, no-store");
    return response;
  } catch (e) {
    return handleRouteError(e);
  }
}

export async function PUT(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, channelSchema);
    return ok(await updateChannel(user.id, input));
  } catch (e) {
    return handleRouteError(e);
  }
}

/** Test delivery uses the same route to the owner's chat as other notifications. */
export async function POST() {
  try {
    const user = await requireUser();
    const notif = await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "journal",
        title: `Tes notifikasi ${APP_NAME}`,
        body: "Jika Anda menerima pesan ini di Telegram, channel aktif.",
        severity: "INFO",
      },
    });
    return ok(await dispatchNotification(user.id, notif.id, user.timezone));
  } catch (e) {
    return handleRouteError(e);
  }
}
