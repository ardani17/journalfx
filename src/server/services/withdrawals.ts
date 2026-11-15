import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { hwmAfterCompletion, monthlyToWeekly, needsCapForWindow, wdRecommendation } from "@/lib/finance/withdrawal";
import { computeBalance } from "./ledger";
import { utcWeek, utcMonth } from "@/lib/dates";
import type { WdRecommendation } from "@/lib/finance/withdrawal";

/**
 * Withdrawal lifecycle service.
 * RECOMMENDED → REQUESTED → COMPLETED (ledger posting + FX snapshot + finance income)
 * or CANCELLED. HWM is DERIVED from completed withdrawals against the cumulative
 * realized P&L timeline — never stored, so corrections stay auditable.
 */

async function cumulativePnlTimeline(userId: string) {
  const rows = await prisma.accountTransaction.findMany({
    where: { userId, type: "REALIZED_PNL" },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true, amount: true },
  });
  let cum = new Decimal(0);
  return rows.map((r) => {
    cum = cum.add(D(r.amount));
    return { at: r.occurredAt, cum };
  });
}

function cumAt(timeline: { at: Date; cum: Decimal }[], t: Date): Decimal {
  let out = new Decimal(0);
  for (const p of timeline) {
    if (p.at <= t) out = p.cum;
    else break;
  }
  return out;
}

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
  recommendation: WdRecommendation;
  rule: { maxWdRatio: string; needsTargetIdr: string | null; reserveUsd: string };
  needsWeeklyUsd: Decimal | null;
  cumulativePnl: Decimal;
  hwm: Decimal;
  periodProfit: Decimal;
  periodTaken: Decimal;
  availableCash: Decimal;
  latestFx: { rate: string; at: Date } | null;
}

export async function getRecommendation(userId: string): Promise<RecommendationBundle> {
  const rule = await getActiveRule(userId);
  const timeline = await cumulativePnlTimeline(userId);
  const cumulative = timeline.at(-1)?.cum ?? new Decimal(0);

  // HWM = cumulative P&L at each COMPLETED withdrawal (max), floor 0
  const completed = await prisma.withdrawal.findMany({
    where: { userId, status: "COMPLETED", completedAt: { not: null } },
    select: { completedAt: true },
  });
  let hwm = new Decimal(0);
  for (const c of completed) {
    if (c.completedAt) hwm = hwmAfterCompletion(hwm, cumAt(timeline, c.completedAt));
  }

  const { start: weekStart } = utcWeek(new Date());
  const weekPnlRows = await prisma.accountTransaction.findMany({
    where: { userId, type: "REALIZED_PNL", occurredAt: { gte: weekStart } },
    select: { amount: true },
  });
  const periodProfit = weekPnlRows.reduce((s, r) => s.add(D(r.amount)), new Decimal(0));

  const takenRows = await prisma.withdrawal.findMany({
    where: { userId, status: { in: ["RECOMMENDED", "REQUESTED", "COMPLETED"] }, createdAt: { gte: weekStart } },
    select: { amountUSD: true },
  });
  const periodTaken = takenRows.reduce((s, w) => s.add(D(w.amountUSD)), new Decimal(0));

  const balances = await computeBalance(userId);

  // needs: outstanding budget of current month (planned − funded) + debt installments due
  const { start: mStart, end: mEnd } = utcMonth(new Date());
  const budget = await prisma.budget.findFirst({
    where: { userId, periodStart: mStart, periodEnd: mEnd, isActive: true },
    include: { categories: true },
  });
  const planned = budget
    ? budget.categories.filter((c) => c.isActive).reduce((s, c) => s.add(D(c.plannedAmount)), new Decimal(0))
    : new Decimal(0);
  const spent = budget
    ? await prisma.financialTransaction.aggregate({
        where: { userId, kind: "EXPENSE", occurredAt: { gte: mStart, lt: mEnd } },
        _sum: { amount: true },
      })
    : { _sum: { amount: null } };
  const outstanding = Decimal.max(planned.minus(D(spent._sum.amount)), new Decimal(0));

  const debts = await prisma.debt.findMany({ where: { userId, status: "ACTIVE" } });
  let debtDue = new Decimal(0);
  for (const d of debts) {
    if (d.installmentAmount) debtDue = debtDue.add(D(d.installmentAmount));
  }
  const needsIdr = needsCapForWindow(outstanding, debtDue); // IDR domain
  const fx = await prisma.exchangeRate.findFirst({
    where: { pair: "USDIDR" },
    orderBy: { at: "desc" },
  });
  const fxRate = fx ? D(fx.rate) : null;
  const needsWeeklyUsd = fxRate && !needsIdr.isZero() ? needsIdr.div(fxRate) : null;

  const rec = wdRecommendation({
    cumulativeRealizedPnl: cumulative,
    highWaterMark: hwm,
    periodProfit,
    periodWdTaken: periodTaken,
    maxWdRatioPct: rule.maxWdRatio,
    needsTargetUsd: needsWeeklyUsd ?? undefined,
    availableCash: balances.balance,
    reserveUsd: rule.reserveUsd,
    dataUnknown: !budget,
    dataStale: false,
  });

  return {
    recommendation: rec,
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
    latestFx: fx ? { rate: fx.rate.toString(), at: fx.at } : null,
  };
}

export async function listWithdrawals(userId: string) {
  return prisma.withdrawal.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
  });
}

export async function requestWithdrawal(userId: string, amountUsd: number, note?: string, req?: Request) {
  const { recommendation } = await getRecommendation(userId);
  if (D(amountUsd).gt(recommendation.recommended)) {
    throw new ApiError(
      400,
      `Jumlah ${amountUsd} melebihi rekomendasi ${recommendation.recommended.toFixed(2)} — kurangi jumlah atau perbaiki data`,
    );
  }
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  const w = await prisma.withdrawal.create({
    data: {
      userId,
      projectId: project.id,
      status: "REQUESTED",
      amountUSD: new Decimal(amountUsd),
      note: note ?? null,
      requestedAt: new Date(),
    },
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
    // historical FX snapshot (immutable once referenced)
    const at = new Date();
    await tx.exchangeRate.create({
      data: { userId, pair: "USDIDR", rate: new Decimal(input.fxRate), at, source: "manual-wd" },
    });
    const updated = await tx.withdrawal.update({
      where: { id },
      data: {
        status: "COMPLETED",
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
        accountId: account.id,
        type: "WITHDRAWAL",
        amount: D(w.amountUSD).neg(),
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
  const w = await prisma.withdrawal.findFirst({ where: { id, userId } });
  if (!w) throw new ApiError(404, "Withdrawal tidak ditemukan");
  if (w.status === "COMPLETED") throw new ApiError(400, "Withdrawal selesai tidak dapat dibatalkan — buat koreksi");
  const updated = await prisma.withdrawal.update({ where: { id }, data: { status: "CANCELLED" } });
  await audit({ userId, action: "cancel", entity: "Withdrawal", entityId: id, req });
  return updated;
}

/** Convenience for dashboard: monthly needs in IDR (rule × 12/52 = weekly planning figure). */
export function weeklyNeedsFromMonthly(monthlyIdr: Decimal | null): Decimal | null {
  return monthlyIdr === null ? null : monthlyToWeekly(monthlyIdr);
}
