import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { channelConfig, dispatchNotification, telegramWebhookSecret, updateChannel } from "@/server/services/notify-channels";
import { localDateKey } from "@/lib/review-period";
import { fmtUSDdelta } from "@/lib/money";
import { weeklySummary } from "@/server/services/ledger";
import { GET as getBot, POST as createLink } from "@/app/api/notifications/channels/telegram-link/route";
import { POST as testDelivery, PUT as updatePreferences } from "@/app/api/notifications/channels/route";
import { POST as webhook } from "@/app/api/integrations/telegram/webhook/route";

vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("Telegram linking and outbound delivery", () => {
  const userIds: string[] = [];
  const messages: {
    chat_id: string;
    text: string;
    reply_markup?: { inline_keyboard: { text: string; callback_data?: string; url?: string }[][] };
  }[] = [];
  const callbackAnswers: { callback_query_id: string; text?: string; show_alert: boolean }[] = [];

  beforeAll(() => {
    if (existsSync(".env")) process.loadEnvFile(".env");
  });

  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "qa-bot-token");
    vi.stubEnv("APP_ORIGIN", "https://journal.example.test");
    messages.length = 0;
    callbackAnswers.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      if (input.endsWith("/getMe")) return Response.json({ ok: true, result: { username: "Horizon_QA_bot" } });
      if (input.endsWith("/answerCallbackQuery")) {
        callbackAnswers.push(JSON.parse(String(init.body)));
        return Response.json({ ok: true, result: true });
      }
      if (!input.endsWith("/sendMessage")) throw new Error("Unexpected mock request");
      messages.push(JSON.parse(String(init.body)));
      if (messages.at(-1)?.text.includes("Timeout QA")) throw new Error("Simulated network timeout");
      return Response.json({ ok: true, result: { message_id: messages.length } });
    }));
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  async function createUser() {
    const id = randomUUID();
    const user = await prisma.user.create({
      data: { name: "QA Telegram", email: `${id}@example.test`, googleSubject: id, timezone: "UTC" },
    });
    userIds.push(user.id);
    return user;
  }

  async function startCommand(user: Awaited<ReturnType<typeof createUser>>, chatId: number) {
    vi.mocked(requireUser).mockResolvedValueOnce(user);
    const response = await createLink(new Request("https://example.test/api/notifications/channels/telegram-link", {
      method: "POST",
      body: JSON.stringify({ chatId: String(chatId) }),
    }));
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.ok).toBe(true);
    const url = new URL((await response.json()).data.url);
    expect(url.origin + url.pathname).toBe("https://t.me/Horizon_QA_bot");
    const code = url.searchParams.get("start");
    expect(code).toMatch(/^[A-Za-z0-9_-]{43}$/);
    return `/start ${code}`;
  }

  function update(chat: number, text: string, type = "private", header = telegramWebhookSecret()!) {
    return webhook(new Request("https://example.test/api/integrations/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": header },
      body: JSON.stringify({ update_id: 123, message: { chat: { id: chat, type }, text } }),
    }));
  }

  function click(chat: number, id: string, data: string, type = "private", sender = chat) {
    return webhook(new Request("https://journal.example.test/api/integrations/telegram/webhook", {
      method: "POST",
      headers: { "x-telegram-bot-api-secret-token": telegramWebhookSecret()! },
      body: JSON.stringify({
        callback_query: { id, from: { id: sender }, data, message: { chat: { id: chat, type } } },
      }),
    }));
  }

  it("binds only private authenticated Start updates and permits one owner for each chat", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const chat = randomInt(100_000_000, 2_147_483_646);
    await updateChannel(alice.id, { isActive: false, quietStartHour: 21, quietEndHour: 8 });
    const firstStart = await startCommand(alice, chat);
    const secondStart = await startCommand(bob, chat);
    expect((await update(chat, firstStart, "private", "incorrect-secret")).status).toBe(401);
    expect((await update(chat, firstStart, "group")).ok).toBe(true);
    expect((await update(chat + 1, firstStart)).ok).toBe(true);
    expect((await channelConfig(alice.id)).telegramConnected).toBe(false);

    const responses = await Promise.all([
      update(chat, firstStart),
      update(chat, firstStart),
      update(chat, secondStart),
    ]);
    expect(responses.every((response) => response.ok)).toBe(true);
    const winner = await prisma.notificationChannel.findUniqueOrThrow({ where: { telegramChatId: String(chat) } });
    const [loser, loserCommand, winnerCommand] = winner.userId === alice.id
      ? [bob, secondStart, firstStart]
      : [alice, firstStart, secondStart];
    expect((await channelConfig(loser.id)).telegramConnected).toBe(false);
    await update(chat + 1, winnerCommand);
    expect(await prisma.notificationChannel.findUnique({ where: { telegramChatId: String(chat + 1) } })).toBeNull();
    await update(chat + 1, loserCommand);
    expect((await channelConfig(loser.id)).telegramChatId).toBeNull();
    await update(chat + 1, await startCommand(loser, chat + 1));
    expect(await prisma.notificationChannel.count({ where: { userId: { in: [alice.id, bob.id] }, telegramChatId: { not: null } } })).toBe(2);
    expect(await channelConfig(alice.id)).toMatchObject({
      telegramConnected: true, isActive: false, quietStartHour: 21, quietEndHour: 8,
    });

    const staleCommand = await startCommand(bob, chat + 2);
    const nextCommand = await startCommand(bob, chat + 2);
    await update(chat + 2, staleCommand);
    await prisma.notificationChannel.update({ where: { userId: bob.id }, data: { telegramLinkExpiresAt: new Date(0) } });
    await update(chat + 2, nextCommand);
    expect(await prisma.notificationChannel.findUnique({ where: { telegramChatId: String(chat + 2) } })).toBeNull();

    vi.mocked(requireUser).mockResolvedValueOnce(alice);
    const response = await updatePreferences(new Request("https://example.test/api/notifications/channels", {
      method: "PUT",
      body: JSON.stringify({ telegramBotToken: "manual", telegramChatId: "1" }),
    }));
    expect(response.status).toBe(400);
  });

  it("returns a private chat's ID, requires it in pairing, and derives webhook auth from the bot token", async () => {
    const user = await createUser();
    const chat = 2 ** 40 + randomInt(100_000_000);
    vi.mocked(requireUser).mockResolvedValueOnce(user);
    expect(await (await getBot()).json()).toEqual({ ok: true, data: { url: "https://t.me/Horizon_QA_bot?start=menu" } });
    vi.mocked(requireUser).mockResolvedValueOnce(user);
    const invalid = await createLink(new Request("https://example.test/api/notifications/channels/telegram-link", {
      method: "POST", body: JSON.stringify({ chatId: "@username" }),
    }));
    expect(invalid.status).toBe(400);
    expect(telegramWebhookSecret()).toMatch(/^[a-f0-9]{64}$/);
    await update(chat, "/id", "group");
    expect(messages).toHaveLength(0);
    await update(chat, "/id");
    expect(messages).toMatchObject([{
      chat_id: String(chat), text: expect.stringContaining(String(chat)),
      reply_markup: { inline_keyboard: [[{ text: "Menu Utama" }]] },
    }]);
    expect((await channelConfig(user.id)).telegramChatId).toBeNull();
    await update(chat, await startCommand(user, chat));
    expect((await channelConfig(user.id)).telegramChatId).toBe(String(chat));
  });

  it("lets private chats discover and navigate the inline menu in local development", async () => {
    vi.stubEnv("APP_ORIGIN", "http://localhost:3000");
    const probe = () => new Request("http://localhost:3000/api/integrations/telegram/webhook", {
      method: "POST",
      body: JSON.stringify({ check: "inline-menu" }),
      headers: { "x-telegram-bot-api-secret-token": telegramWebhookSecret()! },
    });
    const unauthorizedProbe = probe();
    unauthorizedProbe.headers.delete("x-telegram-bot-api-secret-token");
    expect((await webhook(unauthorizedProbe)).status).toBe(401);
    expect(await (await webhook(probe())).json()).toMatchObject({ data: { inlineMenu: true } });

    const user = await createUser();
    const chat = randomInt(100_000_000, 2_147_483_646);

    await update(chat, "/start");
    const welcome = messages.at(-1)!;
    expect(welcome.text).toContain("Selamat datang di Horizon Journal");
    expect(welcome.text).toContain("Hubungkan Telegram");
    const welcomeButtons = welcome.reply_markup!.inline_keyboard.flat();
    expect(welcomeButtons.map(({ text }) => text)).toEqual(["Lihat Chat ID"]);
    const chatIdButton = welcomeButtons[0]!.callback_data!;
    await update(chat, "/start menu");
    expect(messages.at(-1)?.text).toContain("Selamat datang di Horizon Journal");
    const messagesBeforeClick = messages.length;
    await click(chat, "other-sender", chatIdButton, "private", chat + 1);
    expect(messages).toHaveLength(messagesBeforeClick);
    await click(chat, "chat-id", chatIdButton);
    expect(messages.at(-1)?.text).toContain(String(chat));
    expect(callbackAnswers.at(-1)).toMatchObject({ callback_query_id: "chat-id", show_alert: false });

    const start = await startCommand(user, chat);
    await update(chat, start);
    await update(chat, "/start menu");
    const menu = messages.at(-1)!.reply_markup!.inline_keyboard.flat();
    expect(menu.map(({ text }) => text)).toEqual(["Ringkasan Trading", "Tugas Hari Ini"]);

    await click(chat, "summary", menu[0]!.callback_data!);
    expect(messages.at(-1)?.text).toContain("Ringkasan Trading");
    const summaryButtons = messages.at(-1)!.reply_markup!.inline_keyboard.flat();
    expect(summaryButtons.map(({ text }) => text)).toEqual(["Menu Utama"]);
    await click(chat, "back", summaryButtons[0]!.callback_data!);
    expect(messages.at(-1)?.text).toContain("Pilih menu Horizon Journal");

    await click(chat, "tasks", menu[1]!.callback_data!);
    expect(messages.at(-1)?.text).toContain("Tugas Hari Ini");
    expect(messages.at(-1)?.reply_markup?.inline_keyboard.flat().map(({ text }) => text)).toEqual(["Menu Utama"]);
  });

  it("sends to the owner once, honors settings, and holds the claim after a timeout", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const chat = randomInt(100_000_000, 2_147_483_646);
    await update(chat, await startCommand(alice, chat));
    await update(chat + 1, await startCommand(bob, chat + 1));
    messages.length = 0;
    await updateChannel(alice.id, { quietStartHour: 0, quietEndHour: 0 });
    await updateChannel(bob.id, { quietStartHour: 0, quietEndHour: 0 });

    const newNotice = (title: string) => prisma.notification.create({ data: { userId: alice.id, kind: "journal", title } });
    const first = await newNotice("Alice notification");
    await dispatchNotification(bob.id, first.id);
    const results = await Promise.all(Array.from({ length: 5 }, () => dispatchNotification(alice.id, first.id)));
    expect(results.filter((result) => result.delivered)).toHaveLength(1);
    expect(results.filter((result) => result.suppressed === "duplicate")).toHaveLength(4);
    const later = await newNotice("Alice follow-up");
    await dispatchNotification(alice.id, later.id);
    expect((await dispatchNotification(alice.id, first.id)).suppressed).toBe("duplicate");
    expect(messages.map((message) => message.chat_id)).toEqual([String(chat), String(chat)]);

    vi.mocked(requireUser).mockResolvedValueOnce(bob);
    expect((await (await testDelivery()).json()).data.delivered).toBe(true);
    expect(messages.map((message) => message.chat_id)).toEqual([String(chat), String(chat), String(chat + 1)]);

    const suppressed = await newNotice("Suppressed QA");
    const hour = new Date().getUTCHours();
    await updateChannel(alice.id, { isActive: false });
    expect((await dispatchNotification(alice.id, suppressed.id, "UTC")).suppressed).toBe("inactive");
    await updateChannel(alice.id, { isActive: true, quietStartHour: hour, quietEndHour: (hour + 1) % 24 });
    expect((await dispatchNotification(alice.id, suppressed.id, "UTC")).suppressed).toBe("quiet-hours");
    expect(messages).toHaveLength(3);

    await updateChannel(alice.id, { quietStartHour: 0, quietEndHour: 0 });
    const timeout = await newNotice("Timeout QA");
    expect(await dispatchNotification(alice.id, timeout.id)).toEqual({ delivered: false, suppressed: null });
    expect((await dispatchNotification(alice.id, timeout.id)).suppressed).toBe("duplicate");
    expect(messages).toHaveLength(4);
  });

  it("uses the linked owner's local summary and makes task callbacks private, expiring, and idempotent", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      const now = new Date("2026-11-15T18:00:00.000Z");
      vi.setSystemTime(now);
      const [alice, bob] = await Promise.all([createUser(), createUser()]);
      await prisma.user.update({ where: { id: alice.id }, data: { timezone: "Asia/Jakarta" } });
      const chat = randomInt(100_000_000, 2_147_483_644);
      await update(chat, await startCommand(alice, chat));
      const firstMenu = messages.at(-1)!.reply_markup!.inline_keyboard.flat();
      expect(firstMenu.map(({ text }) => text)).toEqual(["Ringkasan Trading", "Tugas Hari Ini"]);
      await update(chat + 1, await startCommand(bob, chat + 1));
      await updateChannel(alice.id, { isActive: false, quietStartHour: 0, quietEndHour: 23 });
      const project = await prisma.project.create({ data: { userId: alice.id, name: "Telegram QA", initialCapital: 200 } });
      const account = await prisma.tradingAccount.create({ data: { userId: alice.id, projectId: project.id, name: "QA" } });
      await prisma.accountTransaction.create({
        data: { userId: alice.id, accountId: account.id, type: "REALIZED_PNL", amount: 42, occurredAt: now },
      });

      const getTask = async (userId: string, timezone: string, plan: string) => {
        const row = await prisma.dailyPlan.create({
          data: {
            userId, date: new Date(localDateKey(now, timezone)),
            activities: { create: { requestId: randomUUID(), plan, kind: "GENERAL", actualNotes: "Catatan tetap ada" } },
          }, include: { activities: true },
        });
        return row.activities[0]!;
      };
      const aliceTask = await getTask(alice.id, "Asia/Jakarta", "Agenda privat Alice");
      const bobTask = await getTask(bob.id, "UTC", "Agenda privat Bob");

      await update(chat, "/ringkasan");
      const expected = await weeklySummary(alice.id, now);
      expect(messages.at(-1)).toMatchObject({
        chat_id: String(chat), text: expect.stringContaining(fmtUSDdelta(expected.realizedPnl)),
        reply_markup: { inline_keyboard: [[{ url: "https://journal.example.test/dashboard" }], [{ text: "Menu Utama" }]] },
      });
      await update(chat + 1, "/ringkasan");
      expect(messages.at(-1)?.text).toContain("Belum ada transaksi");
      await update(chat + 2, "/tugas");
      expect(messages.at(-1)?.text).toContain("Hubungkan Telegram");
      const received = messages.length;
      await update(chat, "/tugas", "group");
      expect(messages).toHaveLength(received);

      await update(chat, "/tugas");
      const agenda = messages.at(-1)!;
      expect(agenda.text).toContain("16 Nov 2026");
      expect(agenda.text).toContain("Agenda privat Alice");
      expect(agenda.text).not.toContain("Agenda privat Bob");
      const done = agenda.reply_markup?.inline_keyboard.flat().find((button) => button.text.includes("Tandai selesai"))?.callback_data;
      expect(done).toBeDefined();
      expect(Buffer.byteLength(done!)).toBeLessThanOrEqual(64);
      await click(chat, "sender", done!, "private", chat + 1);
      await click(chat, "group", done!, "group");
      await click(chat + 1, "foreign", done!);
      expect(callbackAnswers).toMatchObject([{ callback_query_id: "foreign", show_alert: true }]);
      expect(await prisma.dailyActivity.findUnique({ where: { id: aliceTask.id } })).toMatchObject({ status: "PENDING" });

      await Promise.all([click(chat, "first", done!), click(chat, "repeat", done!)]);
      expect(callbackAnswers.filter(({ text }) => text === "Tugas ditandai selesai.")).toHaveLength(1);
      expect(callbackAnswers.filter(({ text }) => text === "Tugas sudah selesai.")).toHaveLength(1);
      expect(await prisma.dailyActivity.findUnique({ where: { id: aliceTask.id } }))
        .toMatchObject({ status: "COMPLETED", actualNotes: "Catatan tetap ada" });
      expect(await prisma.auditLog.findMany({ where: { userId: alice.id, entity: "DailyActivity", entityId: aliceTask.id } }))
        .toMatchObject([{ action: "update", after: { status: "COMPLETED" } }]);
      expect(await prisma.dailyActivity.findUnique({ where: { id: bobTask.id } })).toMatchObject({ status: "PENDING" });
      expect(messages.at(-1)?.text).toContain("Agenda privat Alice · Selesai");

      vi.setSystemTime(now.getTime() + 16 * 60_000);
      await click(chat, "expired", done!);
      expect(callbackAnswers.at(-1)).toMatchObject({ callback_query_id: "expired", text: expect.stringContaining("kedaluwarsa"), show_alert: false });
      expect(messages.at(-1)?.reply_markup?.inline_keyboard.flat().map(({ text }) => text))
        .toEqual(["Ringkasan Trading", "Tugas Hari Ini"]);
      await click(chat, "tasks-from-old-menu", firstMenu[1]!.callback_data!);
      expect(messages.at(-1)?.text).toContain("Agenda privat Alice · Selesai");
    } finally {
      vi.useRealTimers();
    }
  });
});
