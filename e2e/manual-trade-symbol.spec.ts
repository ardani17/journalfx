import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`adds and reuses a symbol during manual trade entry on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    const key = randomUUID();
    const symbol = `TEST-${key.slice(0, 8).toUpperCase()}`;
    const user = await prisma.user.create({ data: {
      googleSubject: `manual-symbol-${key}`, email: `manual-symbol-${key}@example.test`, name: "Manual Trade QA",
    } });
    try {
      const project = await prisma.project.create({ data: { userId: user.id, name: "Jurnal", initialCapital: 100 } });
      const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "Akun Utama" } });
      const hasSharedOptions = await prisma.instrument.count({ where: { ownerId: null } }) > 0;
      await page.setViewportSize(viewport);
      await page.context().addCookies([{
        url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
        value: await signSession({ sub: user.id, email: user.email, name: user.name }),
      }]);

      await page.goto("/journal/new");
      const instruments = page.getByLabel("Instrumen", { exact: true });
      if (!hasSharedOptions) await expect(instruments).toHaveValue("");
      await page.getByLabel("Lot", { exact: true }).fill("0.10");
      await page.getByLabel("Harga Entry", { exact: true }).fill("1.245678");
      await page.getByLabel("Alasan Entry", { exact: true }).fill("Catatan QA");

      const open = page.getByRole("button", { name: "Tambah simbol", exact: true });
      await open.click();
      const dialog = page.getByRole("dialog", { name: "Tambah simbol" });
      const code = dialog.getByLabel("Kode simbol");
      const save = dialog.getByRole("button", { name: "Simpan simbol" });
      await code.fill("  ");
      await save.click();
      await expect(dialog.getByRole("alert")).toHaveText("Kode simbol wajib diisi");
      await dialog.getByRole("button", { name: "Batal" }).click();
      await expect(dialog).toBeHidden();
      await expect(page.getByLabel("Alasan Entry", { exact: true })).toHaveValue("Catatan QA");

      await open.click();
      await code.fill(` ${symbol.toLowerCase()} `);
      await page.screenshot({ path: testInfo.outputPath(`manual-symbol-${viewport.name}.png`) });
      await save.click();
      await expect(dialog).toBeHidden();
      await expect(instruments.locator("option:checked")).toHaveText(symbol);
      const selectedId = await instruments.inputValue();
      await expect(page.getByLabel("Lot", { exact: true })).toHaveValue("0.10");
      await expect(page.getByLabel("Harga Entry", { exact: true })).toHaveValue("1.245678");

      await open.click();
      await code.fill(symbol);
      await save.click();
      await expect(dialog).toBeHidden();
      await expect(instruments.getByRole("option", { name: symbol, exact: true })).toHaveCount(1);
      await expect(instruments).toHaveValue(selectedId);

      await page.getByRole("button", { name: "Simpan Trade", exact: true }).click();
      await expect(page).toHaveURL(/\/journal\/(?!new$)[^/]+$/);
      const trade = await prisma.trade.findFirstOrThrow({ where: { userId: user.id }, include: { journal: true, instrument: true } });
      expect(trade).toMatchObject({ accountId: account.id, instrumentId: selectedId, journal: { entryReason: "Catatan QA" } });
      expect(trade.lot.toString()).toBe("0.1");
      expect(trade.entryPrice.toString()).toBe("1.245678");
      expect(trade.instrument.pricePrecision).toBe(6);

      await page.goto("/journal/new");
      await instruments.selectOption({ label: symbol });
      await expect(instruments).toHaveValue(selectedId);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
    }
  });
}
