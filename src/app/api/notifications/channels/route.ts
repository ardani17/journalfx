import { z } from "zod";
import { requireUser } from "@/server/auth";
import { channelConfig, dispatchNotification, getChannel, sendTestMessage, updateChannel } from "@/server/services/notify-channels";
import { prisma } from "@/server/db";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";

const channelSchema = z.object({
  telegramBotToken: z.string().trim().max(200).nullable().optional(),
  telegramChatId: z.string().trim().max(60).nullable().optional(),
  quietStartHour: z.coerce.number().int().min(0).max(23).optional(),
  quietEndHour: z.coerce.number().int().min(0).max(23).optional(),
  isActive: z.boolean().optional(),
});

export async function GET() {
  try {
    const user = await requireUser();
    return ok(await channelConfig(user.id));
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

/** Test delivery — also exercises the real dispatch path once. */
export async function POST() {
  try {
    const user = await requireUser();
    await getChannel(user.id);
    const notif = await prisma.notification.create({
      data: {
        userId: user.id,
        kind: "journal",
        title: `Tes notifikasi ${APP_NAME}`,
        body: "Jika Anda menerima pesan ini di Telegram, channel aktif.",
        severity: "INFO",
      },
    });
    const direct = await sendTestMessage(user.id);
    const dispatched = await dispatchNotification(
      user.id,
      { id: notif.id, title: notif.title, body: notif.body, severity: notif.severity },
      user.timezone,
    );
    return ok({ direct, dispatched });
  } catch (e) {
    return handleRouteError(e);
  }
}
