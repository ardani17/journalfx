import { prisma } from "@/server/db";
import { D, Decimal, tradingAmountToUsd } from "@/lib/money";
import { attributedLedger } from "./ledger";
import { calendarDate, startOfUTCDay, addUTCDays } from "@/lib/dates";
import { userTimezone } from "./time";

/**
 * Basic performance analytics (v0.2). Advanced breakdowns & discipline score
 * arrive in v0.5. N/A for undefined metrics; sample-size warnings included.
 */

export interface CoreMetrics {
  totalTrades: number;
  closedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  netPnl: Decimal;
  grossWin: Decimal;
  grossLoss: Decimal;
  profitFactor: number | null;
  avgWin: Decimal | null;
  avgLoss: Decimal | null;
  expectancy: Decimal | null;
  avgR: number | null;
  bestTrade: Decimal;
  worstTrade: Decimal;
  maxWinStreak: number;
  maxLossStreak: number;
  avgHoldMinutes: number | null;
  sampleWarning: boolean; // closedTrades < 30
}

export async function coreMetrics(
  userId: string,
  filter?: { accountId?: string; from?: Date; to?: Date },
): Promise<CoreMetrics> {
  const trades = await prisma.trade.findMany({
    where: {
      userId,
      status: { in: ["CLOSED", "PARTIAL"] },
      ...(filter?.accountId ? { accountId: filter.accountId } : {}),
      ...(filter?.from || filter?.to
        ? {
            exitAt: {
              ...(filter?.from ? { gte: filter.from } : {}),
              ...(filter?.to ? { lt: filter.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { exitAt: "asc" },
    select: { status: true, realizedPnl: true, actualR: true, entryAt: true, exitAt: true, account: { select: { currency: true } } },
  });

  const closed = trades.filter((t) => t.status === "CLOSED" && t.realizedPnl !== null);
  let wins = 0;
  let losses = 0;
  let be = 0;
  let grossWin = new Decimal(0);
  let grossLoss = new Decimal(0);
  let rSum = new Decimal(0);
  let rCount = 0;
  let best: Decimal | null = null;
  let worst: Decimal | null = null;
  let holdMs = 0;
  let holdCount = 0;
  let curWin = 0;
  let curLoss = 0;
  let maxWin = 0;
  let maxLoss = 0;

  for (const t of closed) {
    const pnl = filter?.accountId ? D(t.realizedPnl) : tradingAmountToUsd(t.realizedPnl, t.account.currency);
    if (pnl.gt(0)) {
      wins++;
      grossWin = grossWin.add(pnl);
      curWin++;
      curLoss = 0;
      maxWin = Math.max(maxWin, curWin);
    } else if (pnl.lt(0)) {
      losses++;
      grossLoss = grossLoss.add(pnl.abs());
      curLoss++;
      curWin = 0;
      maxLoss = Math.max(maxLoss, curLoss);
    } else {
      be++;
      curWin = 0;
      curLoss = 0;
    }
    best = best === null ? pnl : Decimal.max(best, pnl);
    worst = worst === null ? pnl : Decimal.min(worst, pnl);
    if (t.actualR !== null) {
      rSum = rSum.add(D(t.actualR));
      rCount++;
    }
    if (t.exitAt) {
      holdMs += t.exitAt.getTime() - t.entryAt.getTime();
      holdCount++;
    }
  }

  const n = closed.length;
  const periodLedger = (await attributedLedger(userId)).filter((r) =>
    (r.type === "REALIZED_PNL" || r.type === "FEE") &&
    (!filter?.accountId || r.accountId === filter.accountId) &&
    (!filter?.from || r.occurredAt >= filter.from) && (!filter?.to || r.occurredAt < filter.to));
  const netPnl = periodLedger.reduce((sum, r) => sum.plus(filter?.accountId ? D(r.amount) : tradingAmountToUsd(r.amount, r.currency)), D(0));
  return {
    totalTrades: n,
    closedTrades: n,
    wins,
    losses,
    breakEven: be,
    winRate: n > 0 ? (wins / n) * 100 : null,
    netPnl,
    grossWin,
    grossLoss,
    profitFactor: grossLoss.isZero() ? (grossWin.isZero() ? null : null) : Number(grossWin.div(grossLoss).toFixed(2)),
    avgWin: wins > 0 ? grossWin.div(wins) : null,
    avgLoss: losses > 0 ? grossLoss.div(losses) : null,
    expectancy: n > 0 ? netPnl.div(n) : null,
    avgR: rCount > 0 ? Number(rSum.div(rCount).toFixed(2)) : null,
    bestTrade: best ?? D(0),
    worstTrade: worst ?? D(0),
    maxWinStreak: maxWin,
    maxLossStreak: maxLoss,
    avgHoldMinutes: holdCount > 0 ? Math.round(holdMs / holdCount / 60000) : null,
    sampleWarning: n < 30,
  };
}

export interface StrategyBreakdown {
  strategyId: string | null;
  name: string;
  trades: number;
  netPnl: Decimal;
  winRate: number | null;
}

export async function byStrategy(userId: string): Promise<StrategyBreakdown[]> {
  const trades = await prisma.trade.findMany({
    where: { userId, status: { in: ["CLOSED", "PARTIAL"] }, realizedPnl: { not: null } },
    include: { strategy: { select: { id: true, name: true } }, account: { select: { currency: true } } },
  });
  const map = new Map<string, StrategyBreakdown>();
  for (const t of trades) {
    const key = t.strategy?.id ?? "none";
    const entry =
      map.get(key) ??
      ({ strategyId: t.strategy?.id ?? null, name: t.strategy?.name ?? "Tanpa Strategi", trades: 0, netPnl: new Decimal(0), winRate: null } as StrategyBreakdown);
    entry.trades++;
    entry.netPnl = entry.netPnl.add(tradingAmountToUsd(t.realizedPnl, t.account.currency));
    map.set(key, entry);
  }
  const rows = [...map.values()];
  for (const r of rows) {
    // recompute win rate per strategy
    const subset = trades.filter((t) => (t.strategy?.id ?? "none") === (r.strategyId ?? "none"));
    const wins = subset.filter((t) => D(t.realizedPnl).gt(0)).length;
    r.winRate = r.trades > 0 ? (wins / r.trades) * 100 : null;
  }
  return rows.sort((a, b) => b.netPnl.minus(a.netPnl).toNumber());
}

export interface DayPnl {
  date: string; // yyyy-MM-dd
  pnl: number;
  trades: number;
}

/** Daily realized P&L by UTC close date — powers calendar & P/L bars. */
export async function dailyPnl(
  userId: string,
  from: Date,
  to: Date,
  accountId?: string,
): Promise<DayPnl[]> {
  const timezone = await userTimezone(userId);
  const ledger = (await attributedLedger(userId)).filter((r) =>
    (r.type === "REALIZED_PNL" || r.type === "FEE") && r.occurredAt >= from && r.occurredAt < to &&
    (!accountId || r.accountId === accountId));
  const map = new Map<string, { pnl: Decimal; ids: Set<string> }>();
  for (const row of ledger) {
    const key = calendarDate(row.occurredAt, timezone).toISOString().slice(0, 10);
    const cur = map.get(key) ?? { pnl: D(0), ids: new Set<string>() };
    cur.pnl = cur.pnl.plus(accountId ? D(row.amount) : tradingAmountToUsd(row.amount, row.currency));
    if (row.sourceTradeId) cur.ids.add(row.sourceTradeId);
    map.set(key, cur);
  }
  // fill continuous range
  const out: DayPnl[] = [];
  const lastDay = calendarDate(new Date(to.getTime() - 1), timezone).toISOString().slice(0, 10);
  for (let d = startOfUTCDay(calendarDate(from, timezone)); d.toISOString().slice(0, 10) <= lastDay; d = addUTCDays(d, 1)) {
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key);
    out.push({ date: key, pnl: v ? Number(v.pnl.toFixed(2)) : 0, trades: v?.ids.size ?? 0 });
  }
  return out;
}
