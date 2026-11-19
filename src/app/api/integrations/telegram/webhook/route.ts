import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleTelegramChatMessage, telegramWebhookSecret } from "@/server/services/notify-channels";
import { fail, handleRouteError, ok } from "@/lib/api";

const messageSchema = z.object({
  message: z.object({
    chat: z.object({ id: z.number().int().positive().max(2 ** 52 - 1), type: z.literal("private") }),
    text: z.string(),
  }),
});

export async function POST(req: Request) {
  const expected = telegramWebhookSecret();
  const received = req.headers.get("x-telegram-bot-api-secret-token");
  if (!expected || !received || received.length !== expected.length) return fail(401, "Webhook tidak terautentikasi");
  const provided = Buffer.from(received);
  if (provided.length !== expected.length || !timingSafeEqual(provided, Buffer.from(expected))) {
    return fail(401, "Webhook tidak terautentikasi");
  }
  try {
    const body = messageSchema.safeParse(await req.json().catch(() => null));
    if (body.success) {
      const { chat, text } = body.data.message;
      await handleTelegramChatMessage(String(chat.id), text.trim());
    }
    return ok({ received: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
