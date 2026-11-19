import { beforeEach, describe, expect, it, vi } from "vitest";
import { D } from "@/lib/money";

const db = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), aggregate: vi.fn(),
    groupBy: vi.fn(), create: vi.fn(), update: vi.fn(), upsert: vi.fn(), count: vi.fn() });
  return { user: model(), trade: model(), expenseCategory: model(), financialTransaction: model(), budget: model(),
    project: model(), financialBucket: model(), financialAllocation: model(), tradingAccount: model(),
    accountTransaction: model(), riskSettings: model(), periodReview: model(),
    withdrawalRule: model(), withdrawal: model(), debt: model(), exchangeRate: model(),
    $transaction: vi.fn(), $executeRaw: vi.fn() };
});
vi.mock("@/server/db", () => ({ prisma: db }));
vi.mock("@/server/audit", () => ({ audit: vi.fn() }));
vi.mock("@/server/services/jisdor", () => ({ getJisdorQuote: vi.fn() }));
import { addFinancialTransaction, allocateProfit, budgetOverview, financialTotals } from "@/server/services/finance";
import { cancelTrade, listTrades } from "@/server/services/trades";
import { getRecommendation, listWithdrawalSourceAccounts, requestWithdrawal } from "@/server/services/withdrawals";
import { riskStatus } from "@/server/services/risk";
import { getJisdorQuote } from "@/server/services/jisdor";

beforeEach(() => {
  vi.resetAllMocks();
  db.user.findUnique.mockResolvedValue({ timezone: "Asia/Jakarta" });
  db.$transaction.mockImplementation(async (fn) => fn(db));
  db.financialAllocation.findMany.mockResolvedValue([]);
  db.financialTransaction.aggregate.mockResolvedValue({ _sum: { amount: null } });
});

