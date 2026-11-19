import { userTimezone } from "./time";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal, tradingAmountToUsd, usdToTradingAmount } from "@/lib/money";
import { monthlyToWeekly, needsCapForWindow, wdRecommendation } from "@/lib/finance/withdrawal";
import { DEBT_PERIODS_PER_YEAR, debtSchedule, isRecurringDebt } from "@/lib/finance/debt";
import { attributedLedger, computeBalance } from "./ledger";
import { effectiveFinancialTransactions } from "./finance";
import { zonedPeriod } from "@/lib/dates";
import type { WdRecommendation } from "@/lib/finance/withdrawal";
import { convertUsdIdr, type JisdorQuote } from "@/lib/finance/exchange";
import { getJisdorQuote } from "./jisdor";

/**
 * Withdrawal lifecycle service.
 * RECOMMENDED → REQUESTED → COMPLETED (ledger posting + FX snapshot + finance income)
 * or CANCELLED. HWM is derived from cumulative net P&L at closed weekly boundaries.
 * Current-week reservations consume the allowance without resetting the HWM.
 */

export async function getActiveRule(userId: string) {
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  let rule = await prisma.withdrawalRule.findFirst({
    where: { userId, projectId: project.id },
    orderBy: { activeFrom: "desc" },
  });
  if (!rule) {
    rule = await prisma.withdrawalRule.create({ data: { userId, projectId: project.id } });
  }
  return rule;
}

export async function updateRule(
  userId: string,
  data: { maxWdRatio?: number; needsTargetIdr?: number | null; reserveUsd?: number; minBalanceUsd?: number | null },
  req?: Request,
) {
  const existing = await getActiveRule(userId);
  // rules are versioned: create a new row, keep history
  const rule = await prisma.withdrawalRule.create({
    data: {
      userId,
      projectId: existing.projectId,
      maxWdRatio: data.maxWdRatio !== undefined ? new Decimal(data.maxWdRatio) : existing.maxWdRatio,
      needsTargetIdr:
        data.needsTargetIdr !== undefined
          ? data.needsTargetIdr === null
            ? null
            : new Decimal(data.needsTargetIdr)
          : existing.needsTargetIdr,
      reserveUsd: data.reserveUsd !== undefined ? new Decimal(data.reserveUsd) : existing.reserveUsd,
      minBalanceUsd:
        data.minBalanceUsd !== undefined
          ? data.minBalanceUsd === null
            ? null
            : new Decimal(data.minBalanceUsd)
          : existing.minBalanceUsd,
      note: (data as { note?: string }).note,
    },
  });
  await audit({ userId, action: "create", entity: "WithdrawalRule", entityId: rule.id, after: data, req });
  return rule;
}

export interface RecommendationBundle {
  projectId: string;
  recommendation: WdRecommendation;
  rule: { maxWdRatio: string; needsTargetIdr: string | null; reserveUsd: string };
  needsWeeklyUsd: Decimal | null;
  cumulativePnl: Decimal;
  hwm: Decimal;
  periodProfit: Decimal;
  periodTaken: Decimal;
  availableCash: Decimal;
  latestFx: JisdorQuote | null;
}

