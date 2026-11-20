import { timingSafeEqual } from "node:crypto";
import { getAppOrigin } from "@/lib/app-origin";
import { fmtCalendarDateID, zonedPeriod } from "@/lib/dates";
import { fmtNum, fmtUSDdelta } from "@/lib/money";
import { localDateKey, reviewPeriodLabel } from "@/lib/review-period";
import { prisma } from "@/server/db";
import type { Prisma } from "@prisma/client";
import { weeklySummary } from "./ledger";
import {
  answerTelegramCallback, pairTelegramChat, sendTelegramText, TELEGRAM_MENU_START,
  telegramCallbackSignature, type TelegramButton,
} from "./notify-channels";
import { completePendingActivity, getTaskDayPage } from "./tasks";

type Destination = { chatId: string; userId: string; timezone: string };
type CallbackAction = "w" | "t" | "d";

const buttonLifetimeSeconds = 15 * 60;
const tasksPerMessage = 8;
const pairingInstructions = "Masukkan Chat ID di Pengaturan → Notifikasi Telegram, lalu pilih Hubungkan Telegram.";
const connectMessage = "Hubungkan Telegram dari Pengaturan → Notifikasi Telegram di Horizon Journal.";
const retryMessage = "Permintaan gagal diproses. Coba lagi sebentar.";
const unavailableMessage = "Tombol sudah kedaluwarsa atau tidak tersedia.";
const mainMenuButton = { text: "Menu Utama", callback_data: "horizon:menu" };

async function linkedDestination(chatId: string): Promise<Destination | null> {
  const config = await prisma.notificationChannel.findUnique({
    where: { telegramChatId: chatId },
    select: { userId: true, user: { select: { timezone: true } } },
  });
  return config && { chatId, userId: config.userId, timezone: config.user.timezone };
}

async function lockLinkedDestination(tx: Prisma.TransactionClient, { userId, chatId }: Destination) {
  const [connected] = await tx.$queryRaw<{ userId: string }[]>`
    SELECT "userId" FROM "NotificationChannel"
    WHERE "telegramChatId" = ${chatId} AND "userId" = ${userId} FOR SHARE
  `;
  return Boolean(connected);
}

function signCallback(destination: Destination, payload: string) {
  return telegramCallbackSignature(`${destination.userId}:${destination.chatId}:${payload}`);
}

function callbackButton(destination: Destination, action: CallbackAction, resource: string, text: string): TelegramButton {
  const expiry = (Math.floor(Date.now() / 1000) + buttonLifetimeSeconds).toString(36);
  const payload = `${action}.${resource}.${expiry}`;
  const signature = signCallback(destination, payload);
  if (!signature) throw new Error("Bot Telegram belum dikonfigurasi.");
  return { text, callback_data: `${payload}.${signature.toString("base64url")}` };
}

function readCallback(destination: Destination, value: string) {
  const match = /^([wtd])\.([a-z0-9-]{0,36})\.([a-z0-9]{1,7})\.([A-Za-z0-9_-]{16})$/.exec(value);
  if (!match) return null;
  const action = match[1] as CallbackAction;
  const resource = match[2]!;
  const expires = match[3]!;
  const signature = match[4]!;
  const expected = signCallback(destination, `${action}.${resource}.${expires}`);
  if (!expected || !timingSafeEqual(expected, Buffer.from(signature, "base64url"))) return null;
  return { action, resource, expiresAt: Number.parseInt(expires, 36) * 1000 };
}

function appLink(text: string, path: string): TelegramButton[] {
  const origin = getAppOrigin();
  return origin?.protocol === "https:" ? [{ text, url: new URL(path, origin).href }] : [];
}

async function reply(destination: Destination, text: string, buttons: TelegramButton[][] = []) {
  let delivery: Promise<boolean> | undefined;
  await prisma.$transaction(async (tx) => {
    if (!await lockLinkedDestination(tx, destination)) return;
    // Start sending under the ownership lock. Wait for Telegram after releasing it.
    delivery = sendTelegramText(destination.chatId, text, buttons);
  });
  if (delivery && !await delivery) throw new Error("Pengiriman balasan Telegram gagal.");
}

async function showMenu(destination: Destination) {
  await reply(destination, "Pilih menu Horizon Journal.", [
    [{ text: "Ringkasan Trading", callback_data: "horizon:ringkasan" }],
    [{ text: "Tugas Hari Ini", callback_data: "horizon:tugas" }],
  ]);
}

async function showWelcome(chatId: string, pairingAttempt: boolean) {
  const intro = pairingAttempt
    ? "Tautan penyambungan tidak berlaku. Buat tautan baru dari Pengaturan."
    : "Selamat datang di Horizon Journal. Hubungkan akun untuk melihat ringkasan trading mingguan dan menyelesaikan tugas harian dari Telegram.";
  const buttons = [
    [{ text: "Lihat Chat ID", callback_data: "horizon:id" }],
    appLink("Buka Pengaturan", "/settings"),
  ].filter((row) => row.length);
  await sendTelegramText(chatId, `${intro}\n\nTekan Lihat Chat ID. ${pairingInstructions}`, buttons);
}

