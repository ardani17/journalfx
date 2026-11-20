import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { PrismaClient } from "@prisma/client";
import { SESSION_COOKIE, signSession } from "../src/lib/session";

const prisma = new PrismaClient();

async function createJournal() {
  return prisma.$transaction(async (tx) => {
    const user = await tx.user.create({
      data: { googleSubject: `journal-pagination-${randomUUID()}`, email: "journal-pagination@example.test", name: "Pagination" },
    });
    const userId = user.id;
    const { id: projectId } = await tx.project.create({ data: { userId, name: "Jurnal", initialCapital: 100 } });
    const account = await tx.tradingAccount.create({ data: { userId, projectId, name: "Akun Utama" } });
    const otherAccount = await tx.tradingAccount.create({ data: { userId, projectId, name: "Akun Kedua" } });
    const fifty = await tx.strategy.create({ data: { userId, name: "Setup 50" } });
    const fiftyOne = await tx.strategy.create({ data: { userId, name: "Setup 51" } });
    const { id: instrumentId } = await tx.instrument.create({
      data: { ownerId: userId, symbol: "EURUSD", name: "EUR/USD", category: "forex" },
    });

    const entryAt = new Date("2026-11-03T10:00:00Z");
    const trade = {
      userId, accountId: account.id, instrumentId, direction: "LONG" as const, status: "CLOSED" as const,
      lot: 0.01, entryPrice: 1.1, exitPrice: 1.2, realizedPnl: 1, entryAt, exitAt: entryAt, createdAt: entryAt,
    };
    await tx.trade.createMany({
      data: [
        ...Array.from({ length: 201 }, (_, index) => ({
          ...trade,
          // Timestamp ties span pages, so the fixture exercises the final sort key.
          id: `${userId}-${String(index + 1).padStart(3, "0")}`,
          ...(index === 199 ? {
            entryAt: new Date("2026-11-04T10:00:00Z"),
            exitAt: new Date("2026-11-04T10:00:00Z"),
          } : {}),
          strategyId: index < 50 ? fifty.id : index < 101 ? fiftyOne.id : null,
        })),
        { ...trade, realizedPnl: -1 },
        { ...trade, accountId: otherAccount.id },
        { ...trade, accountId: otherAccount.id, status: "OPEN", realizedPnl: null, exitPrice: null, exitAt: null },
      ],
    });
    const ledger = { userId, accountId: account.id, occurredAt: new Date("2026-11-05T10:00:00Z") };
    const feeId = `${userId}-date-fee`;
    await tx.accountTransaction.createMany({ data: [
      { ...ledger, type: "REALIZED_PNL", amount: 10, sourceTradeId: `${userId}-200` },
      { ...ledger, id: feeId, type: "FEE", amount: -2, sourceTradeId: `${userId}-200` },
      { ...ledger, type: "REALIZED_PNL", amount: 20, sourceTradeId: `${userId}-201` },
    ] });
    await tx.accountTransaction.create({ data: { ...ledger, type: "REVERSAL", amount: 2, reversalOfId: feeId } });
    await tx.tradeJournal.createMany({
      data: [
        { tradeId: `${userId}-002`, entryReason: "Alasan saja", postChecklist: { "Sesuai plan": false } },
        { tradeId: `${userId}-003`, entryReason: " ", compliant: false },
        { tradeId: `${userId}-004`, entryReason: "Alasan lengkap", emotionBefore: "calm" },
      ],
    });
    const session = await signSession({ sub: userId, email: user.email, name: user.name });
    return { userId, account, otherAccount, fifty, fiftyOne, session };
  });
}

let journal: Awaited<ReturnType<typeof createJournal>>;
test.beforeAll(async () => { journal = await createJournal(); });
test.afterAll(async () => {
  try {
    if (journal) await prisma.user.delete({ where: { id: journal.userId } });
  } finally {
    await prisma.$disconnect();
  }
});

