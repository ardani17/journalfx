import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { prisma } from "@/server/db";
import { createTrade, addExecution } from "@/server/services/trades";
import { computeBalance } from "@/server/services/ledger";
import { dailyPnl, coreMetrics } from "@/server/services/analytics";
import { allocateProfit, budgetOverview, payDebt } from "@/server/services/finance";
import { completeWithdrawal, requestWithdrawal } from "@/server/services/withdrawals";
import { closeReview, correctReview, getOrCreateReview, saveReviewFields } from "@/server/services/reviews";
import { importStatement } from "@/server/services/imports";

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
    const user = await prisma.user.create({ data: { email: `qa-${randomUUID()}@example.invalid`, name: "Temporary QA", passwordHash: "disabled-fixture" } });
    fixtureIds.push(user.id);
    const project = await prisma.project.create({ data: { userId: user.id, name: "QA", initialCapital: 200 } });
    const account = await prisma.tradingAccount.create({ data: { userId: user.id, projectId: project.id, name: "QA" } });
    await prisma.accountTransaction.create({ data: { userId: user.id, accountId: account.id, type: "DEPOSIT", amount: 200, occurredAt: new Date("2026-01-01") } });
    return { userId: user.id, projectId: project.id, accountId: account.id };
  }

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

  it("imports broker debit costs correctly and deduplicates re-import", async () => {
    const f = await fixture();
    const csv = `Ticket,Open Time,Type,Size,Item,Price,Close Time,Price,Commission,Swap,Profit\n100,2026.11.01 08:00,buy,0.1,${symbol},2000,2026.11.01 09:00,2001,-0.5,-0.1,10`;
    expect((await importStatement(f.userId, f.accountId, csv)).imported).toBe(1);
    expect((await computeBalance(f.userId)).realizedPnl.toNumber()).toBe(9.4);
    expect((await importStatement(f.userId, f.accountId, csv)).duplicates).toBe(1);
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

  it("reserves the weekly withdrawal allowance only once under simultaneous requests", async () => {
    const f = await fixture();
    await prisma.withdrawalRule.create({ data: { userId: f.userId, projectId: f.projectId, needsTargetIdr: 520000 } });
    await prisma.exchangeRate.create({ data: { userId: f.userId, pair: "USDIDR", rate: 10000, at: new Date() } });
    await prisma.accountTransaction.create({ data: { userId: f.userId, accountId: f.accountId, type: "REALIZED_PNL", amount: 10, occurredAt: new Date() } });
    const results = await Promise.allSettled([1, 2].map(() => requestWithdrawal(f.userId, 5)));
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