async function showSummary(destination: Destination, now: Date) {
  const summary = await weeklySummary(destination.userId, now);
  const period = reviewPeriodLabel(zonedPeriod("WEEKLY", now, destination.timezone), destination.timezone);
  const result = summary.tradesCount || !summary.realizedPnl.isZero()
    ? `P&L terealisasi ${fmtUSDdelta(summary.realizedPnl)}\nJumlah transaksi ${fmtNum(summary.tradesCount, 0)}`
    : "Belum ada transaksi yang terealisasi minggu ini.";
  const buttons = [appLink("Buka Dasbor", "/dashboard"), [mainMenuButton]].filter((row) => row.length);
  await reply(destination, `Ringkasan Trading\n${period}\n\n${result}`, buttons);
}

const taskStatus = { PENDING: "Menunggu", COMPLETED: "Selesai", NOT_COMPLETED: "Tidak selesai" } as const;

async function showTasks(destination: Destination, now: Date, page = 0) {
  const date = localDateKey(now, destination.timezone);
  const { activities: tasks, currentPage, totalPages, start } = await getTaskDayPage(destination.userId, date, page, tasksPerMessage);
  const rows = tasks.map((task, index) => `${start + index + 1}. ${task.plan.replace(/\s+/g, " ").slice(0, 170)} · ${taskStatus[task.status]}`);
  const buttons: TelegramButton[][] = [];
  for (const [index, task] of tasks.entries()) {
    if (task.status === "PENDING") {
      buttons.push([callbackButton(destination, "d", task.id, `Tandai selesai · ${start + index + 1}`)]);
    }
  }
  const pagination: TelegramButton[] = [];
  if (currentPage > 0) pagination.push(callbackButton(destination, "t", (currentPage - 1).toString(36), "Sebelumnya"));
  if (currentPage + 1 < totalPages) pagination.push(callbackButton(destination, "t", (currentPage + 1).toString(36), "Berikutnya"));
  if (pagination.length) buttons.push(pagination);
  const open = appLink("Buka Tugas di Web", `/tasks?date=${date}`);
  if (open.length) buttons.push(open);
  buttons.push([mainMenuButton]);

  const header = `Tugas Hari Ini\n${fmtCalendarDateID(date)}${totalPages > 1 ? ` · Halaman ${currentPage + 1}/${totalPages}` : ""}`;
  await reply(destination, `${header}\n\n${rows.length ? rows.join("\n") : "Belum ada tugas hari ini."}`, buttons);
}

async function showScreen(chatId: string, command: string, pairingAttempt = false) {
  if (command === "id") {
    await sendTelegramText(chatId, `Chat ID Telegram Anda: ${chatId}\n\n${pairingInstructions}`, [[mainMenuButton]]);
    return;
  }
  const destination = await linkedDestination(chatId);
  if (!destination) {
    await showWelcome(chatId, pairingAttempt);
  } else if (command === "ringkasan") {
    await showSummary(destination, new Date());
  } else if (command === "tugas") {
    await showTasks(destination, new Date());
  } else {
    await showMenu(destination);
  }
}

export async function handleTelegramMessage(chatId: string, text: string) {
  const match = /^\/(start|id|menu|ringkasan|tugas)(?:@[a-z0-9_]+)?(?:\s+(\S+))?$/i.exec(text.trim());
  const command = match?.[1]?.toLowerCase();
  const payload = match?.[2];
  if (!command || (payload && command !== "start")) return;
  if (payload && /^[A-Za-z0-9_-]{43}$/.test(payload)) await pairTelegramChat(chatId, payload);

  try {
    await showScreen(chatId, command, Boolean(payload && payload !== TELEGRAM_MENU_START));
  } catch {
    await sendTelegramText(chatId, retryMessage);
  }
}

export async function handleTelegramMenuCallback(chatId: string, id: string, data: string) {
  const now = new Date();
  let acknowledged = false;
  try {
    const command = /^horizon:(id|menu|ringkasan|tugas)$/.exec(data)?.[1];
    if (command) {
      await answerTelegramCallback(id);
      acknowledged = true;
      await showScreen(chatId, command);
      return;
    }

    const destination = await linkedDestination(chatId);
    if (!destination) return await answerTelegramCallback(id, connectMessage, true);
    const callback = readCallback(destination, data);
    if (!callback) return await answerTelegramCallback(id, unavailableMessage, true);
    if (callback.expiresAt <= now.getTime()) {
      await answerTelegramCallback(id, "Tombol sudah kedaluwarsa. Pilih dari menu baru di chat.");
      acknowledged = true;
      await showMenu(destination);
      return;
    }

    if (callback.action === "d") {
      const date = localDateKey(now, destination.timezone);
      const outcome = await prisma.$transaction(async (tx) => {
        return await lockLinkedDestination(tx, destination)
          ? completePendingActivity(destination.userId, callback.resource, date, tx) : "not-available";
      });
      const label = outcome === "completed" ? "Tugas ditandai selesai."
        : outcome === "already-completed" ? "Tugas sudah selesai." : unavailableMessage;
      await answerTelegramCallback(id, label, outcome === "not-available");
      acknowledged = true;
      if (outcome === "completed") await showTasks(destination, now);
    } else {
      await answerTelegramCallback(id);
      acknowledged = true;
      if (callback.action === "w") await showSummary(destination, now);
      else await showTasks(destination, now, Number.parseInt(callback.resource, 36) || 0);
    }
  } catch {
    if (acknowledged) await sendTelegramText(chatId, retryMessage);
    else await answerTelegramCallback(id, retryMessage, true);
  }
}
