import { prisma } from "@/server/db";
import type { LedgerEntryType, TradeDirection } from "@prisma/client";
import { D, Decimal, tradingAmountToUsd } from "@/lib/money";
import { calendarDate, startOfUTCDay, addUTCDays } from "@/lib/dates";
import { userTimezone } from "./time";
import { tradeFilterWhere, type ListTradesFilter } from "./trades";

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
  sampleWarning: boolean; // Fewer than 30 trades contribute to the performance statistics.
  dailyTradeBreakdown?: DailyTradeBreakdown;
}

type AdditionalPnl<Value> = {
  otherTrades: Value;
  accountFees: Value;
  unlinkedPnl: Value;
};

export type DailyTradeBreakdown = {
  trades: Array<{
    id: string;
    symbol: string;
    direction: TradeDirection;
    closedAt: string | null;
    netPnl: string;
  }>;
  additionalPnl: AdditionalPnl<string | null>;
};

export async function coreMetrics(
  userId: string,
  filter?: { accountId?: string; from?: Date; to?: Date; journal?: Omit<ListTradesFilter, "limit" | "offset"> },
  { includeDailyTrades = false }: { includeDailyTrades?: boolean } = {},
): Promise<CoreMetrics> {
  const journal = filter?.journal;
  const tradesQuery = prisma.trade.findMany({
    where: journal ? tradeFilterWhere(userId, journal) : {
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
    select: {
      id: true,
      status: true,
      realizedPnl: true,
      actualR: true,
      entryAt: true,
      exitAt: true,
      account: { select: { currency: true } },
      direction: includeDailyTrades,
      instrument: includeDailyTrades ? { select: { symbol: true } } : undefined,
    },
  });
  const ledgerQuery = queryRealizedTradingRows(userId, filter);
  const [trades, ledger] = includeDailyTrades
    ? await prisma.$transaction([tradesQuery, ledgerQuery], { isolationLevel: "RepeatableRead" })
    : await Promise.all([tradesQuery, ledgerQuery]);

  const realized = trades.filter((trade) => trade.realizedPnl !== null);
  const closed = realized.filter((trade) => trade.status === "CLOSED");
  const measured = journal ? realized : closed;
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

  for (const t of measured) {
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

  const n = measured.length;
  const hasTradeSpecificFilter = journal?.status || journal?.result || journal?.strategyId || journal?.q;
  const journalTradeIds = hasTradeSpecificFilter || journal?.from || journal?.to
    ? new Set(trades.map((trade) => trade.id))
    : null;
  const periodLedger = normalizeRealizedTradingRows(ledger).filter((r) => {
    if (!journalTradeIds) return true;
    if (r.sourceTradeId) return journalTradeIds.has(r.sourceTradeId);

    // A broker fee without a trade ID is attributable to the account and transaction date.
    return r.type === "FEE" && !hasTradeSpecificFilter &&
      (!journal?.from || r.occurredAt >= journal.from) && (!journal?.to || r.occurredAt < journal.to);
  });
  const pnlByTrade = includeDailyTrades ? new Map(closed.map(({ id }) => [id, D(0)])) : null;
  const additionalPnl: AdditionalPnl<Decimal | null> = {
    otherTrades: null,
    accountFees: null,
    unlinkedPnl: null,
  };
  let netPnl = D(0);
  for (const row of periodLedger) {
    const amount = filter?.accountId ? D(row.amount) : tradingAmountToUsd(row.amount, row.currency);
    netPnl = netPnl.plus(amount);
    if (!pnlByTrade) continue;

    const tradePnl = row.sourceTradeId ? pnlByTrade.get(row.sourceTradeId) : undefined;
    if (row.sourceTradeId && tradePnl !== undefined) {
      pnlByTrade.set(row.sourceTradeId, tradePnl.plus(amount));
      continue;
    }

    // Partial closes and standalone ledger entries contribute to P&L without increasing the closed trade count.
    const group = row.sourceTradeId ? "otherTrades" : row.type === "FEE" ? "accountFees" : "unlinkedPnl";
    additionalPnl[group] = (additionalPnl[group] ?? D(0)).plus(amount);
  }

  const dailyTradeBreakdown = pnlByTrade ? {
    trades: closed.toReversed().map((trade) => ({
      id: trade.id,
      symbol: trade.instrument.symbol,
      direction: trade.direction,
      closedAt: trade.exitAt?.toISOString() ?? null,
      netPnl: pnlByTrade.get(trade.id)!.toString(),
    })),
    additionalPnl: {
      otherTrades: additionalPnl.otherTrades?.toString() ?? null,
      accountFees: additionalPnl.accountFees?.toString() ?? null,
      unlinkedPnl: additionalPnl.unlinkedPnl?.toString() ?? null,
    },
  } satisfies DailyTradeBreakdown : undefined;
  return {
    totalTrades: journal ? trades.length : n,
    closedTrades: closed.length,
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
    ...(dailyTradeBreakdown ? { dailyTradeBreakdown } : {}),
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
  pnl: Decimal;
  trades: number;
  hasActivity: boolean;
  hasRealizedPnl: boolean;
}

type LedgerScope = { from?: Date; to?: Date; accountId?: string };

function queryRealizedTradingRows(userId: string, filter?: LedgerScope) {
  const pnlTypes: LedgerEntryType[] = ["REALIZED_PNL", "FEE"];
  return prisma.accountTransaction.findMany({
    where: {
      userId,
      accountId: filter?.accountId,
      occurredAt: { gte: filter?.from, lt: filter?.to },
      OR: [
        { type: { in: pnlTypes }, reversalOfId: null },
        { reversalOf: { userId, type: { in: pnlTypes } } },
      ],
    },
    select: {
      occurredAt: true, currency: true, amount: true, type: true, sourceTradeId: true,
      reversalOf: { select: { type: true, sourceTradeId: true } },
    },
  });
}

function normalizeRealizedTradingRows(rows: Awaited<ReturnType<typeof queryRealizedTradingRows>>) {
  return rows.map(({ reversalOf, ...row }) => reversalOf ? { ...row, ...reversalOf } : row);
}

export async function realizedTradingRows(userId: string, filter?: LedgerScope) {
  return normalizeRealizedTradingRows(await queryRealizedTradingRows(userId, filter));
}

/** Daily realized P&L grouped by ledger date in the user's local time. */
export async function dailyPnl(
  userId: string,
  from: Date,
  to: Date,
  accountId?: string,
): Promise<DayPnl[]> {
  const timezone = await userTimezone(userId);
  const [ledger, entries] = await Promise.all([
    realizedTradingRows(userId, { from, to, accountId }),
    prisma.trade.findMany({
      where: { userId, accountId, entryAt: { gte: from, lt: to } },
      select: { entryAt: true },
    }),
  ]);
  const map = new Map<string, { pnl: Decimal; ids: Set<string> }>();
  const entryDates = new Set(entries.map(({ entryAt }) => calendarDate(entryAt, timezone).toISOString().slice(0, 10)));
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
    out.push({
      date: key, pnl: v?.pnl ?? D(0), trades: v?.ids.size ?? 0,
      hasActivity: v !== undefined || entryDates.has(key), hasRealizedPnl: v !== undefined,
    });
  }
  return out;
}