async function expectResults(page: Page, range: string, count: number) {
  await expect(page.getByText(`Menampilkan ${range} trade`, { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("link")).toHaveCount(count);
}

test("shows saved completion of both psychology and reflection", async ({ page, baseURL }) => {
  await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value: journal.session, httpOnly: true }]);
  const list = `/journal?sort=asc&accountId=${journal.account.id}`;
  await page.goto(list);
  await expect(page.getByRole("columnheader", { name: "Psikologi dan Jurnal" })).toBeVisible();
  const row = (id: string) => page.getByRole("row").filter({
    has: page.locator(`a[href="/journal/${journal.userId}-${id}"]`),
  });
  await expect(row("001")).toContainText("Belum diisi");
  await expect(row("002")).toContainText("Belum diisi");
  await expect(row("003")).toContainText("Belum diisi");
  await expect(row("004")).toContainText("Sudah diisi");

  await row("003").getByRole("link").click();
  await page.getByRole("tab", { name: "Psikologi & Jurnal" }).click();
  const reason = page.locator("#j-entry");
  await reason.fill("Menunggu uji ulang");
  const save = async () => {
    const saved = page.waitForResponse((response) => response.url().endsWith("/journal") && response.request().method() === "PUT");
    await page.getByRole("button", { name: "Simpan Jurnal" }).click();
    expect((await saved).ok()).toBeTruthy();
  };
  await save();
  await page.goto(list);
  await expect(row("003")).toContainText("Sudah diisi");
  await row("003").getByRole("link").click();
  await page.getByRole("tab", { name: "Psikologi & Jurnal" }).click();
  await expect(reason).toHaveValue("Menunggu uji ulang");
  await reason.clear();
  await save();
  await page.goto(list);
  await expect(row("003")).toContainText("Belum diisi");
});

test("applies entry dates to filtered rows, pagination, and KPIs", async ({ page, baseURL }) => {
  await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value: journal.session, httpOnly: true }]);
  const filters = new URLSearchParams({ accountId: journal.account.id, result: "win", sort: "asc", page: "2" });
  await page.goto(`/journal?${filters}`);
  const from = page.getByLabel("Tanggal mulai");
  const to = page.getByLabel("Tanggal akhir");
  await from.fill("2026-11-04");
  await to.fill("2026-11-03");
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expect(page.getByRole("form", { name: "Filter rentang tanggal" }).getByRole("alert"))
    .toContainText("Tanggal akhir harus sama atau setelah tanggal mulai.");

  await to.fill("2026-11-04");
  await page.getByRole("button", { name: "Terapkan" }).click();
  await expectResults(page, "1–1 dari 1", 1);
  await expect(page.getByText("Sampel kecil (1 < 30 trade)", { exact: false })).toBeVisible();
  await expect(page.getByText("+$10,00", { exact: true })).toBeVisible();
  await expect(page.getByRole("table").getByRole("link")).toHaveAttribute("href", `/journal/${journal.userId}-200`);
  expect(new URL(page.url()).searchParams.get("page")).toBe("1");
  await page.reload();
  await expect(from).toHaveValue("2026-11-04");
  await expect(to).toHaveValue("2026-11-04");

  await page.getByRole("button", { name: "Hapus rentang" }).click();
  await expectResults(page, "1–50 dari 201", 50);
  await expect(page.getByLabel("Filter hasil")).toHaveValue("win");
});

