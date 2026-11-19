import { userTimezone } from "./time";
import { prisma } from "@/server/db";

import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { adjustedDrawdown } from "@/lib/finance/risk";
import { attributedLedger, computeBalance } from "./ledger";
import { zonedPeriod } from "@/lib/dates";

export async function getRiskSettings(userId: string) {
  const settings = await prisma.riskSettings.findUnique({ where: { userId } });
  return settings ?? prisma.riskSettings.upsert({
    where: { userId },
    create: { userId },
    update: { userId },
  });
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
  const now = new Date();
  const [settings, balances, timezone, openTrades, ledger] = await Promise.all([
    getRiskSettings(userId),
    computeBalance(userId),
    userTimezone(userId),
    prisma.trade.findMany({
      where: { userId, status: { in: ["OPEN", "PARTIAL"] } }, select: { initialRisk: true },
    }),
    attributedLedger(userId),
  ]);
  const balance = balances.balance;
  const equity = balance; // unrealized arrives with open trades pricing (v0.5 market data)
  const { start: dayStart } = zonedPeriod("DAILY", now, timezone);
  const { start: weekStart } = zonedPeriod("WEEKLY", now, timezone);
  const openRisk = openTrades.reduce((sum, t) => sum.plus(D(t.initialRisk)), D(0));
  const realized = ledger.filter((r) => (r.type === "REALIZED_PNL" || r.type === "FEE") && r.occurredAt <= now);
  const dayPnl = realized.filter((r) => r.occurredAt >= dayStart).reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  const weekPnl = realized.filter((r) => r.occurredAt >= weekStart).reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  let equityRun = D(0);
  let cashFlow = D(0);
  let initialFunding = D(0);
  const points = ledger.filter((r) => r.occurredAt <= now).map((r) => {
    equityRun = equityRun.plus(D(r.amount));
    if (r.type === "DEPOSIT" || r.type === "WITHDRAWAL") {
      // Ledger amounts already carry their cash-flow sign.
      cashFlow = cashFlow.plus(D(r.amount));
      if (initialFunding.isZero() && r.type === "DEPOSIT" && D(r.amount).gt(0)) initialFunding = D(r.amount);
    }
    return { at: r.occurredAt, equity: equityRun, netCashFlow: cashFlow.minus(initialFunding) };
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
