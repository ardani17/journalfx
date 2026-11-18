import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { prisma } from "@/server/db";
import { createTrade, addExecution, getTrade, listTrades } from "@/server/services/trades";
import { computeBalance, reverseTransaction } from "@/server/services/ledger";
import { dailyPnl, coreMetrics } from "@/server/services/analytics";
import { allocateProfit, budgetOverview, payDebt } from "@/server/services/finance";
import { completeWithdrawal, getRecommendation, listWithdrawals, requestWithdrawal } from "@/server/services/withdrawals";
import { closeReview, correctReview, getOrCreateReview, saveReviewFields } from "@/server/services/reviews";
import { importStatement } from "@/server/services/imports";
import { mt5Sync, mt5SyncStatus } from "@/server/services/mt5-sync";
import { findOrCreateGoogleUser } from "@/server/services/users";
import { readAttachment } from "@/server/services/attachments";
import { getAccount, updateAccount } from "@/server/services/accounts";

vi.mock("@/server/services/jisdor", () => ({
  getJisdorQuote: async () => ({ rate: "18252", at: new Date().toISOString(), source: "bi-jisdor", status: "latest" }),
}));

// Explicit opt-in: temporary, uniquely named fixtures only; deleted by their IDs.
describe.skipIf(process.env.RUN_DB_TESTS !== "1")("PostgreSQL financial integration", () => {
  const fixtureIds: string[] = [];
  let instrumentId: string;
  let symbol: string;
  beforeAll(async () => {
    if (existsSync(".env")) process.loadEnvFile(".env");
    symbol = `QA${randomUUID().slice(0, 8).replace(/-/g, "").toUpperCase()}`;
    const instrument = await prisma.instrument.create({ data: { symbol, name: "Temporary verification fixture", category: "metal", contractSize: 100 } });
    instrumentId = instrument.id;
  });
  afterAll(async () => {
    if (fixtureIds.length) await prisma.user.deleteMany({ where: { id: { in: fixtureIds } } });
    if (instrumentId) await prisma.instrument.delete({ where: { id: instrumentId } });
    await prisma.$disconnect();
  });
  async function fixture() {
    const user = await prisma.user.create({ data: { email: `qa-${randomUUID()}@example.invalid`, name: "Temporary QA", googleSubject: `qa-${randomUUID()}` } });
    fixtureIds.push(user.id);
    const project = await prisma.project.create({ data: { userId: user.id, name: "QA", initialCapital: 200 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "QA" } });
    await prisma.accountTransaction.create({ data: { userId: user.id, accountId: account.id, type: "DEPOSIT", amount: 200, occurredAt: new Date("2026-01-01") } });
    return { userId: user.id, projectId: project.id, accountId: account.id };
  }

  it("provisions one empty private journal per Google subject even with concurrent sign-ins or shared email text", async () => {
    const identity = { subject: `google-${randomUUID()}`, name: "OAuth Tester", email: "same@example.com" };
    const owners = await Promise.all([findOrCreateGoogleUser(identity), findOrCreateGoogleUser(identity)]);
    const first = owners[0]!;
    fixtureIds.push(first.id);
    expect(owners[1]?.id).toBe(first.id);
    const second = await findOrCreateGoogleUser({ ...identity, subject: `google-${randomUUID()}` });
    fixtureIds.push(second.id);
    expect(second.id).not.toBe(first.id);
    expect((await findOrCreateGoogleUser({ ...identity, email: "changed@example.com" })).id).toBe(first.id);

    const workspace = await prisma.user.findUniqueOrThrow({ where: { id: first.id }, include: {
      projects: { include: { accounts: true, buckets: true } }, riskSettings: true,
    } });
    expect(workspace.projects).toHaveLength(1);
    expect(workspace.projects[0]?.accounts).toHaveLength(1);
    expect(workspace.projects[0]?.buckets).toHaveLength(6);
    expect(workspace.riskSettings).not.toBeNull();
    expect((await computeBalance(first.id)).balance.isZero()).toBe(true);

    const accountId = workspace.projects[0]!.accounts[0]!.id;
    const trade = await createTrade(first.id, { accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: new Date().toISOString(), commission: 0, swap: 0, fees: 0 });
    const attachment = await prisma.tradeAttachment.create({ data: {
      tradeId: trade.id, kind: "ENTRY", fileName: "private.png", mimeType: "image/png", sizeBytes: 12,
      storagePath: "test-only-do-not-read/private.png",
    } });
    await expect(getTrade(second.id, trade.id)).rejects.toMatchObject({ status: 404 });
    await expect(getAccount(second.id, accountId)).rejects.toMatchObject({ status: 404 });
    await expect(updateAccount(second.id, accountId, { name: "Foreign edit" })).rejects.toMatchObject({ status: 404 });
    await expect(readAttachment(second.id, attachment.id)).rejects.toMatchObject({ status: 403 });
    expect((await listTrades(second.id, { limit: 10, offset: 0 })).total).toBe(0);
  });

  it("recognizes each partial close in its own period, including net entry costs", async () => {
    const f = await fixture();
    const trade = await createTrade(f.userId, { accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: "2026-11-01T00:00:00Z", commission: 0.5, swap: 0, fees: 0 });
    await addExecution(f.userId, trade.id, { kind: "PARTIAL_CLOSE", quantity: 0.04, price: 2001,
      commission: 0, swap: 0, fees: 0, executedAt: "2026-11-02T00:00:00Z" });
    await addExecution(f.userId, trade.id, { kind: "CLOSE", quantity: 0.06, price: 2002,
      commission: 0, swap: 0, fees: 0, executedAt: "2026-11-03T00:00:00Z" });
    expect((await computeBalance(f.userId)).balance.toNumber()).toBe(215.5);
    const days = await dailyPnl(f.userId, new Date("2026-11-01T17:00:00Z"), new Date("2026-11-03T17:00:00Z"));
    expect(days.map((d) => d.pnl)).toEqual([3.8, 11.7]);
    const firstDay = await coreMetrics(f.userId, { from: new Date("2026-11-02"), to: new Date("2026-11-03") });
    expect(firstDay.netPnl.toNumber()).toBe(3.8);
  });

  it("completes a withdrawal once and prevents concurrent/overlapping double allocations", async () => {
    const f = await fixture();
    const bucket = await prisma.financialBucket.create({ data: { userId: f.userId, projectId: f.projectId, name: "Living", kind: "LIVING", targetPercent: 100 } });
    const wd = await prisma.withdrawal.create({ data: { userId: f.userId, projectId: f.projectId, accountId: f.accountId, amountUSD: 50, status: "REQUESTED" } });
    const complete = await Promise.allSettled([1, 2].map(() => completeWithdrawal(f.userId, wd.id, { fxRate: 10000, receivedAmount: 500000 })));
    expect(complete.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await computeBalance(f.userId)).balance.toNumber()).toBe(150);
    await allocateProfit(f.userId, { periodStart: "2026-11-01", periodEnd: "2026-11-08", amount: 20 });
    const allocations = await Promise.allSettled([
      allocateProfit(f.userId, { periodStart: "2026-11-02", periodEnd: "2026-11-09", amount: 20 }),
      allocateProfit(f.userId, { periodStart: "2026-11-03", periodEnd: "2026-11-10", amount: 20 }),
    ]);
    expect(allocations.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.financialAllocation.aggregate({ where: { userId: f.userId }, _sum: { amount: true } }))._sum.amount)).toBe(40);
    const budget = await budgetOverview(f.userId);
    expect(budget.funded.toNumber()).toBe(400000);
    expect(bucket.kind).toBe("LIVING");
  });

  it("deduplicates concurrent imports and overlapping syncs while preserving the broker ledger", async () => {
    const f = await fixture();
    const report = readFileSync(new URL("../fixtures/mt5-history.xlsx", import.meta.url));
    const overlap = readFileSync(new URL("../fixtures/mt5-history-overlap.xlsx", import.meta.url));
    const [a, b] = await Promise.all([
      importStatement(f.userId, f.accountId, report),
      mt5Sync(f.userId, f.accountId, report),
    ]);
    expect(a.imported + b.imported).toBe(2);
    expect(a.duplicates + b.duplicates).toBe(2);
    expect(a.skipped + b.skipped).toBe(4);
    expect([...a.registeredSymbols, ...b.registeredSymbols].sort()).toEqual(["BTCUSD.TEST", "US100.DEMO"]);
    expect((await computeBalance(f.userId)).realizedPnl.toString()).toBe("1.2");
    expect(await mt5Sync(f.userId, f.accountId, overlap)).toMatchObject({ imported: 1, duplicates: 1, skipped: 0 });

    const trades = await prisma.trade.findMany({ where: { userId: f.userId }, include: { executions: true, instrument: true } });
    expect(trades).toHaveLength(3);
    const indexTrade = trades.find((trade) => trade.ticket === "9012345678901234567")!;
    expect(indexTrade.status).toBe("CLOSED");
    expect(indexTrade.lot.toString()).toBe("0.001");
    expect(indexTrade.realizedPnl?.toString()).toBe("9.4");
    expect(indexTrade.executions).toHaveLength(2);
    expect(indexTrade.instrument).toMatchObject({ ownerId: f.userId, pricePrecision: 6, contractSize: null });
    expect(await prisma.accountTransaction.count({ where: { userId: f.userId, type: "REALIZED_PNL" } })).toBe(3);
    expect((await computeBalance(f.userId)).realizedPnl.toString()).toBe("2.2");

    const anotherAccount = await prisma.tradingAccount.create({ data: { userId: f.userId, projectId: f.projectId, name: "Second account" } });
    expect(await importStatement(f.userId, anotherAccount.id, overlap)).toMatchObject({ imported: 2, duplicates: 0, registeredSymbols: [] });
  });

  it("keeps imported instruments private and records signed P&L for manual custom closes", async () => {
    const owner = await fixture();
    const another = await fixture();
    const report = readFileSync(new URL("../fixtures/mt5-history-overlap.xlsx", import.meta.url));
    await expect(importStatement(another.userId, owner.accountId, report)).rejects.toMatchObject({ status: 404 });
    await importStatement(owner.userId, owner.accountId, report);
    const ownedInstrument = await prisma.instrument.findUniqueOrThrow({
      where: { ownerId_symbol: { ownerId: owner.userId, symbol: "US100.DEMO" } },
    });
    const input = {
      instrumentId: ownedInstrument.id, direction: "LONG" as const, lot: 0.003, entryPrice: 20_000,
      entryAt: "2026-11-04T08:00:00Z", commission: 0, swap: 0, fees: 0,
    };
    await expect(createTrade(another.userId, { ...input, accountId: another.accountId })).rejects.toMatchObject({ status: 404 });
    expect(await importStatement(another.userId, another.accountId, report)).toMatchObject({ imported: 2, registeredSymbols: ["US100.DEMO"] });
    expect(await prisma.instrument.count({ where: { symbol: "US100.DEMO", ownerId: { in: [owner.userId, another.userId] } } })).toBe(2);

    const trade = await createTrade(owner.userId, { ...input, accountId: owner.accountId });
    const close = { kind: "PARTIAL_CLOSE" as const, quantity: 0.001, price: 19_000, commission: 0.2, swap: 0, fees: 0 };
    await expect(addExecution(owner.userId, trade.id, close)).rejects.toMatchObject({ status: 400 });
    const positive = await addExecution(owner.userId, trade.id, { ...close, reportedNetPnl: "2.25" });
    expect(positive.trade.status).toBe("PARTIAL");
    expect(positive.execution.realizedPnl?.toString()).toBe("2.25");
    await addExecution(owner.userId, trade.id, { ...close, reportedNetPnl: "-2.25" });
    const flat = await addExecution(owner.userId, trade.id, { ...close, kind: "CLOSE", reportedNetPnl: "0" });
    expect(flat.trade.status).toBe("CLOSED");
    expect(flat.trade.realizedPnl?.toString()).toBe("0");
    expect((await prisma.accountTransaction.findMany({ where: { sourceTradeId: trade.id } }))
      .map((post) => post.amount.toString()).sort()).toEqual(["-2.25", "0", "2.25"]);
  });

  it("deduplicates cashflow-only uploads by account and keeps imported withdrawals and reversals in sync", async () => {
    const f = await fixture();
    const cashflowReport = readFileSync(new URL("../fixtures/mt5-cashflows.xlsx", import.meta.url));
    const [first, second] = await Promise.all([
      importStatement(f.userId, f.accountId, cashflowReport),
      mt5Sync(f.userId, f.accountId, cashflowReport),
    ]);
    expect(first.depositsImported + second.depositsImported).toBe(1);
    expect(first.withdrawalsImported + second.withdrawalsImported).toBe(1);
    expect(first.cashflowDuplicates + second.cashflowDuplicates).toBe(2);
    expect(first.skipped + second.skipped).toBe(6);
    expect((await mt5SyncStatus(f.userId)).lastSyncAt).not.toBeNull();

    const withdrawalTxn = await prisma.accountTransaction.findUniqueOrThrow({
      where: { accountId_mt5DealId: { accountId: f.accountId, mt5DealId: "9900000000000000002" } },
    });
    expect(withdrawalTxn.type).toBe("WITHDRAWAL");
    expect(withdrawalTxn.amount.toString()).toBe("-15");
    const history = await listWithdrawals(f.userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      id: withdrawalTxn.withdrawalId, accountId: f.accountId, status: "COMPLETED",
      completedAt: new Date("2026-11-02T22:48:58Z"), note: "wd tr#demo",
      mt5DealId: "9900000000000000002", fxRate: null, receivedAmount: null,
    });
    expect(history[0]?.amountUSD.toString()).toBe("15");
    expect(await prisma.financialTransaction.count({ where: { userId: f.userId } })).toBe(0);
    expect(await prisma.exchangeRate.count({ where: { userId: f.userId } })).toBe(0);
    const balance = await computeBalance(f.userId, f.accountId);
    expect(balance.deposits.toString()).toBe("300");
    expect(balance.withdrawals.toString()).toBe("15");
    expect(balance.balance.toString()).toBe("285");
    expect(balance.realizedPnl.toString()).toBe("0");

    await reverseTransaction(f.userId, withdrawalTxn.id, "Imported broker debit correction");
    expect(await listWithdrawals(f.userId)).toMatchObject([{ status: "CANCELLED" }]);
    const correctedBalance = await computeBalance(f.userId, f.accountId);
    expect(correctedBalance.balance.toString()).toBe("300");
    expect(correctedBalance.withdrawals.toString()).toBe("0");
    expect(await importStatement(f.userId, f.accountId, cashflowReport)).toMatchObject({
      depositsImported: 0, withdrawalsImported: 0, cashflowDuplicates: 2,
    });
    const anotherAccount = await prisma.tradingAccount.create({
      data: { userId: f.userId, projectId: f.projectId, name: "Second account" },
    });
    expect(await importStatement(f.userId, anotherAccount.id, cashflowReport)).toMatchObject({
      depositsImported: 1, withdrawalsImported: 1, cashflowDuplicates: 0,
    });
  });

  it("serializes competing partial closes so their total never exceeds open quantity", async () => {
    const f = await fixture();
    const trade = await createTrade(f.userId, { accountId: f.accountId, instrumentId, direction: "LONG", lot: 0.1,
      entryPrice: 2000, entryAt: new Date().toISOString(), commission: 0, swap: 0, fees: 0 });
    const results = await Promise.allSettled([1, 2].map(() => addExecution(f.userId, trade.id, {
      kind: "PARTIAL_CLOSE", quantity: 0.06, price: 2001, commission: 0, swap: 0, fees: 0,
    })));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await computeBalance(f.userId)).realizedPnl.toNumber()).toBe(6);
  });

  it("serializes debt payments and rejects an unaccounted overpayment", async () => {
    const f = await fixture();
    const debt = await prisma.debt.create({ data: { userId: f.userId, name: "QA", principalOriginal: 1000, principalRemaining: 1000 } });
    const payments = await Promise.allSettled([1, 2].map(() => payDebt(f.userId, debt.id, {
      totalAmount: 600, interestPortion: 0, feePortion: 0,
    })));
    expect(payments.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(Number((await prisma.debt.findUniqueOrThrow({ where: { id: debt.id } })).principalRemaining)).toBe(400);
  });

  it("accepts the rounded JISDOR recommendation only once under simultaneous requests", async () => {
    const f = await fixture();
    await prisma.withdrawalRule.create({ data: { userId: f.userId, projectId: f.projectId, needsTargetIdr: 320000 } });
    await prisma.accountTransaction.create({ data: { userId: f.userId, accountId: f.accountId, type: "REALIZED_PNL", amount: 10, occurredAt: new Date() } });
    const { recommendation } = await getRecommendation(f.userId);
    expect(recommendation.recommended.toString()).toBe("4.04");
    const results = await Promise.allSettled([1, 2].map(() => requestWithdrawal(f.userId, recommendation.recommended.toNumber())));
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  });

  it("allocates remaining IDR at receipt cost without creating money when FX changes", async () => {
    const f = await fixture();
    await prisma.financialBucket.create({ data: { userId: f.userId, projectId: f.projectId, name: "Living", kind: "LIVING", targetPercent: 100 } });
    const receipt = async (rate: number) => {
      const wd = await prisma.withdrawal.create({ data: { userId: f.userId, projectId: f.projectId, accountId: f.accountId, amountUSD: 50, status: "REQUESTED" } });
      await completeWithdrawal(f.userId, wd.id, { fxRate: rate, receivedAmount: 50 * rate });
    };
    await receipt(20000);
    await allocateProfit(f.userId, { periodStart: "2026-11-01", periodEnd: "2026-11-08", amount: 50 });
    await receipt(10000);
    await allocateProfit(f.userId, { periodStart: "2026-11-08", periodEnd: "2026-11-15", amount: 50 });
    await getRecommendation(f.userId, { rate: "19500", at: new Date().toISOString(), source: "bi-jisdor", status: "latest" });
    const withdrawals = await prisma.withdrawal.findMany({ where: { userId: f.userId }, orderBy: { fxRate: "asc" } });
    expect(withdrawals.map((w) => [w.fxRate?.toString(), w.receivedAmount?.toString()])).toEqual([
      ["10000", "500000"], ["20000", "1000000"],
    ]);
    const total = await prisma.financialTransaction.aggregate({ where: { userId: f.userId, kind: "ALLOCATION" }, _sum: { amount: true } });
    expect(Number(total._sum.amount)).toBe(1500000);
  });

  it("opens and saves successive review corrections while preserving prior snapshots", async () => {
    const f = await fixture();
    const closed = await closeReview(f.userId, "WEEKLY");
    const correction = await correctReview(f.userId, "WEEKLY");
    expect((await getOrCreateReview(f.userId, "WEEKLY")).id).toBe(correction.id);
    await saveReviewFields(f.userId, "WEEKLY", { reflections: "Corrected facts" });
    await closeReview(f.userId, "WEEKLY");
    const second = await correctReview(f.userId, "WEEKLY");
    expect(second.id).not.toBe(correction.id);
    expect((await prisma.periodReview.findUniqueOrThrow({ where: { id: closed.id } })).snapshot).toEqual(closed.snapshot);
  });
});