describe("weekly withdrawal and risk reconciliation", () => {
  function setupLedger() {
    db.project.findFirst.mockResolvedValue({ id: "project" });
    db.withdrawalRule.findFirst.mockResolvedValue({ projectId: "project", maxWdRatio: D(50), reserveUsd: D(0), needsTargetIdr: D(520000), minBalanceUsd: null });
    db.withdrawal.findMany.mockResolvedValue([]);
    db.periodReview.findMany.mockResolvedValue([]);
    db.budget.findFirst.mockResolvedValue(null);
    db.debt.findMany.mockResolvedValue([]);
    vi.mocked(getJisdorQuote).mockResolvedValue({ rate: "18252", at: new Date().toISOString(), source: "bi-jisdor", status: "latest" });
    db.financialTransaction.findMany.mockResolvedValue([]);
    db.financialBucket.findMany.mockResolvedValue([]);
    db.riskSettings.findUnique.mockResolvedValue({ dailyLossLimit: D(2), weeklyLossLimit: D(5), maxOpenRisk: D(2), ddReview: D(10) });
    db.trade.findMany.mockResolvedValue([]);
  }

  it("converts the monthly needs and debt cap with JISDOR and rounds only the actionable recommendation down", async () => {
    setupLedger();
    db.withdrawalRule.findFirst.mockResolvedValue({ maxWdRatio: D(50), reserveUsd: D(0), needsTargetIdr: null, minBalanceUsd: null });
    db.budget.findFirst.mockResolvedValue({ categories: [{ isActive: true, plannedAmount: D(250000) }] });
    db.debt.findMany.mockResolvedValue([{ id: "monthly", status: "ACTIVE", repaymentMode: null, installmentAmount: D(70000), installmentFreq: "monthly" }]);
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "pnl", type: "REALIZED_PNL", amount: D(90), occurredAt: new Date(), reversalOfId: null },
    ]);
    const result = await getRecommendation("owner");
    expect(result.needsWeeklyUsd?.toFixed(4)).toBe("4.0459");
    expect(result.recommendation.recommended.toFixed(2)).toBe("4.04");
    expect(db.exchangeRate.findFirst).not.toHaveBeenCalled();
  });

  it("reserves a twelfth of yearly installments and excludes payments for nonrecurring debt", async () => {
    setupLedger();
    db.budget.findFirst.mockResolvedValue({ categories: [] });
    db.debt.findMany.mockResolvedValue([
      { id: "yearly", status: "ACTIVE", repaymentMode: "recurring", installmentAmount: D(840000), installmentFreq: "yearly" },
      { id: "flexible", status: "ACTIVE", repaymentMode: "flexible", installmentAmount: null, installmentFreq: null },
      { id: "once", status: "PAID", repaymentMode: "one_time", installmentAmount: null, installmentFreq: null },
    ]);
    db.financialTransaction.findMany.mockResolvedValue([
      { kind: "EXPENSE", currency: "IDR", debtId: "flexible", amount: D(150000), occurredAt: new Date() },
      { kind: "EXPENSE", currency: "IDR", debtId: "once", amount: D(300000), occurredAt: new Date() },
    ]);
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "pnl", type: "REALIZED_PNL", amount: D(90), occurredAt: new Date(), reversalOfId: null },
    ]);
    const result = await getRecommendation("owner");
    expect(result.needsWeeklyUsd?.toFixed(4)).toBe(D(840000).div(52).div(18252).toFixed(4));
    expect(result.recommendation.recommended.toFixed(2)).toBe("0.88");
  });

  it("keeps the next debt installment funded separately from payments on other debts", async () => {
    setupLedger();
    db.budget.findFirst.mockResolvedValue({ categories: [] });
    db.debt.findMany.mockResolvedValue([
      { id: "a", status: "ACTIVE", repaymentMode: "recurring", installmentAmount: D(10000), installmentFreq: "monthly" },
      { id: "b", status: "ACTIVE", repaymentMode: "recurring", installmentAmount: D(20000), installmentFreq: "monthly" },
    ]);
    db.financialTransaction.findMany.mockResolvedValue([
      { kind: "EXPENSE", currency: "IDR", debtId: "a", amount: D(90000), occurredAt: new Date() },
      { kind: "EXPENSE", currency: "IDR", debtId: "paid-off", amount: D(90000), occurredAt: new Date() },
    ]);
    db.accountTransaction.findMany.mockResolvedValue([]);
    const result = await getRecommendation("owner");
    expect(result.needsWeeklyUsd?.toFixed(4)).toBe(D(30000).times(12).div(52).div(18252).toFixed(4));
  });

  it("blocks new withdrawals when no JISDOR rate is available", async () => {
    setupLedger();
    vi.mocked(getJisdorQuote).mockResolvedValue(null);
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "pnl", type: "REALIZED_PNL", amount: D(90), occurredAt: new Date(), reversalOfId: null },
    ]);
    const result = await getRecommendation("owner");
    expect(result.recommendation.recommended.isZero()).toBe(true);
    expect(result.needsWeeklyUsd).toBeNull();
    expect(result.recommendation.zeroReasons).toContain("Kurs acuan JISDOR belum tersedia. Coba lagi saat kurs tersedia.");
    await expect(requestWithdrawal("owner", 1)).rejects.toMatchObject({ status: 503 });
    expect(db.$transaction).not.toHaveBeenCalled();
  });

  it("distinguishes unconfigured, funded and zero-limit needs with positive eligible profit", async () => {
    setupLedger();
    const now = new Date();
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "pnl", type: "REALIZED_PNL", amount: D(90), occurredAt: now, reversalOfId: null },
    ]);
    const rule = { projectId: "project", maxWdRatio: D(50), reserveUsd: D(0), minBalanceUsd: null };
    db.withdrawalRule.findFirst.mockResolvedValue({ ...rule, needsTargetIdr: null });

    const unconfigured = await getRecommendation("owner");
    expect(unconfigured.recommendation.recommended.isZero()).toBe(true);
    expect(unconfigured.recommendation.zeroReasons.join()).toMatch(/belum disetel.*Edit Aturan/);
    const unavailable = await getRecommendation("owner", null);
    expect(unavailable.recommendation.zeroReasons.join()).toMatch(/JISDOR belum tersedia.*Kebutuhan bulanan belum disetel/);
    expect(unavailable.recommendation.needsCap).toBeNull();

    db.withdrawalRule.findFirst.mockResolvedValue({ ...rule, needsTargetIdr: D(0) });
    const zeroLimit = await getRecommendation("owner");
    expect(zeroLimit.recommendation.recommended.isZero()).toBe(true);
    expect(zeroLimit.recommendation.zeroReasons.join()).toContain("Batas kebutuhan Rp0");

    db.withdrawalRule.findFirst.mockResolvedValue({ ...rule, needsTargetIdr: D(520000) });
    db.financialTransaction.findMany.mockResolvedValue([
      { kind: "INCOME", currency: "IDR", amount: D(520000), occurredAt: now },
    ]);
    const funded = await getRecommendation("owner");
    expect(funded.recommendation.recommended.isZero()).toBe(true);
    expect(funded.recommendation.zeroReasons.join()).toContain("sudah terpenuhi");
    expect(funded.recommendation.zeroReasons.join()).not.toContain("belum disetel");
  });

  it("lists only funded active source accounts and converts cent balances to USD", async () => {
    db.tradingAccount.findMany.mockResolvedValue([
      { id: "usd", name: "USD", currency: "USD" },
      { id: "cent", name: "Cent", currency: "USC" },
      { id: "dust", name: "Dust", currency: "USC" },
      { id: "empty", name: "Empty", currency: "USD" },
    ]);
    db.accountTransaction.groupBy.mockResolvedValue([
      { accountId: "usd", _sum: { amount: D(30) } },
      { accountId: "cent", _sum: { amount: D(499.75) } },
      { accountId: "dust", _sum: { amount: D(0.99) } },
    ]);

    const accounts = await listWithdrawalSourceAccounts("owner", "project");
    expect(accounts.map(({ id, balanceUsd }) => [id, balanceUsd.toString()])).toEqual([["usd", "30"], ["cent", "4.99"]]);
    expect(db.tradingAccount.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { userId: "owner", projectId: "project", isActive: true } }));
  });

  it("unwithdrawn profit from a closed week is not eligible again next week", async () => {
    setupLedger();
    const now = new Date();
    const previous = new Date(now.getTime() - 14 * 86400000);
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "deposit", type: "DEPOSIT", amount: D(200), occurredAt: previous, reversalOfId: null },
      { id: "old", type: "REALIZED_PNL", amount: D(100), occurredAt: previous, reversalOfId: null },
      { id: "new", type: "REALIZED_PNL", amount: D(10), occurredAt: now, reversalOfId: null },
    ]);
    const result = await getRecommendation("owner");
    expect(result.hwm.toNumber()).toBe(100);
    expect(result.recommendation.eligibleProfit.toNumber()).toBe(10);
    expect(result.recommendation.recommended.toNumber()).toBeLessThanOrEqual(5);
  });

  it("withdrawals do not manufacture drawdown and initial funding preserves its denominator", async () => {
    setupLedger();
    db.accountTransaction.findMany.mockResolvedValue([
      { id: "deposit", type: "DEPOSIT", amount: D(200), occurredAt: new Date("2026-11-01"), reversalOfId: null },
      { id: "loss", type: "REALIZED_PNL", amount: D(-20), occurredAt: new Date("2026-11-02"), reversalOfId: null },
      { id: "wd", type: "WITHDRAWAL", amount: D(-50), occurredAt: new Date("2026-11-03"), reversalOfId: null },
    ]);
    const result = await riskStatus("owner");
    expect(result.currentDdPct.toNumber()).toBe(10);
  });
});

