import { prisma } from "@/server/db";

import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { adjustedDrawdown } from "@/lib/finance/risk";
import { balanceSeries, computeBalance } from "./ledger";
import { utcWeek, startOfUTCDay } from "@/lib/dates";

export async function getRiskSettings(userId: string) {
  let settings = await prisma.riskSettings.findUnique({ where: { userId } });
  if (!settings) {
    settings = await prisma.riskSettings.create({ data: { userId } });
  }
  return settings;
}

export async function updateRiskSettings(
  userId: string,
  data: Partial<{
    riskPerTrade: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    ddReview: number;
    maxOpenRisk: number;
    equityMode: string;
  }>,
  req?: Request,
) {
  await getRiskSettings(userId);
  const updated = await prisma.riskSettings.update({
    where: { userId },
    data: {
      ...(data.riskPerTrade !== undefined ? { riskPerTrade: new Decimal(data.riskPerTrade) } : {}),
      ...(data.dailyLossLimit !== undefined ? { dailyLossLimit: new Decimal(data.dailyLossLimit) } : {}),
      ...(data.weeklyLossLimit !== undefined ? { weeklyLossLimit: new Decimal(data.weeklyLossLimit) } : {}),
      ...(data.ddReview !== undefined ? { ddReview: new Decimal(data.ddReview) } : {}),
      ...(data.maxOpenRisk !== undefined ? { maxOpenRisk: new Decimal(data.maxOpenRisk) } : {}),
      ...(data.equityMode !== undefined ? { equityMode: data.equityMode } : {}),
    },
  });
  await audit({ userId, action: "update", entity: "RiskSettings", entityId: userId, after: data, req });
  return updated;
}

export interface RiskStatus {
  settings: Awaited<ReturnType<typeof getRiskSettings>>;
  balance: Decimal;
  equity: Decimal;
  openRisk: Decimal; // Σ initialRisk of open trades
  openTrades: number;
  dayPnl: Decimal;
  weekPnl: Decimal;
  dayLimitUsedPct: number | null;
  weekLimitUsedPct: number | null;
  openRiskUsedPct: number | null;
  currentDdPct: Decimal;
  maxDdPct: Decimal;
  ddReviewTriggered: boolean;
  breaches: string[];
}

/** Live risk usage vs configured (illustrative) limits — warning only, never blocking. */
export async function riskStatus(userId: string): Promise<RiskStatus> {
  const settings = await getRiskSettings(userId);
  const balances = await computeBalance(userId);
  const balance = balances.balance;
  const equity = balance; // unrealized arrives with open trades pricing (v0.5 market data)

  const now = new Date();
  const dayStart = startOfUTCDay(now);
  const { start: weekStart } = utcWeek(now);

  const [openTrades, dayTx, weekTx, series] = await Promise.all([
    prisma.trade.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIAL"] } },
      select: { initialRisk: true },
    }),
    prisma.accountTransaction.findMany({
      where: { userId, type: "REALIZED_PNL", occurredAt: { gte: dayStart } },
      select: { amount: true },
    }),
    prisma.accountTransaction.findMany({
      where: { userId, type: "REALIZED_PNL", occurredAt: { gte: weekStart } },
      select: { amount: true },
    }),
    balanceSeries(userId),
  ]);

  const openRisk = openTrades.reduce((s, t) => s.add(D(t.initialRisk ?? 0)), new Decimal(0));
  const dayPnl = dayTx.reduce((s, t) => s.add(D(t.amount)), new Decimal(0));
  const weekPnl = weekTx.reduce((s, t) => s.add(D(t.amount)), new Decimal(0));

  // cash-flow adjusted drawdown from the daily balance series:
  // netCashFlow(t) = cumDeposits − cumWithdrawals up to t (approximated from ledger types)
  const txs = await prisma.accountTransaction.findMany({
    where: { userId, type: { in: ["DEPOSIT", "WITHDRAWAL"] } },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true, type: true, amount: true },
  });
  // build cumulative net cash flow per day-key
  const cumFlow = new Map<string, Decimal>();
  let run = new Decimal(0);
  for (const t of txs) {
    run = run.add(t.type === "DEPOSIT" ? D(t.amount) : D(t.amount).neg());
    cumFlow.set(t.occurredAt.toISOString().slice(0, 10), run);
  }
  let flowCarry = new Decimal(0);
  const points = series.map((p) => {
    const flow = cumFlow.get(p.date);
    if (flow !== undefined) flowCarry = flow;
    return { at: p.date, equity: new Decimal(p.balance), netCashFlow: flowCarry };
  });
  const dd = adjustedDrawdown(points);

  const breaches: string[] = [];
  const dayLimit = D(settings.dailyLossLimit);
  const weekLimit = D(settings.weeklyLossLimit);
  const maxOpen = D(settings.maxOpenRisk);
  const ddReview = D(settings.ddReview);

  const dayLoss = dayPnl.isNegative() ? dayPnl.neg() : new Decimal(0);
  const weekLoss = weekPnl.isNegative() ? weekPnl.neg() : new Decimal(0);
  // used% = loss / (balance × limit%/100) × 100 — null when balance/limit is zero
  const pctOfLimit = (loss: Decimal, limit: Decimal): number | null =>
    limit.gt(0) && balance.gt(0) ? Number(loss.div(balance.mul(limit.div(100))).times(100)) : null;
  const dayUsedPct = pctOfLimit(dayLoss, dayLimit);
  const weekUsedPct = pctOfLimit(weekLoss, weekLimit);
  const openUsedPct = pctOfLimit(openRisk, maxOpen);

  if (dayUsedPct !== null && dayUsedPct >= 100) breaches.push("Batas loss harian tercapai — berhenti trading hari ini");
  if (weekUsedPct !== null && weekUsedPct >= 100) breaches.push("Batas loss mingguan tercapai — tinjau rencana minggu depan");
  if (openUsedPct !== null && openUsedPct >= 100) breaches.push("Total risiko posisi terbuka melebihi batas maksimal");
  if (dd.currentDdPct.gte(ddReview)) breaches.push(`Drawdown ${dd.currentDdPct.toFixed(1)}% ≥ ambang review ${ddReview.toFixed(0)}% — lakukan review`);

  return {
    settings,
    balance,
    equity,
    openRisk,
    openTrades: openTrades.length,
    dayPnl,
    weekPnl,
    dayLimitUsedPct: dayUsedPct,
    weekLimitUsedPct: weekUsedPct,
    openRiskUsedPct: openUsedPct,
    currentDdPct: dd.currentDdPct,
    maxDdPct: dd.maxDdPct,
    ddReviewTriggered: dd.currentDdPct.gte(ddReview),
    breaches,
  };
}
