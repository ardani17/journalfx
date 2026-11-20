import { timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { handleTelegramChatMessage, telegramWebhookSecret } from "@/server/services/notify-channels";
import { handleTelegramMenuCallback, handleTelegramMenuCommand } from "@/server/services/telegram-menu";
import { fail, handleRouteError, ok } from "@/lib/api";

const telegramId = z.number().int().positive().max(2 ** 52 - 1);
const privateChat = z.object({ id: telegramId, type: z.literal("private") });
const messageSchema = z.object({
  message: z.object({
    chat: privateChat,
    text: z.string(),
  }),
});
const callbackSchema = z.object({
  callback_query: z.object({
    id: z.string().min(1).max(128),
    from: z.object({ id: telegramId }),
    message: z.object({ chat: privateChat }),
    data: z.string().max(64),
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
    const body = await req.json().catch(() => null);
    const callback = callbackSchema.safeParse(body);
    if (callback.success) {
      const { from, message, id, data } = callback.data.callback_query;
      if (from.id === message.chat.id) await handleTelegramMenuCallback(String(from.id), id, data);
    } else {
      const parsed = messageSchema.safeParse(body);
      if (parsed.success) {
        const { chat, text } = parsed.data.message;
        const chatId = String(chat.id);
        const message = text.trim();
        const paired = await handleTelegramChatMessage(chatId, message);
        const command = /^\/(menu|ringkasan|tugas)(?:@[a-z0-9_]+)?$/i.exec(message)?.[1]?.toLowerCase();
        const next = paired ? "menu" : command;
        if (next) await handleTelegramMenuCommand(chatId, next);
      }
    }
    return ok({ received: true });
  } catch (error) {
    return handleRouteError(error);
  }
}
