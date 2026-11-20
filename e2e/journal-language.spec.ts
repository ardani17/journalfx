import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const prisma = new PrismaClient();
const image = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+j6dYAAAAASUVORK5CYII=", "base64");

test.beforeAll(requireLocalTestDatabase);
test.afterAll(() => prisma.$disconnect());

test("shows Indonesian choices and preserves legacy journal answers", async ({ page, baseURL }, testInfo) => {
  const user = await prisma.user.create({
    data: { googleSubject: randomUUID(), email: "language@example.test", name: "Bahasa QA", timezone: "Asia/Jakarta" },
  });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, name: "Bahasa QA", initialCapital: 200 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "Bahasa QA" } });
    const instrument = await prisma.instrument.create({
      data: { ownerId: user.id, symbol: "EURUSD", name: "EUR/USD", category: "forex", contractSize: 100_000 },
    });
    const trade = await prisma.trade.create({
      data: {
        userId: user.id, accountId: account.id, instrumentId: instrument.id, session: "london",
        direction: "LONG", lot: 0.1, entryPrice: 1.25, entryAt: new Date("2026-11-02T01:00:00Z"),
        executions: { create: { userId: user.id, kind: "ENTRY", quantity: 0.1, price: 1.25, executedAt: new Date("2026-11-02T01:00:00Z") } },
        journal: { create: {
          emotionBefore: "calm", emotionDuring: "legacy-emotion", mistakes: ["Entry dini", "legacy-mistake"],
          postChecklist: { "Sesuai plan": true, "legacy-key": true },
        } },
      },
    });
    const value = await signSession({ sub: user.id, email: user.email, name: user.name });
    await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value, httpOnly: true }]);
    await page.goto(`/journal/${trade.id}`);
    await expect(page.getByRole("heading", { name: /EURUSD · Beli/ })).toBeVisible();
    await expect(page.getByText("Terbuka", { exact: true })).toBeVisible();
    await expect(page.getByText(/2 Nov 2026.*08\.00/)).toBeVisible();
    await page.getByRole("tab", { name: /Eksekusi/ }).click();
    await expect(page.getByText("Pembukaan posisi", { exact: true })).toBeVisible();
    await page.getByRole("tab", { name: "Psikologi dan Jurnal" }).click();
    await expect(page.getByLabel("Emosi Sebelum").locator("option:checked")).toHaveText("Tenang");
    await expect(page.getByLabel("Emosi Saat").locator("option:checked")).toHaveText("Pilihan tersimpan");
    await expect(page.getByLabel("Sesuai rencana", { exact: true })).toBeChecked();
    await expect(page.getByLabel("Masuk terlalu cepat")).toBeChecked();
    await page.getByLabel("Kepercayaan Diri (1–5)").fill("4");
    const saved = page.waitForResponse((response) => response.request().method() === "PUT" && response.url().endsWith("/journal"));
    await page.getByRole("button", { name: "Simpan Jurnal" }).click();
    expect((await saved).ok()).toBeTruthy();
    expect(await prisma.tradeJournal.findUnique({ where: { tradeId: trade.id } })).toMatchObject({
      emotionBefore: "calm", emotionDuring: "legacy-emotion", confidence: 4,
      mistakes: expect.arrayContaining(["Entry dini", "legacy-mistake"]),
      postChecklist: { "Sesuai plan": true, "legacy-key": true },
    });
    await page.screenshot({ path: testInfo.outputPath("journal-indonesian-desktop.png") });
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByLabel("Emosi Sebelum").scrollIntoViewIfNeeded();
    await page.screenshot({ path: testInfo.outputPath("journal-indonesian-mobile.png") });

    const invalid = await page.request.post(`/api/trades/${trade.id}/executions`, {
      data: { kind: "CLOSE", quantity: "0.20", price: "1.255" },
    });
    expect(invalid.status()).toBe(400);
    expect((await invalid.json()).error).toContain("Jumlah penutupan");
    await page.getByRole("tab", { name: "Ringkasan" }).click();
    await page.getByLabel("Harga Penutupan", { exact: true }).fill("1.255");
    await page.getByRole("button", { name: "Tutup Posisi", exact: true }).click();
    await expect(page.getByText("Ditutup", { exact: true })).toBeVisible();

    await page.getByRole("tab", { name: /Lampiran/ }).click();
    await expect(page.getByRole("heading", { name: "Tangkapan Layar Grafik" })).toBeVisible();
    await page.locator('input[data-kind="ENTRY"]').setInputFiles({ name: "uji.png", mimeType: "image/png", buffer: image });
    await expect(page.getByRole("img", { name: "Saat pembukaan · uji.png" })).toBeVisible();
    page.once("dialog", (dialog) => dialog.accept());
    await page.getByRole("button", { name: "Hapus lampiran Saat pembukaan" }).click();
    await expect(page.getByText(/Belum ada tangkapan layar/)).toBeVisible();
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
