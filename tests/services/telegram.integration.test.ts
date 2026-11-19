import { randomInt, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { channelConfig, dispatchNotification, telegramWebhookSecret, updateChannel } from "@/server/services/notify-channels";
import { GET as getBot, POST as createLink } from "@/app/api/notifications/channels/telegram-link/route";
import { POST as testDelivery, PUT as updatePreferences } from "@/app/api/notifications/channels/route";
import { POST as webhook } from "@/app/api/integrations/telegram/webhook/route";

vi.mock("@/server/auth", () => ({ requireUser: vi.fn() }));

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("Telegram linking and outbound delivery", () => {
  const userIds: string[] = [];
  const messages: { chat_id: string; text: string }[] = [];

  beforeAll(() => {
    if (existsSync(".env")) process.loadEnvFile(".env");
  });

  beforeEach(() => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "qa-bot-token");
    messages.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string, init: RequestInit) => {
      if (input.endsWith("/getMe")) return Response.json({ ok: true, result: { username: "Horizon_QA_bot" } });
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
    expect(await (await getBot()).json()).toEqual({ ok: true, data: { url: "https://t.me/Horizon_QA_bot" } });
    vi.mocked(requireUser).mockResolvedValueOnce(user);
    const invalid = await createLink(new Request("https://example.test/api/notifications/channels/telegram-link", {
      method: "POST", body: JSON.stringify({ chatId: "@username" }),
    }));
    expect(invalid.status).toBe(400);
    expect(telegramWebhookSecret()).toMatch(/^[a-f0-9]{64}$/);
    await update(chat, "/id", "group");
    expect(messages).toHaveLength(0);
    await update(chat, "/id");
    expect(messages).toEqual([{ chat_id: String(chat), text: expect.stringContaining(String(chat)) }]);
    expect((await channelConfig(user.id)).telegramChatId).toBeNull();
    await update(chat, await startCommand(user, chat));
    expect((await channelConfig(user.id)).telegramChatId).toBe(String(chat));
  });

  it("sends to the owner once, honors settings, and holds the claim after a timeout", async () => {
    const [alice, bob] = await Promise.all([createUser(), createUser()]);
    const chat = randomInt(100_000_000, 2_147_483_646);
    await update(chat, await startCommand(alice, chat));
    await update(chat + 1, await startCommand(bob, chat + 1));
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
});
