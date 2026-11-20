import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const prisma = new PrismaClient();

test.beforeAll(requireLocalTestDatabase);
test.afterAll(() => prisma.$disconnect());

async function withJournal(page: Page, baseURL: string, run: (userId: string) => Promise<void>) {
  const user = await prisma.user.create({
    data: { googleSubject: randomUUID(), email: "historical-review@example.test", name: "Review QA", timezone: "Asia/Jakarta" },
  });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, name: "Review QA", initialCapital: 200 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "Review QA" } });
    await prisma.accountTransaction.createMany({ data: [
      { userId: user.id, accountId: account.id, type: "REALIZED_PNL", occurredAt: new Date("2026-11-02T03:00:00Z"), amount: -10 },
      { userId: user.id, accountId: account.id, type: "REALIZED_PNL", occurredAt: new Date("2026-11-03T03:00:00Z"), amount: 25 },
      { userId: user.id, accountId: account.id, type: "REALIZED_PNL", occurredAt: new Date("2026-11-04T03:00:00Z"), amount: 0 },
      { userId: user.id, accountId: account.id, type: "REALIZED_PNL", occurredAt: new Date("2026-11-11T03:00:00Z"), amount: 20 },
    ] });
    const value = await signSession({ sub: user.id, email: user.email, name: user.name });
    await page.context().addCookies([{ url: baseURL, name: SESSION_COOKIE, value, httpOnly: true }]);
    await run(user.id);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
}

test("selects historical days, weeks, and months and keeps each review separate", async ({ page, baseURL }, testInfo) => {
  await withJournal(page, baseURL!, async (userId) => {
    async function choose(kind: "DAILY" | "WEEKLY" | "MONTHLY", date: string, range: string) {
      await page.goto("/reports");
      await page.getByLabel("Jenis review").selectOption(kind);
      await page.getByLabel(kind === "MONTHLY" ? "Bulan" : "Tanggal", { exact: true }).fill(date);
      await expect(page.locator("[aria-live=polite]").filter({ hasText: range })).toBeVisible();
      await page.getByRole("button", { name: "Buka Review" }).click();
      await expect(page.getByRole("main").getByText(range, { exact: false }).first()).toBeVisible();
    }

    await choose("WEEKLY", "2026-11-04", "2 Nov 2026 – 8 Nov 2026");
    const initial = await page.request.get("/api/reviews?kind=WEEKLY&date=2026-11-04");
    expect(await initial.json()).toMatchObject({ ok: true, data: null });
    expect(await prisma.periodReview.count({ where: { userId } })).toBe(0);
    await expect(page.getByText("+$15,00", { exact: true })).toBeVisible();
    await page.getByLabel("Refleksi").fill("Catatan minggu pertama");
    await page.getByRole("button", { name: "Simpan Catatan" }).click();
    await expect(page.getByRole("status")).toHaveText("Catatan tersimpan.");
    await page.reload();
    await expect(page.getByLabel("Refleksi")).toHaveValue("Catatan minggu pertama");
    await page.getByRole("button", { name: "Tutup Periode" }).click();
    await expect(page.getByText("Transaksi / P&L saat ditutup", { exact: true })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("historical-review-desktop.png") });

    await choose("WEEKLY", "2026-11-11", "9 Nov 2026 – 15 Nov 2026");
    await expect(page.getByLabel("Refleksi")).toHaveValue("");
    await expect(page.getByText("+$20,00", { exact: true })).toBeVisible();
    await choose("DAILY", "2026-11-02", "2 Nov 2026");
    await expect(page.getByText("−$10,00", { exact: true })).toBeVisible();
    await choose("MONTHLY", "2026-11", "1 Nov 2026 – 30 Nov 2026");
    await expect(page.getByText("+$35,00", { exact: true })).toBeVisible();

    await page.goto("/reports");
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: testInfo.outputPath("review-picker-mobile.png") });
    await page.getByRole("link", { name: "2 Nov 2026 – 8 Nov 2026", exact: true }).click();
    await expect(page.getByLabel("Refleksi")).toHaveValue("Catatan minggu pertama");
    await expect(page.getByLabel("Refleksi")).toBeDisabled();
  });
});

test("connects calendar status, live P&L, and review snapshots", async ({ page, baseURL }, testInfo) => {
  await withJournal(page, baseURL!, async (userId) => {
    const { id: projectId } = await prisma.project.findFirstOrThrow({ where: { userId }, select: { id: true } });
    await prisma.periodReview.createMany({ data: [
      { userId, projectId, kind: "DAILY", status: "OPEN", periodStart: new Date("2026-11-02T17:00:00Z"), periodEnd: new Date("2026-11-03T17:00:00Z") },
      { userId, projectId, kind: "DAILY", status: "CLOSED", periodStart: new Date("2026-11-03T17:00:00Z"), periodEnd: new Date("2026-11-04T17:00:00Z") },
    ] });
    await page.goto("/calendar?m=2026-11");
    const cell = (day: string) => page.locator(`#day-2026-11-${day}`);
    await expect(cell("02")).toContainText("Belum direview");
    await expect(cell("03")).toContainText("Draf");
    await expect(cell("04")).toContainText("Impas");
    await expect(cell("04")).toContainText("Selesai");
    await expect(cell("05")).toContainText("Tanpa transaksi");
    await page.screenshot({ path: testInfo.outputPath("calendar-review-desktop.png") });
    await cell("02").click();
    await expect(page.getByText("−$10,00", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Tutup Periode" }).click();
    await expect(page.getByText("Transaksi / P&L saat ditutup", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke Kalender" }).click();
    await expect(page).toHaveURL(/m=2026-11&date=2026-11-02#day-2026-11-02$/);
    await expect(cell("02")).toContainText("Selesai");
    await page.reload();
    await expect(cell("02")).toContainText("Selesai");

    await page.getByRole("navigation", { name: "Kalender dan review" }).getByRole("link", { name: "Review Periodik" }).click();
    await expect(page.getByRole("row").filter({ hasText: "2 Nov 2026" })).toContainText("−$10,00");
    await expect(page.getByLabel("Tanggal", { exact: true })).toHaveValue("2026-11-02");
    await page.getByLabel("Jenis review").selectOption("WEEKLY");
    await page.getByRole("button", { name: "Buka Review" }).click();
    await expect(page.getByRole("heading", { name: "P&L Neto Harian" })).toBeVisible();
    await expect(page.getByRole("link", { name: "2 Nov 2026", exact: true }).locator("..")).toContainText("Rugi · −$10,00");
    await page.getByRole("link", { name: "2 Nov 2026", exact: true }).click();
    await expect(page.getByText("Transaksi / P&L saat ditutup", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Kembali ke Kalender" }).click();
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(cell("02")).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("calendar-review-mobile.png") });

    await prisma.user.update({ where: { id: userId }, data: { timezone: "UTC" } });
    await page.goto("/calendar?m=2026-11");
    await expect(cell("03")).not.toContainText("Selesai");
    await cell("03").click();
    await expect(page.getByRole("heading", { name: "Review Harian" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Simpan Catatan" })).toBeVisible();
  });
});
