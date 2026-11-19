import { createHash, createHmac, randomBytes } from "node:crypto";
import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { APP_NAME } from "@/lib/brand";

const LINK_LIFETIME_MS = 10 * 60 * 1000;
const DEFAULT_PREFERENCES = { quietStartHour: 22, quietEndHour: 7, isActive: true };

type Preferences = typeof DEFAULT_PREFERENCES;
type DispatchResult = {
  delivered: boolean;
  suppressed: "quiet-hours" | "inactive" | "not-configured" | "duplicate" | null;
};

export interface ChannelConfig extends Preferences {
  telegramAvailable: boolean;
  telegramConnected: boolean;
  telegramChatId: string | null;
}

function botToken() {
  return process.env.TELEGRAM_BOT_TOKEN?.trim() || undefined;
}

export function telegramWebhookSecret() {
  const token = botToken();
  return token ? createHmac("sha256", token).update("horizon-journal:telegram-webhook:v1").digest("hex") : undefined;
}

export async function channelConfig(userId: string): Promise<ChannelConfig> {
  const channel = await prisma.notificationChannel.findUnique({
    where: { userId },
    select: { telegramChatId: true, quietStartHour: true, quietEndHour: true, isActive: true },
  });
  return {
    telegramAvailable: Boolean(botToken()),
    telegramConnected: Boolean(channel?.telegramChatId),
    telegramChatId: channel?.telegramChatId ?? null,
    quietStartHour: channel?.quietStartHour ?? DEFAULT_PREFERENCES.quietStartHour,
    quietEndHour: channel?.quietEndHour ?? DEFAULT_PREFERENCES.quietEndHour,
    isActive: channel?.isActive ?? DEFAULT_PREFERENCES.isActive,
  };
}

export async function updateChannel(userId: string, data: Partial<Preferences>) {
  await prisma.notificationChannel.upsert({
    where: { userId },
    create: { userId, ...data },
    update: data,
  });
  return channelConfig(userId);
}

async function telegramRequest(token: string, method: "getMe" | "sendMessage", data?: object) {
  try {
    const response = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(data ?? {}),
      signal: AbortSignal.timeout(8000),
      redirect: "error",
    });
    if (!response.ok) return null;
    const body = await response.json();
    return body?.ok === true ? body.result : null;
  } catch {
    return null;
  }
}

function hashLinkCode(code: string, chatId: string) {
  return createHash("sha256").update(`${code}:${chatId}`).digest("hex");
}

export async function telegramBotUrl() {
  const token = botToken();
  if (!token) throw new ApiError(503, "Bot Telegram belum dikonfigurasi.");
  const bot = await telegramRequest(token, "getMe");
  if (typeof bot?.username !== "string" || !/^[A-Za-z0-9_]+$/.test(bot.username)) {
    throw new ApiError(503, "Bot Telegram sedang tidak dapat dihubungi.");
  }
  return `https://t.me/${bot.username}`;
}

export async function createTelegramLink(userId: string, chatId: string) {
  const botUrl = await telegramBotUrl();
  const code = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_LIFETIME_MS);
  const pending = { telegramLinkCodeHash: hashLinkCode(code, chatId), telegramLinkExpiresAt: expiresAt };
  await prisma.notificationChannel.upsert({
    where: { userId },
    create: { userId, ...pending },
    update: pending,
  });
  return { url: `${botUrl}?start=${code}`, expiresAt: expiresAt.toISOString() };
}

export async function handleTelegramChatMessage(chatId: string, text: string) {
  if (text === "/start" || text === "/id") {
    const token = botToken();
    if (token) await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `Chat ID Telegram Anda: ${chatId}\n\nMasukkan angka ini di Pengaturan → Notifikasi Telegram Horizon Journal, lalu pilih Hubungkan Telegram.`,
    });
    return;
  }
  const code = /^\/start ([A-Za-z0-9_-]{43})$/.exec(text)?.[1];
  if (!code) return;

  try {
    await prisma.notificationChannel.updateMany({
      where: { telegramLinkCodeHash: hashLinkCode(code, chatId), telegramLinkExpiresAt: { gt: new Date() } },
      data: { telegramChatId: chatId, telegramLinkCodeHash: null, telegramLinkExpiresAt: null },
    });
  } catch (error) {
    // A chat already paired with another account keeps its current owner.
    if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") throw error;
  }
}

function inQuietHours(start: number, end: number, timezone: string) {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: timezone }).format(new Date()));
  } catch {
    hour = new Date().getUTCHours();
  }
  return start <= end ? hour >= start && hour < end : hour >= start || hour < end;
}

function pauseReason(channel: Preferences, timezone: string) {
  if (!channel.isActive) return "inactive";
  if (inQuietHours(channel.quietStartHour, channel.quietEndHour, timezone)) return "quiet-hours";
  return null;
}

export async function dispatchNotification(
  userId: string,
  notificationId: string,
  userTimezone = "Asia/Jakarta",
): Promise<DispatchResult> {
  const token = botToken();
  if (!token) return { delivered: false, suppressed: "not-configured" };
  const [notice, destination] = await Promise.all([
    prisma.notification.findUnique({
      where: { id: notificationId, userId },
      select: { title: true, body: true, severity: true },
    }),
    prisma.notificationChannel.findUnique({
      where: { userId },
      select: { telegramChatId: true, quietStartHour: true, quietEndHour: true, isActive: true },
    }),
  ]);
  if (!notice) return { delivered: false, suppressed: "not-configured" };
  const chatId = destination?.telegramChatId;
  if (!destination || !chatId) return { delivered: false, suppressed: "not-configured" };
  const paused = pauseReason(destination, userTimezone);
  if (paused) return { delivered: false, suppressed: paused };

  // Commit the claim before calling Telegram. A timeout can mean the message was delivered.
  const { count } = await prisma.notification.updateMany({
    where: { id: notificationId, userId, telegramClaimedAt: null },
    data: { telegramClaimedAt: new Date() },
  });
  if (!count) return { delivered: false, suppressed: "duplicate" };

  return prisma.$transaction(async (tx) => {
    // Keep the chat bound to this account throughout dispatch.
    const [channel] = await tx.$queryRaw<Array<Preferences & { telegramChatId: string | null }>>`
      SELECT "telegramChatId", "quietStartHour", "quietEndHour", "isActive"
      FROM "NotificationChannel" WHERE "userId" = ${userId} FOR SHARE
    `;
    if (channel?.telegramChatId !== chatId) return { delivered: false, suppressed: "not-configured" };
    const paused = pauseReason(channel, userTimezone);
    if (paused) return { delivered: false, suppressed: paused };

    const icon = notice.severity === "CRITICAL" ? "🚨" : notice.severity === "WARNING" ? "⚠️" : "ℹ️";
    const result = await telegramRequest(token, "sendMessage", {
      chat_id: chatId,
      text: `${icon} ${notice.title}${notice.body ? `\n${notice.body}` : ""}\n\n— ${APP_NAME}`,
      link_preview_options: { is_disabled: true },
    });
    return { delivered: Boolean(result), suppressed: null };
  }, { timeout: 12000 });
}