export async function getRecommendation(userId: string, quote?: JisdorQuote | null): Promise<RecommendationBundle> {
  const [rule, timezone, fx] = await Promise.all([
    getActiveRule(userId),
    userTimezone(userId),
    quote === undefined ? getJisdorQuote() : quote,
  ]);
  const now = new Date();
  const { start: weekStart, end: weekEnd } = zonedPeriod("WEEKLY", now, timezone);
  const ledger = (await attributedLedger(userId)).filter((r) => r.occurredAt <= now);
  const pnlRows = ledger.filter((r) => r.type === "REALIZED_PNL" || r.type === "FEE");
  let cumulative = D(0);
  let hwm = D(0);
  let periodProfit = D(0);
  let previousWeek: number | null = null;
  for (const row of pnlRows) {
    const rowWeek = zonedPeriod("WEEKLY", row.occurredAt, timezone).start.getTime();
    if (previousWeek !== null && rowWeek !== previousWeek && previousWeek < weekStart.getTime()) {
      hwm = Decimal.max(hwm, cumulative);
    }
    const amount = tradingAmountToUsd(row.amount, row.currency);
    cumulative = cumulative.plus(amount);
    if (row.occurredAt >= weekStart && row.occurredAt < weekEnd) periodProfit = periodProfit.plus(amount);
    previousWeek = rowWeek;
  }
  if (previousWeek !== null && previousWeek < weekStart.getTime()) hwm = Decimal.max(hwm, cumulative);

  const withdrawals = await prisma.withdrawal.findMany({ where: { userId, projectId: rule.projectId } });
  const periodTaken = withdrawals.filter((w) =>
    w.status === "REQUESTED" || w.status === "RECOMMENDED" ||
    (w.status === "COMPLETED" && w.completedAt && w.completedAt >= weekStart && w.completedAt < weekEnd))
    .reduce((sum, w) => sum.plus(D(w.amountUSD)), D(0));
  const balances = await computeBalance(userId);
  const { start: mStart, end: mEnd } = zonedPeriod("MONTHLY", now, timezone);
  const budget = await prisma.budget.findFirst({
    where: { userId, periodStart: mStart, periodEnd: mEnd, isActive: true }, include: { categories: true },
  });
  const planned = budget
    ? budget.categories.filter((c) => c.isActive).reduce((sum, c) => sum.plus(D(c.plannedAmount)), D(0))
    : D(rule.needsTargetIdr);
  const personal = (await effectiveFinancialTransactions(userId)).filter((r) =>
    r.currency === "IDR" && r.occurredAt >= mStart && r.occurredAt < mEnd);
  const buckets = await prisma.financialBucket.findMany({ where: { userId, projectId: rule.projectId } });
  const livingIds = new Set(buckets.filter((b) => b.kind === "LIVING").map((b) => b.id));
  const debtIds = new Set(buckets.filter((b) => b.kind === "DEBT").map((b) => b.id));
  const funded = personal.filter((r) => r.kind === "ALLOCATION" && r.bucketId && livingIds.has(r.bucketId))
    .reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  const otherIncome = personal.filter((r) => r.kind === "INCOME" && !r.withdrawalId)
    .reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  const debtFunds = personal.filter((r) => r.kind === "ALLOCATION" && r.bucketId && debtIds.has(r.bucketId))
    .reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  const paymentsByDebt = new Map<string, Decimal>();
  for (const entry of personal) {
    if (entry.kind !== "EXPENSE" || !entry.debtId) continue;
    paymentsByDebt.set(entry.debtId, (paymentsByDebt.get(entry.debtId) ?? D(0)).plus(entry.amount));
  }
  const debts = await prisma.debt.findMany({ where: { userId, status: "ACTIVE" } });
  let debtDue = D(0);
  let coveredByPayments = D(0);
  for (const debt of debts) {
    const schedule = debtSchedule(debt);
    if (!isRecurringDebt(schedule)) continue;
    const due = D(debt.installmentAmount).times(DEBT_PERIODS_PER_YEAR[schedule]).div(12);
    debtDue = debtDue.plus(due);
    coveredByPayments = coveredByPayments.plus(Decimal.min(due, paymentsByDebt.get(debt.id) ?? 0));
  }
  const outstanding = Decimal.max(planned.minus(funded).minus(otherIncome), 0);
  const outstandingDebt = Decimal.max(debtDue.minus(Decimal.max(debtFunds, coveredByPayments)), 0);
  const needsIdr = needsCapForWindow(outstanding, outstandingDebt);
  const plannedNeeds = planned.plus(debtDue);
  const needsUnconfigured = rule.needsTargetIdr == null && plannedNeeds.isZero();
  const weeklyIdr = Decimal.min(monthlyToWeekly(plannedNeeds), needsIdr);
  const configuredCap = rule.needsTargetIdr == null ? weeklyIdr : Decimal.min(weeklyIdr, monthlyToWeekly(rule.needsTargetIdr));
  const needsWeeklyUsd = convertUsdIdr(configuredCap, "IDR", fx);

  const rec = wdRecommendation({
    cumulativeRealizedPnl: cumulative,
    highWaterMark: hwm,
    periodProfit,
    periodWdTaken: periodTaken,
    maxWdRatioPct: rule.maxWdRatio,
    needsTargetUsd: needsWeeklyUsd ?? undefined,
    availableCash: balances.balance,
    reserveUsd: Decimal.max(D(rule.reserveUsd), D(rule.minBalanceUsd)),
    dataUnknown: needsUnconfigured,
    dataStale: false,
  });
  const recommended = fx ? rec.recommended.toDecimalPlaces(2, Decimal.ROUND_DOWN) : D(0);
  const zeroReasons = [...rec.zeroReasons];
  if (configuredCap.isZero()) {
    if (needsUnconfigured) {
      zeroReasons.push("Kebutuhan bulanan belum disetel. Isi Kebutuhan Bulanan di Edit Aturan atau tambahkan anggaran dengan nominal.");
    } else if (plannedNeeds.gt(0) && needsIdr.isZero() && !rule.needsTargetIdr?.isZero()) {
      zeroReasons.push("Kebutuhan yang direncanakan sudah terpenuhi. Cek pemasukan, alokasi, dan pembayaran cicilan yang tercatat.");
    } else {
      zeroReasons.push("Batas kebutuhan Rp0. Cek nominal anggaran dan Kebutuhan Bulanan di Edit Aturan.");
    }
  }
  if (!fx) zeroReasons.unshift("Kurs acuan JISDOR belum tersedia. Coba lagi saat kurs tersedia.");
  else if (rec.recommended.gt(0) && recommended.isZero()) {
    zeroReasons.push("Rekomendasi di bawah minimum $0,01.");
  }

  return {
    projectId: rule.projectId,
    recommendation: { ...rec, recommended, zeroReasons },
    rule: {
      maxWdRatio: rule.maxWdRatio.toString(),
      needsTargetIdr: rule.needsTargetIdr?.toString() ?? null,
      reserveUsd: rule.reserveUsd.toString(),
    },
    needsWeeklyUsd,
    cumulativePnl: cumulative,
    hwm,
    periodProfit,
    periodTaken,
    availableCash: balances.balance,
    latestFx: fx,
  };
}

