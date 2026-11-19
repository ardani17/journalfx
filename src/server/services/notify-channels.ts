import { prisma } from "@/server/db";
import { D } from "@/lib/money";
import { APP_NAME } from "@/lib/brand";

/**
 * Outbound notification channels (v1.2.0).
 * - Opt-in Telegram channel; in-app notifications are the default push.
 * - Quiet hours (user-local) suppress outbound delivery (queued as unread in-app).
 * - Retry with backoff, per-channel dedupe key (no duplicate delivery).
 * - Tokens never leave the server unmasked.
 */

export interface ChannelConfig {
  telegramConfigured: boolean;
  telegramBotTokenMasked: string | null;
  telegramChatIdMasked: string | null;
  quietStartHour: number;
  quietEndHour: number;
  isActive: boolean;
}

export async function getChannel(userId: string) {
  let ch = await prisma.notificationChannel.findUnique({ where: { userId } });
  if (!ch) ch = await prisma.notificationChannel.create({ data: { userId } });
  return ch;
}

function mask(v: string | null): string | null {
  if (!v) return null;
  if (v.length <= 6) return "••••";
  return `${v.slice(0, 3)}••••${v.slice(-3)}`;
}

export async function channelConfig(userId: string): Promise<ChannelConfig> {
  const ch = await getChannel(userId);
  return {
    telegramConfigured: Boolean(ch.telegramBotToken && ch.telegramChatId),
    telegramBotTokenMasked: mask(ch.telegramBotToken),
    telegramChatIdMasked: mask(ch.telegramChatId),
    quietStartHour: ch.quietStartHour,
    quietEndHour: ch.quietEndHour,
    isActive: ch.isActive,
  };
}

export async function updateChannel(
  userId: string,
  data: {
    telegramBotToken?: string | null;
    telegramChatId?: string | null;
    quietStartHour?: number;
    quietEndHour?: number;
    isActive?: boolean;
  },
) {
  await getChannel(userId);
  // empty string clears; undefined keeps
  const patch: Record<string, unknown> = {};
  if (data.telegramBotToken !== undefined) patch.telegramBotToken = data.telegramBotToken || null;
  if (data.telegramChatId !== undefined) patch.telegramChatId = data.telegramChatId || null;
  if (data.quietStartHour !== undefined) patch.quietStartHour = data.quietStartHour;
  if (data.quietEndHour !== undefined) patch.quietEndHour = data.quietEndHour;
  if (data.isActive !== undefined) patch.isActive = data.isActive;
  await prisma.notificationChannel.update({ where: { userId }, data: patch });
  return channelConfig(userId);
}

function inQuietHours(start: number, end: number, tz: string): boolean {
  let hour: number;
  try {
    hour = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hour12: false, timeZone: tz }).format(new Date()));
  } catch {
    hour = new Date().getUTCHours();
  }
  if (start <= end) return hour >= start && hour < end;
  return hour >= start || hour < end; // overnight window (22→7)
}

async function sendTelegram(token: string, chatId: string, text: string): Promise<boolean> {
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chat_id: chatId, text, disable_web_page_preview: true }),
        signal: AbortSignal.timeout(8000),
      });
      if (res.ok) return true;
      if (res.status === 429 || res.status >= 500) continue; // retry
      return false; // 4xx — config error, don't retry
    } catch {
      // network error — retry with backoff
      await new Promise((r) => setTimeout(r, attempt * 1000));
    }
  }
  return false;
}

/** Dispatch a notification to configured channels (dedupe + quiet hours aware). */
export async function dispatchNotification(
  userId: string,
  notification: { id: string; title: string; body?: string | null; severity: string },
  userTimezone = "Asia/Jakarta",
): Promise<{ delivered: boolean; suppressed: "quiet-hours" | "inactive" | "not-configured" | "duplicate" | null }> {
  const ch = await getChannel(userId);
  if (!ch.isActive) return { delivered: false, suppressed: "inactive" };
  if (!ch.telegramBotToken || !ch.telegramChatId) return { delivered: false, suppressed: "not-configured" };
  if (ch.lastDedupeKey === notification.id) return { delivered: false, suppressed: "duplicate" };
  if (inQuietHours(ch.quietStartHour, ch.quietEndHour, userTimezone)) {
    return { delivered: false, suppressed: "quiet-hours" };
  }
  const icon = notification.severity === "CRITICAL" ? "🚨" : notification.severity === "WARNING" ? "⚠️" : "ℹ️";
  const ok = await sendTelegram(
    ch.telegramBotToken,
    ch.telegramChatId,
    `${icon} ${notification.title}${notification.body ? `\n${notification.body}` : ""}\n\n— ${APP_NAME}`,
  );
  if (ok) {
    await prisma.notificationChannel.update({
      where: { userId },
      data: { lastDedupeKey: notification.id },
    });
  }
  return { delivered: ok, suppressed: null };
}

/** Test message for the Save & Test flow in settings. */
export async function sendTestMessage(userId: string): Promise<boolean> {
  const ch = await getChannel(userId);
  if (!ch.telegramBotToken || !ch.telegramChatId) return false;
  void D; // (decimal import kept for consistency of module deps)
  return sendTelegram(ch.telegramBotToken, ch.telegramChatId, `✅ Tes notifikasi ${APP_NAME} — channel aktif.`);
}
