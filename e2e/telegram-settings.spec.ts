import { randomInt, randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const prisma = new PrismaClient();

test.beforeAll(requireLocalTestDatabase);
test.afterAll(() => prisma.$disconnect());

test("preserves the verified Telegram connection while editing the pairing input", async ({ page, baseURL }, testInfo) => {
  const chatId = String(randomInt(100_000_000, 2_147_483_646));
  const user = await prisma.user.create({
    data: {
      googleSubject: randomUUID(), email: "telegram-settings@example.test", name: "Telegram QA",
      projects: { create: { name: "Telegram QA", initialCapital: 200 } },
      notificationChannel: { create: { telegramChatId: chatId } },
    },
  });
  try {
    await page.route("**/api/notifications/channels", async (route) => {
      if (route.request().method() === "POST") {
        expect(route.request().postData()).toBeNull();
        await route.fulfill({ json: { ok: true, data: { delivered: true, suppressed: null } } });
      } else {
        await route.fulfill({ json: { ok: true, data: {
          telegramAvailable: true, telegramConnected: true, telegramChatId: chatId,
          isActive: true, quietStartHour: 22, quietEndHour: 7,
        } } });
      }
    });
    await page.context().addCookies([{
      url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
      value: await signSession({ sub: user.id, email: user.email, name: user.name }),
    }]);
    await page.goto("/settings");
    const entered = page.getByLabel("Chat ID Telegram", { exact: true });
    const send = page.getByRole("button", { name: "Kirim Tes" });
    await expect(entered).toHaveValue(chatId);
    await expect(page.getByText("Terhubung", { exact: true })).toBeVisible();
    await entered.fill(String(Number(chatId) + 1));
    await expect(page.getByText(`Chat ID aktif ${chatId}`)).toBeVisible();
    await expect(send).toBeEnabled();
    await expect(page.getByRole("button", { name: "Hubungkan Telegram" })).toBeEnabled();
    await entered.clear();
    await expect(page.getByText("Terhubung", { exact: true })).toBeVisible();
    await send.click();
    await expect(page.getByText("Pesan tes terkirim ke Telegram.")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("telegram-verified-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await entered.scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("telegram-verified-mobile.png") });
    expect(await prisma.notificationChannel.findUnique({ where: { userId: user.id } }))
      .toMatchObject({ telegramChatId: chatId });
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