for (const viewport of [
  { name: "desktop", width: 1440, height: 900 },
  { name: "mobile", width: 390, height: 844 },
]) {
  test(`preserves date sorting across filtered pages on ${viewport.name}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value: journal.session, httpOnly: true }]);
    const filters = {
      accountId: journal.account.id, status: "CLOSED", strategyId: journal.fiftyOne.id, result: "win", pageSize: "50",
    };
    const params = new URLSearchParams({ ...filters, page: "2", sort: "invalid" });
    const sort = page.getByLabel("Urutan tanggal");
    const date = page.getByRole("columnheader", { name: "Tanggal" });
    const trades = page.getByRole("table").getByRole("link");
    const href = (id: string) => `/journal/${journal.userId}-${id}`;
    await page.goto(`/journal?${params}`);
    await expect(sort).toHaveValue("desc");
    await expect(date).toHaveAttribute("aria-sort", "descending");
    await expect(trades).toHaveAttribute("href", href("051"));

    await sort.selectOption("asc");
    await expectResults(page, "1–50 dari 51", 50);
    await expect(date).toHaveAttribute("aria-sort", "ascending");
    await expect(trades.first()).toHaveAttribute("href", href("051"));
    await expect(trades.last()).toHaveAttribute("href", href("100"));
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ ...filters, page: "1", sort: "asc" });

    await page.getByRole("link", { name: "Berikutnya" }).click();
    await expectResults(page, "51–51 dari 51", 1);
    await expect(trades).toHaveAttribute("href", href("101"));
    await page.reload();
    await expectResults(page, "51–51 dari 51", 1);
    await expect(sort).toHaveValue("asc");
    await expect(trades).toHaveAttribute("href", href("101"));
    await sort.selectOption("desc");
    await expectResults(page, "1–50 dari 51", 50);
    await expect(trades.first()).toHaveAttribute("href", href("101"));
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ ...filters, page: "1", sort: "desc" });

    await page.goto(`/journal?${new URLSearchParams({ accountId: journal.account.id, sort: "desc" })}`);
    await expect(trades.first()).toHaveAttribute("href", href("200"));
  });

  test(`paginates filtered journal trades on ${viewport.name}`, async ({ page, baseURL }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.context().addCookies([{ url: baseURL!, name: SESSION_COOKIE, value: journal.session, httpOnly: true }]);
    const controls = page.getByRole("navigation", { name: "Paginasi jurnal" });
    const previous = controls.getByRole("link", { name: "Sebelumnya" });
    const next = controls.getByRole("link", { name: "Berikutnya" });
    const pageSize = page.getByLabel("Trade per halaman");
    const filter = { status: "CLOSED", result: "win", accountId: journal.account.id };
    const url = (params: Record<string, string> = {}) => `/journal?${new URLSearchParams({ ...filter, ...params })}`;

    await page.goto("/journal");
    await expectResults(page, "1–50 dari 204", 50);
    await expect(pageSize).toHaveValue("50");

    await page.goto(url({ status: "CANCELLED" }));
    await expectResults(page, "0 dari 0", 0);
    await expect(page.getByText("Tidak ada trade yang cocok dengan filter.")).toBeVisible();
    await expect(controls.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Berikutnya" })).toBeDisabled();

    await page.goto(url({ strategyId: journal.fifty.id }));
    await expectResults(page, "1–50 dari 50", 50);
    await expect(controls.getByRole("button", { name: "Sebelumnya" })).toBeDisabled();
    await expect(controls.getByRole("button", { name: "Berikutnya" })).toBeDisabled();

    await page.getByLabel("Filter setup").selectOption(journal.fiftyOne.id);
    await expectResults(page, "1–50 dari 51", 50);
    await expect(page.getByRole("table").getByRole("link").last()).toHaveAttribute("href", `/journal/${journal.userId}-052`);
    await next.click();
    await expectResults(page, "51–51 dari 51", 1);
    await expect(page.getByRole("table").getByRole("link")).toHaveAttribute("href", `/journal/${journal.userId}-051`);
    await expect(controls.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
      ...filter, strategyId: journal.fiftyOne.id, page: "2", pageSize: "50",
    });
    await page.reload();
    await expectResults(page, "51–51 dari 51", 1);
    await previous.click();
    await expectResults(page, "1–50 dari 51", 50);
    await page.goBack();
    await expectResults(page, "51–51 dari 51", 1);
    await page.getByLabel("Filter hasil").selectOption("loss");
    await expectResults(page, "0 dari 0", 0);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
      ...filter, result: "loss", strategyId: journal.fiftyOne.id, page: "1", pageSize: "50",
    });

    await page.goto(url({ page: "2", pageSize: "50" }));
    await expectResults(page, "51–100 dari 201", 50);
    await pageSize.selectOption("100");
    await expectResults(page, "1–100 dari 201", 100);
    await next.click();
    await expectResults(page, "101–200 dari 201", 100);
    await pageSize.selectOption("200");
    await expectResults(page, "1–200 dari 201", 200);
    await next.click();
    await expectResults(page, "201–201 dari 201", 1);
    await expect(page.getByRole("table").getByRole("link")).toHaveAttribute("href", `/journal/${journal.userId}-001`);
    await expect(controls.getByRole("button", { name: "Berikutnya" })).toBeDisabled();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(viewport.width);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ ...filter, page: "2", pageSize: "200" });

    await page.getByLabel("Filter akun").selectOption(journal.otherAccount.id);
    await expectResults(page, "1–1 dari 1", 1);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({
      ...filter, accountId: journal.otherAccount.id, page: "1", pageSize: "200",
    });

    await page.goto(url({ page: "2.5", pageSize: "1000" }));
    await expectResults(page, "1–50 dari 201", 50);
    await expect(pageSize).toHaveValue("50");

    await page.goto(url({ page: "90071992547410", pageSize: "200" }));
    await expectResults(page, "1–200 dari 201", 200);
    await page.goto(url({ page: "3", pageSize: "200" }));
    await expectResults(page, "1–200 dari 201", 200);
    expect(Object.fromEntries(new URL(page.url()).searchParams)).toEqual({ ...filter, page: "1", pageSize: "200" });
  });
}
