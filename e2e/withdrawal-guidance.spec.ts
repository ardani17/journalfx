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
  test(`explains blocked withdrawals and guides request and reconciliation on ${viewport.name}`, async ({ page, baseURL }, testInfo) => {
    const key = randomUUID();
    const user = await prisma.user.create({ data: {
      googleSubject: `withdrawal-${key}`, email: `withdrawal-${key}@example.test`, name: "Withdrawal QA",
    } });
    const fxId = `withdrawal-qa-${key}`;
    try {
      const project = await prisma.project.create({ data: { userId: user.id, name: "Jurnal", initialCapital: 100 } });
      const account = { userId: user.id, projectId: project.id };
      const inactive = await prisma.tradingAccount.create({ data: { ...account, name: "Nonaktif", isActive: false } });
      const usd = await prisma.tradingAccount.create({ data: { ...account, name: "Akun USD" } });
      const cent = await prisma.tradingAccount.create({ data: { ...account, name: "Akun USC", currency: "USC" } });
      const occurredAt = new Date();
      await prisma.accountTransaction.create({ data: { userId: user.id, accountId: inactive.id, type: "REALIZED_PNL", amount: 100, occurredAt } });
      await prisma.exchangeRate.create({ data: { id: fxId, pair: "USDIDR", source: "bi-jisdor", rate: 18000, at: occurredAt } });
      await page.setViewportSize(viewport);
      await page.context().addCookies([{
        url: baseURL!, name: SESSION_COOKIE, httpOnly: true,
        value: await signSession({ sub: user.id, email: user.email, name: user.name }),
      }]);

      await page.goto("/withdrawals");
      const request = page.getByRole("button", { name: "Ajukan WD" });
      await expect(request).toBeDisabled();
      await expect(page.getByText(/Kebutuhan bulanan belum disetel/)).toBeVisible();
      await expect(page.getByText(/Tarik dana secara manual di broker/)).toBeVisible();
      await page.screenshot({ path: testInfo.outputPath(`withdrawal-blocked-${viewport.name}.png`), fullPage: true });

      await page.getByRole("button", { name: "Edit Aturan" }).click();
      const rules = page.getByRole("dialog", { name: "Edit Aturan WD Dinamis" });
      await rules.getByLabel("Kebutuhan Bulanan (IDR)").fill("100000000");
      await rules.getByRole("button", { name: "Simpan Aturan" }).click();
      await expect(rules).toBeHidden();
      await expect(page.getByText(/Belum ada akun sumber aktif dengan sisa saldo minimal/)).toBeVisible();
      await expect(request).toBeDisabled();

      await prisma.accountTransaction.createMany({ data: [
        { userId: user.id, accountId: usd.id, type: "DEPOSIT", amount: 60, occurredAt },
        { userId: user.id, accountId: cent.id, type: "DEPOSIT", amount: 499.75, currency: "USC", occurredAt },
      ] });
      await page.reload();
      await expect(request).toBeEnabled();
      await request.click();
      const form = page.getByRole("dialog", { name: "Ajukan Withdrawal" });
      const source = form.getByLabel("Akun Sumber");
      const amount = form.getByLabel("Jumlah (USD)");
      await expect(source.getByRole("option")).toHaveCount(2);
      await source.selectOption(usd.id);
      await expect(amount).toHaveAttribute("max", "50.00");
      await amount.fill("20.00");
      await source.selectOption(cent.id);
      await expect(amount).toHaveValue("4.99");
      await expect(amount).toHaveAttribute("max", "4.99");
      await page.screenshot({ path: testInfo.outputPath(`withdrawal-request-${viewport.name}.png`) });

      for (const [accountId, amountUsd, reason] of [
        [usd.id, "51", "melebihi rekomendasi"],
        [cent.id, "5", "Saldo yang tersedia di akun sumber tidak mencukupi"],
      ]) {
        const response = await page.request.post("/api/withdrawals", {
          headers: { origin: baseURL! }, data: { accountId, amountUsd },
        });
        expect(response.status()).toBe(400);
        expect((await response.json()).error).toContain(reason);
      }
      await form.getByRole("button", { name: "Ajukan", exact: true }).click();
      await expect(form).toBeHidden();
      const history = page.getByRole("table");
      await expect(history.getByText("REQUESTED", { exact: true })).toBeVisible();

      await history.getByRole("button", { name: "Selesai", exact: true }).click();
      const reconciliation = page.getByRole("dialog", { name: /Selesaikan WD/ });
      await reconciliation.getByLabel("Kurs USDIDR").fill("18001.2345");
      await reconciliation.getByLabel("Dana Diterima (IDR)").fill("89555.55");
      await reconciliation.getByLabel("Biaya Transfer (IDR)").fill("123.45");
      await reconciliation.getByRole("button", { name: "Selesaikan" }).click();
      await expect(history.getByText("COMPLETED", { exact: true })).toBeVisible();
      const withdrawal = await prisma.withdrawal.findFirstOrThrow({ where: { userId: user.id }, include: { transactions: true } });
      expect(withdrawal.accountId).toBe(cent.id);
      expect([withdrawal.amountUSD, withdrawal.fxRate, withdrawal.receivedAmount, withdrawal.fees].map(String))
        .toEqual(["4.99", "18001.2345", "89555.55", "123.45"]);
      expect(withdrawal.transactions.map((row) => [row.currency, row.amount.toString()])).toEqual([["USC", "-499"]]);
    } finally {
      await prisma.user.delete({ where: { id: user.id } });
      await prisma.exchangeRate.deleteMany({ where: { id: fxId } });
    }
  });
}