describe("service integrity", () => {
  it("cashflow totals cancel reversed income instead of keeping it as available cash", async () => {
    db.financialTransaction.findMany.mockResolvedValue([
      { id: "income", kind: "INCOME", amount: D(100), currency: "IDR", reversalOfId: null },
      { id: "expense", kind: "EXPENSE", amount: D(50), currency: "IDR", reversalOfId: null },
      { id: "reverse", kind: "REVERSAL", amount: D(-100), currency: "IDR", reversalOfId: "income" },
    ]);
    const totals = await financialTotals("owner");
    expect(totals.income.toNumber()).toBe(0);
    expect(totals.expense.toNumber()).toBe(50);
  });
  it("rejects a category belonging to another user before creating a financial entry", async () => {
    db.expenseCategory.findFirst.mockResolvedValue(null);
    db.financialTransaction.create.mockResolvedValue({ id: "entry" });
    await expect(addFinancialTransaction("owner", { kind: "EXPENSE", amount: 10, categoryId: "foreign" }))
      .rejects.toMatchObject({ status: 404 });
    expect(db.financialTransaction.create).not.toHaveBeenCalled();
  });

  it("does not cancel a partially realized trade and orphan its ledger", async () => {
    db.trade.findFirst.mockResolvedValue({ id: "trade", status: "PARTIAL", realizedPnl: D(5) });
    db.trade.update.mockResolvedValue({});
    await expect(cancelTrade("owner", "trade", "mistake")).rejects.toMatchObject({ status: 400 });
    expect(db.trade.update).not.toHaveBeenCalled();
  });

  it("searches journal text for the requested term", async () => {
    db.trade.findMany.mockResolvedValue([]); db.trade.count.mockResolvedValue(0);
    await listTrades("owner", { q: "breakout", limit: 10, offset: 0 });
    expect(db.trade.findMany.mock.calls[0]![0].where.OR).toContainEqual({
      journal: { is: { entryReason: { contains: "breakout", mode: "insensitive" } } },
    });
  });

  it("does not allocate broker profit that has not actually been withdrawn", async () => {
    db.project.findFirst.mockResolvedValue({ id: "project" });
    db.financialBucket.findMany.mockResolvedValue([{ id: "living", targetPercent: D(100) }]);
    db.accountTransaction.aggregate.mockResolvedValue({ _sum: { amount: D(100) } });
    db.financialTransaction.findMany.mockResolvedValue([]);
    db.withdrawal.findMany.mockResolvedValue([]);
    db.financialAllocation.aggregate.mockResolvedValue({ _sum: { amount: null } });
    db.financialAllocation.create.mockResolvedValue({});
    await expect(allocateProfit("owner", { periodStart: "2026-11-16", periodEnd: "2026-11-23", amount: 50 }))
      .rejects.toMatchObject({ status: 400 });
  });

  it("budget totals exclude reversed expenses and use living allocations for coverage", async () => {
    db.budget.findFirst.mockResolvedValue({ id: "budget", periodStart: new Date("2026-11-01"),
      periodEnd: new Date("2026-12-01"), categories: [{ id: "food", isActive: true, plannedAmount: D(100) }] });
    db.financialTransaction.findMany.mockResolvedValue([
      { id: "spent", kind: "EXPENSE", amount: D(40), currency: "IDR", categoryId: "food", reversalOfId: null, occurredAt: new Date("2026-11-16") },
      { id: "reverse", kind: "REVERSAL", amount: D(-40), currency: "IDR", reversalOfId: "spent", occurredAt: new Date("2026-11-17") },
      { id: "allocated", kind: "ALLOCATION", amount: D(20), currency: "IDR", bucketId: "living", occurredAt: new Date("2026-11-16") },
    ]);
    db.financialBucket.findMany.mockResolvedValue([{ id: "living" }]);
    db.financialTransaction.groupBy.mockResolvedValue([{ categoryId: "food", _sum: { amount: D(40) } }]);
    db.financialTransaction.aggregate.mockResolvedValue({ _sum: { amount: D(100) } });
    db.financialAllocation.aggregate.mockResolvedValue({ _sum: { amount: D(20) } });
    const result = await budgetOverview("owner");
    expect(result.totalSpent.toNumber()).toBe(0);
    expect(result.coveragePct).toBe(20);
  });
});
