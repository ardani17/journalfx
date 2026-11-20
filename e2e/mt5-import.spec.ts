import { randomUUID } from "node:crypto";
import { expect, test, type Locator } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";
import { requireLocalTestDatabase } from "./test-database";

const prisma = new PrismaClient();
test.beforeAll(requireLocalTestDatabase);
test.afterAll(() => prisma.$disconnect());

test("imports MT5 from Journal and Settings with localized feedback", async ({ page, baseURL }) => {
  const user = await prisma.user.create({
    data: { googleSubject: randomUUID(), email: "mt5-verification@example.test", name: "MT5 QA" },
  });
  try {
    const project = await prisma.project.create({ data: { userId: user.id, name: "MT5 QA", initialCapital: 200 } });
    await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "Akun Impor" } });
    const value = await signSession({ sub: user.id, email: user.email, name: user.name });
    await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value, httpOnly: true }]);

    async function submit(button: Locator, endpoint: string) {
      const result = page.waitForResponse((response) => response.url().endsWith(endpoint) && response.request().method() === "POST");
      await button.click();
      return result;
    }

    await page.goto("/journal");
    await page.getByRole("button", { name: "Impor", exact: true }).click();
    const dialog = page.getByRole("dialog", { name: "Impor Riwayat MT5" });
    const importButton = dialog.getByRole("button", { name: "Impor", exact: true });
    const file = dialog.getByLabel("Berkas XLSX");
    await file.setInputFiles({ name: "rusak.xlsx", mimeType: "application/octet-stream", buffer: Buffer.from("broken workbook") });
    expect((await submit(importButton, "/api/trades/import")).status()).toBe(400);
    await expect(dialog.getByRole("alert")).toContainText(/XLSX|laporan/i);
    await file.setInputFiles("tests/fixtures/mt5-history.xlsx");
    expect(await (await submit(importButton, "/api/trades/import")).json()).toMatchObject({ ok: true, data: { imported: 2 } });
    await expect(dialog.getByRole("status")).toContainText("2 posisi baru");

    await page.goto("/settings");
    const sync = page.getByRole("button", { name: "Sinkronkan", exact: true });
    const report = page.getByLabel("Berkas XLSX");
    await report.setInputFiles("tests/fixtures/mt5-history-overlap.xlsx");
    expect(await (await submit(sync, "/api/integrations/mt5/sync")).json()).toMatchObject({ ok: true, data: { imported: 1, duplicates: 1 } });
    await report.setInputFiles("tests/fixtures/mt5-cashflows.xlsx");
    expect(await (await submit(sync, "/api/integrations/mt5/sync")).json()).toMatchObject({
      ok: true, data: { imported: 0, depositsImported: 1, withdrawalsImported: 1, feesImported: 1 },
    });
    await expect(page.getByText(/1 setoran, 1 penarikan/).first()).toBeVisible();
    const ledger = await prisma.accountTransaction.findMany({ where: { userId: user.id } });
    const count = (type: string) => ledger.filter((entry) => entry.type === type).length;
    expect([count("REALIZED_PNL"), count("DEPOSIT"), count("WITHDRAWAL"), count("FEE")]).toEqual([3, 1, 1, 1]);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
