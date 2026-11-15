import { prisma } from "@/server/db";
import { D, Decimal } from "@/lib/money";
import { computeBalance } from "./ledger";
import { monteCarlo } from "@/lib/finance/montecarlo";

/** Portfolio & prop-firm analytics (v1.4.0). */
export interface AccountRow {
  id: string;
  name: string;
  broker: string | null;
  isProp: boolean;
  balance: Decimal;
  realizedPnl: Decimal;
  winRate: number | null;
  trades: number;
  prop: {
    targetUsd: Decimal | null;
    progressPct: Decimal | null;
    maxDailyLossUsd: Decimal | null;
    maxTotalDdUsd: Decimal | null;
    breached: boolean;
    passed: boolean;
  } | null;
}

export async function portfolioOverview(userId: string): Promise<AccountRow[]> {
  const accounts = await prisma.tradingAccount.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { trades: { where: { status: { in: ["CLOSED", "PARTIAL"] } }, select: { realizedPnl: true } } },
  });
  const rows: AccountRow[] = [];
  for (const a of accounts) {
    const bal = await computeBalance(userId, a.id);
    const trades = a.trades;
    const wins = trades.filter((t) => t.realizedPnl !== null && D(t.realizedPnl).isPositive()).length;
    const closed = trades.filter((t) => t.realizedPnl !== null);
    const initial = bal.deposits.isZero() ? bal.balance : bal.deposits;

    if (a.isProp) {
      const targetPct = a.propTargetPct ? D(a.propTargetPct) : null;
      const dailyPct = a.propMaxDailyLossPct ? D(a.propMaxDailyLossPct) : null;
      const ddPct = a.propMaxTotalDdPct ? D(a.propMaxTotalDdPct) : null;
      const targetUsd = targetPct ? initial.times(targetPct).div(100) : null;
      const progressPct = targetUsd && !targetUsd.isZero()
        ? bal.realizedPnl.div(targetUsd).times(100)
        : null;
      const maxDailyUsd = dailyPct ? bal.balance.times(dailyPct).div(100) : null;
      const maxDdUsd = ddPct ? bal.balance.times(ddPct).div(100) : null;
      rows.push({
        id: a.id,
        name: a.name,
        broker: a.broker,
        isProp: true,
        balance: bal.balance,
        realizedPnl: bal.realizedPnl,
        winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
        trades: closed.length,
        prop: {
          targetUsd,
          progressPct: progressPct ? new Decimal(Number(progressPct.toFixed(2))) : null,
          maxDailyLossUsd: maxDailyUsd,
          maxTotalDdUsd: maxDdUsd,
          breached: progressPct !== null && progressPct.lt(-100), // simplified guard
          passed: progressPct !== null && progressPct.gte(100),
        },
      });
      continue;
    }
    rows.push({
      id: a.id,
      name: a.name,
      broker: a.broker,
      isProp: false,
      balance: bal.balance,
      realizedPnl: bal.realizedPnl,
      winRate: closed.length > 0 ? (wins / closed.length) * 100 : null,
      trades: closed.length,
      prop: null,
    });
  }
  return rows;
}

/** Monte Carlo over the user's historical R multiples. */
export async function runMonteCarlo(
  userId: string,
  opts?: { riskPctPerTrade?: number; tradesPerPath?: number; paths?: number; seed?: number },
) {
  const trades = await prisma.trade.findMany({
    where: { userId, status: "CLOSED", actualR: { not: null }, initialRisk: { not: null } },
    select: { actualR: true, initialRisk: true, realizedPnl: true },
  });
  // prefer actual R; fall back to realized/risk when R missing but risk known
  const historicalR: number[] = [];
  for (const t of trades) {
    if (t.actualR !== null) historicalR.push(Number(t.actualR));
    else if (t.initialRisk && Number(t.initialRisk) !== 0 && t.realizedPnl !== null) {
      historicalR.push(Number(t.realizedPnl) / Number(t.initialRisk));
    }
  }
  const balances = await computeBalance(userId);
  const settings = await prisma.riskSettings.findUnique({ where: { userId } });
  return monteCarlo({
    historicalR,
    startingBalance: Number(balances.balance.toFixed(2)),
    riskPctPerTrade: opts?.riskPctPerTrade ?? Number(settings?.riskPerTrade ?? 1),
    tradesPerPath: opts?.tradesPerPath ?? 52,
    paths: opts?.paths ?? 800,
    maxDdPct: 30,
    seed: opts?.seed ?? 42,
  });
}