export async function listWithdrawalSourceAccounts(userId: string, projectId: string) {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId, projectId, isActive: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, name: true, currency: true },
  });
  if (accounts.length === 0) return [];

  const totals = await prisma.accountTransaction.groupBy({
    by: ["accountId"],
    where: { userId, accountId: { in: accounts.map((account) => account.id) } },
    _sum: { amount: true },
  });
  const byAccount = new Map(totals.map((row) => [row.accountId, row._sum.amount]));
  return accounts.map(({ id, name, currency }) => ({
    id,
    name,
    balanceUsd: tradingAmountToUsd(byAccount.get(id), currency).toDecimalPlaces(2, Decimal.ROUND_DOWN),
  })).filter((account) => account.balanceUsd.gt(0));
}

export async function listWithdrawals(userId: string) {
  const withdrawals = await prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      transactions: { where: { mt5DealId: { not: null } }, select: { mt5DealId: true }, take: 1 },
    },
  });
  return withdrawals.map(({ transactions, ...withdrawal }) => ({
    ...withdrawal, mt5DealId: transactions[0]?.mt5DealId ?? null,
  }));
}

export async function requestWithdrawal(userId: string, amountUsd: number, note?: string, req?: Request, accountId?: string) {
  const amount = D(amountUsd);
  if (!amount.isFinite() || !amount.gt(0) || amount.decimalPlaces() > 2 || amount.gte("1e16")) {
    throw new ApiError(400, "Masukkan jumlah USD positif dengan maksimal dua angka desimal.");
  }

  const fx = await getJisdorQuote();
  if (!fx) throw new ApiError(503, "Kurs acuan JISDOR belum tersedia. Coba lagi nanti.");

  const w = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const { recommendation } = await getRecommendation(userId, fx);
    if (amount.gt(recommendation.recommended)) {
      throw new ApiError(
        400,
        `Jumlah ${amountUsd} melebihi rekomendasi ${recommendation.recommended.toFixed(2)} — kurangi jumlah atau perbaiki data`,
      );
    }
    const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
    if (!project) throw new ApiError(404, "Project belum ada");
    const accounts = await tx.tradingAccount.findMany({ where: { userId, projectId: project.id, isActive: true } });
    const account = accountId ? accounts.find((a) => a.id === accountId) : accounts.length === 1 ? accounts[0] : null;
    if (!account) throw new ApiError(400, "Pilih akun sumber withdrawal yang aktif");
    const cash = await tx.accountTransaction.aggregate({ where: { userId, accountId: account.id }, _sum: { amount: true } });
    if (tradingAmountToUsd(cash._sum.amount, account.currency).lt(amount)) throw new ApiError(400, "Saldo akun sumber tidak mencukupi");
    const w = await tx.withdrawal.create({
      data: {
        userId,
        projectId: project.id,
        accountId: account.id,
        status: "REQUESTED",
        amountUSD: amount,
        note: note ?? null,
        requestedAt: new Date(),
      },
    });
    return w;
  });

  await audit({ userId, action: "create", entity: "Withdrawal", entityId: w.id, after: { amountUsd, note }, req });
  return w;
}

