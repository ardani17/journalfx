import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const prisma = new PrismaClient();
test.afterAll(() => prisma.$disconnect());

test("creates and selects a strategy without losing the trade draft", async ({ page, baseURL }) => {
  const key = randomUUID();
  const user = await prisma.user.create({ data: {
    googleSubject: `manual-strategy-${key}`,
    email: `manual-strategy-${key}@example.test`,
    name: "Manual Strategy QA",
  } });

  try {
    const project = await prisma.project.create({ data: { userId: user.id, name: "Jurnal", initialCapital: 100 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "Akun Utama" } });
    const instrument = await prisma.instrument.create({ data: {
      ownerId: user.id,
      symbol: `TEST-${key.slice(0, 8).toUpperCase()}`,
      name: "Instrumen QA",
      category: "metal",
    } });
    await page.context().addCookies([{
      url: baseURL!,
      name: SESSION_COOKIE,
      httpOnly: true,
      value: await signSession({ sub: user.id, email: user.email, name: user.name }),
    }]);

    await page.goto("/journal/new");
    const strategies = page.getByLabel("Strategi", { exact: true });
    const open = page.getByRole("button", { name: "Tambah strategi", exact: true });
    const dialog = page.getByRole("dialog", { name: "Tambah strategi" });
    const name = dialog.getByLabel("Nama strategi");
    const save = dialog.getByRole("button", { name: /^(Simpan strategi|Menyimpan…)$/ });
    const cancel = dialog.getByRole("button", { name: "Batal", exact: true });
    const lot = page.getByLabel("Lot", { exact: true });
    const entry = page.getByLabel("Harga Pembukaan", { exact: true });
    const reason = page.getByLabel("Alasan Membuka Posisi", { exact: true });
    const strategyName = "Breakout sesi London";

    await expect(strategies.getByRole("option")).toHaveCount(1);
    await page.getByLabel("Instrumen", { exact: true }).selectOption(instrument.id);
    await lot.fill("0.10");
    await entry.fill("2500.50");
    await reason.fill("Catatan QA");

    await open.click();
    await name.fill("Setup batal");
    await cancel.click();
    await expect(dialog).toBeHidden();
    await expect(strategies).toHaveValue("");
    await expect(reason).toHaveValue("Catatan QA");

    await open.click();
    await name.fill(" x ");
    await save.click();
    await expect(dialog.getByRole("alert")).toHaveText("Nama strategi minimal 2 karakter");
    await name.fill(` ${strategyName} `);

    let releaseRequest!: () => void;
    const release = new Promise<void>((resolve) => { releaseRequest = resolve; });
    await page.route("**/api/strategies", async (route) => {
      await release;
      await route.abort();
    }, { times: 1 });
    try {
      await save.click();
      await expect(save).toBeDisabled();
      await expect(cancel).toBeDisabled();
      await page.keyboard.press("Escape");
      await expect(dialog).toBeVisible();
    } finally {
      releaseRequest();
    }

    await expect(dialog.getByRole("alert")).toHaveText("Tidak dapat menghubungi server");
    await expect(name).toHaveValue(` ${strategyName} `);
    await save.click();
    await expect(dialog).toBeHidden();
    await expect(strategies.locator("option:checked")).toHaveText(strategyName);
    const strategyId = await strategies.inputValue();
    expect(strategyId).not.toBe("");
    await expect(lot).toHaveValue("0.10");
    await expect(entry).toHaveValue("2500.50");
    await expect(reason).toHaveValue("Catatan QA");

    await open.click();
    await name.fill(strategyName);
    await save.click();
    await expect(dialog.getByRole("alert")).toHaveText("Nama strategi sudah dipakai");
    await expect(name).toHaveValue(strategyName);
    await cancel.click();
    await expect(strategies).toHaveValue(strategyId);
    await expect(strategies.getByRole("option", { name: strategyName, exact: true })).toHaveCount(1);

    await page.getByRole("button", { name: "Simpan Transaksi", exact: true }).click();
    await expect(page).toHaveURL(/\/journal\/(?!new$)[^/]+$/);
    const trade = await prisma.trade.findFirstOrThrow({ where: { userId: user.id }, include: { journal: true } });
    expect(trade).toMatchObject({ accountId: account.id, strategyId, journal: { entryReason: "Catatan QA" } });

    await page.goto("/journal/new");
    await strategies.selectOption({ label: strategyName });
    await expect(strategies).toHaveValue(strategyId);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
  }
});
