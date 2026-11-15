import { prisma } from "@/server/db";
import { D, Decimal } from "@/lib/money";
import { startOfUTCDay, addUTCDays } from "@/lib/dates";

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
    select: { realizedPnl: true, actualR: true, entryAt: true, exitAt: true },
  });

  const closed = trades.filter((t) => t.realizedPnl !== null);
  let wins = 0;
  let losses = 0;
  let be = 0;
  let grossWin = new Decimal(0);
  let grossLoss = new Decimal(0);
  let rSum = new Decimal(0);
  let rCount = 0;
  let best = new Decimal(0);
  let worst = new Decimal(0);
  let holdMs = 0;
  let holdCount = 0;
  let curWin = 0;
  let curLoss = 0;
  let maxWin = 0;
  let maxLoss = 0;

  for (const t of closed) {
    const pnl = D(t.realizedPnl);
    if (pnl.isPositive()) {
      wins++;
      grossWin = grossWin.add(pnl);
      curWin++;
      curLoss = 0;
      maxWin = Math.max(maxWin, curWin);
    } else if (pnl.isNegative()) {
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
    best = Decimal.max(best, pnl);
    worst = Decimal.min(worst, pnl);
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
  const netPnl = grossWin.minus(grossLoss);
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
    bestTrade: best,
    worstTrade: worst,
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
    include: { strategy: { select: { id: true, name: true } } },
  });
  const map = new Map<string, StrategyBreakdown>();
  for (const t of trades) {
    const key = t.strategy?.id ?? "none";
    const entry =
      map.get(key) ??
      ({ strategyId: t.strategy?.id ?? null, name: t.strategy?.name ?? "Tanpa Strategi", trades: 0, netPnl: new Decimal(0), winRate: null } as StrategyBreakdown);
    entry.trades++;
    entry.netPnl = entry.netPnl.add(D(t.realizedPnl));
    map.set(key, entry);
  }
  const rows = [...map.values()];
  for (const r of rows) {
    // recompute win rate per strategy
    const subset = trades.filter((t) => (t.strategy?.id ?? "none") === (r.strategyId ?? "none"));
    const wins = subset.filter((t) => D(t.realizedPnl).isPositive()).length;
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
  const trades = await prisma.trade.findMany({
    where: {
      userId,
      status: "CLOSED",
      realizedPnl: { not: null },
      exitAt: { gte: from, lt: to },
      ...(accountId ? { accountId } : {}),
    },
    select: { exitAt: true, realizedPnl: true },
  });
  const map = new Map<string, { pnl: Decimal; trades: number }>();
  for (const t of trades) {
    if (!t.exitAt) continue;
    const key = startOfUTCDay(t.exitAt).toISOString().slice(0, 10);
    const cur = map.get(key) ?? { pnl: new Decimal(0), trades: 0 };
    cur.pnl = cur.pnl.add(D(t.realizedPnl));
    cur.trades++;
    map.set(key, cur);
  }
  // fill continuous range
  const out: DayPnl[] = [];
  for (let d = startOfUTCDay(from); d < to; d = addUTCDays(d, 1)) {
    const key = d.toISOString().slice(0, 10);
    const v = map.get(key);
    out.push({ date: key, pnl: v ? Number(v.pnl.toFixed(2)) : 0, trades: v?.trades ?? 0 });
  }
  return out;
}