export async function completeWithdrawal(
  userId: string,
  id: string,
  input: { fxRate: number; receivedAmount: number; fees?: number; note?: string },
  req?: Request,
) {
  const w = await prisma.withdrawal.findFirst({ where: { id, userId } });
  if (!w) throw new ApiError(404, "Withdrawal tidak ditemukan");
  if (w.status === "COMPLETED") throw new ApiError(400, "Withdrawal sudah selesai");
  if (w.status === "CANCELLED") throw new ApiError(400, "Withdrawal sudah dibatalkan");

  const accounts = await prisma.tradingAccount.findMany({ where: { userId, isActive: true } });
  const account = accounts[0];
  if (!account) throw new ApiError(400, "Tidak ada akun trading aktif");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const current = await tx.withdrawal.findFirst({ where: { id, userId } });
    if (!current || current.status === "COMPLETED" || current.status === "CANCELLED") {
      throw new ApiError(409, "Withdrawal sudah diproses atau dibatalkan");
    }
    const source = current.accountId
      ? await tx.tradingAccount.findFirst({ where: { id: current.accountId, userId, projectId: current.projectId } })
      : accounts.length === 1 ? account : null;
    if (!source) throw new ApiError(400, "Akun sumber withdrawal harus ditentukan");
    const cash = await tx.accountTransaction.aggregate({ where: { userId, accountId: source.id }, _sum: { amount: true } });
    if (tradingAmountToUsd(cash._sum.amount, source.currency).lt(D(current.amountUSD))) throw new ApiError(400, "Saldo akun sumber tidak mencukupi");
    // historical FX snapshot (immutable once referenced)
    const at = new Date();
    await tx.exchangeRate.create({
      data: { userId, pair: "USDIDR", rate: new Decimal(input.fxRate), at, source: "manual-wd" },
    });
    const updated = await tx.withdrawal.update({
      where: { id },
      data: {
        status: "COMPLETED",
        accountId: source.id,
        fxRate: new Decimal(input.fxRate),
        rateAt: at,
        receivedAmount: new Decimal(input.receivedAmount),
        fees: input.fees !== undefined ? new Decimal(input.fees) : null,
        note: input.note ?? w.note,
        completedAt: at,
      },
    });
    // ledger posting — cash flow, never touches trading P&L
    const ledgerRow = await tx.accountTransaction.create({
      data: {
        userId,
        accountId: source.id,
        type: "WITHDRAWAL",
        amount: usdToTradingAmount(w.amountUSD, source.currency).neg(),
        currency: source.currency,
        occurredAt: at,
        note: `WD #${w.id.slice(-6)} — diterima ${input.receivedAmount} IDR @ ${input.fxRate}`,
        withdrawalId: w.id,
      },
    });
    // personal finance income entry (IDR received)
    await tx.financialTransaction.create({
      data: {
        userId,
        kind: "INCOME",
        amount: new Decimal(input.receivedAmount),
        currency: "IDR",
        fxRate: new Decimal(input.fxRate),
        occurredAt: at,
        description: `Hasil withdrawal trading #${w.id.slice(-6)}`,
        withdrawalId: w.id,
      },
    });
    return { updated, ledgerRow };
  });

  await audit({ userId, action: "complete", entity: "Withdrawal", entityId: id, after: input, req });
  return result.updated;
}

export async function cancelWithdrawal(userId: string, id: string, req?: Request) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const w = await tx.withdrawal.findFirst({ where: { id, userId } });
    if (!w) throw new ApiError(404, "Withdrawal tidak ditemukan");
    if (w.status === "COMPLETED") throw new ApiError(400, "Withdrawal selesai tidak dapat dibatalkan — buat koreksi");
    return tx.withdrawal.update({ where: { id }, data: { status: "CANCELLED" } });
  });

  await audit({ userId, action: "cancel", entity: "Withdrawal", entityId: id, req });
  return updated;
}

/** Convenience for dashboard: monthly needs in IDR (rule × 12/52 = weekly planning figure). */
export function weeklyNeedsFromMonthly(monthlyIdr: Decimal | null): Decimal | null {
  return monthlyIdr === null ? null : monthlyToWeekly(monthlyIdr);
}
