import { requireUser } from "@/server/auth";
import { createTelegramLink, telegramBotUrl } from "@/server/services/notify-channels";
import { handleRouteError, ok, parseBody } from "@/lib/api";
import { z } from "zod";

const linkInput = z.strictObject({
  chatId: z.string().trim().regex(/^[1-9]\d{0,15}$/, "Masukkan Chat ID numerik dari chat pribadi Telegram.")
    .refine((id) => Number(id) < 2 ** 52, "Chat ID Telegram tidak valid."),
});

export async function GET() {
  try {
    await requireUser();
    const response = ok({ url: await telegramBotUrl() });
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireUser();
    const { chatId } = await parseBody(request, linkInput);
    const response = ok(await createTelegramLink(user.id, chatId));
    response.headers.set("Cache-Control", "no-store");
    return response;
  } catch (error) {
    return handleRouteError(error);
  }
}
