import { D, Decimal } from "@/lib/money";

/**
 * Risk engine — position sizing and cash-flow-adjusted drawdown.
 *
 * Position size (PRD):
 *   riskAmount = balance × riskPct/100
 *   lots = floor( riskAmount / (|entry−SL| × contractSize + costPerLot) , lotStep )
 *   REJECT when lots < lotMin (minimum lot exceeds risk limit)
 *   Warning-only validation: tick value, margin, stale equity (flags, no block).
 */

export interface PositionSizeInput {
  balance: Decimal | number | string;
  riskPct: Decimal | number | string; // 1 = 1%
  entry: Decimal | number | string;
  stopLoss: Decimal | number | string;
  contractSize: Decimal | number | string;
  costPerLot?: Decimal | number | string; // commission+fee per 1.0 lot round turn
  lotStep?: Decimal | number | string;
  lotMin?: Decimal | number | string;
  lotMax?: Decimal | number | string;
  tickValueUsd?: Decimal | number | string; // validation only
  marginPerLot?: Decimal | number | string; // validation only
  equityUpdatedAt?: Date | string | null; // staleness validation only
}

export interface PositionSizeResult {
  riskAmount: Decimal;
  slDistance: Decimal;
  rawLots: Decimal;
  lots: Decimal;
  actualRisk: Decimal; // risk with rounded lots incl. costs
  valid: boolean;
  reasons: string[]; // rejection reasons
  warnings: string[]; // warning-only validations
}

const STALE_MS = 10 * 60 * 1000; // 10 minutes

export function positionSize(input: PositionSizeInput): PositionSizeResult {
  const reasons: string[] = [];
  const warnings: string[] = [];

  const balance = D(input.balance);
  const riskAmount = balance.times(D(input.riskPct)).div(100);
  const entry = D(input.entry);
  const sl = D(input.stopLoss);
  const contractSize = D(input.contractSize);
  const costPerLot = D(input.costPerLot ?? 0);
  const lotStep = D(input.lotStep ?? 0.01);
  const lotMin = D(input.lotMin ?? 0.01);
  const lotMax = D(input.lotMax ?? 100);

  const slDistance = entry.minus(sl).abs();
  if (slDistance.isZero()) {
    return {
      riskAmount,
      slDistance,
      rawLots: new Decimal(0),
      lots: new Decimal(0),
      actualRisk: new Decimal(0),
      valid: false,
      reasons: ["Jarak SL nol — SL harus berbeda dari entry"],
      warnings,
    };
  }

  const denom = slDistance.times(contractSize).plus(costPerLot);
  const rawLots = riskAmount.div(denom);
  // floor to broker lot step
  const lots = rawLots.div(lotStep).floor().times(lotStep);
  const actualRisk = lots.times(denom);

  if (lots.lt(lotMin)) {
    reasons.push(
      `Lot hasil hitung ${lots.toFixed(2)} di bawah minimum broker ${lotMin.toFixed(2)} — minimum lot melebihi batas risiko, transaksi DITOLAK`,
    );
  }
  if (lots.gt(lotMax)) {
    reasons.push(`Lot melebihi maksimum broker ${lotMax.toFixed(2)}`);
  }

  // warning-only validations (never block)
  if (input.tickValueUsd !== undefined) {
    const expected = slDistance.div(D(0.01)).times(D(input.tickValueUsd)).times(lots);
    if (expected.gt(riskAmount.times(1.05))) {
      warnings.push("Nilai tick menyiratkan risiko lebih besar dari batas — periksa spesifikasi instrumen");
    }
  }
  if (input.marginPerLot !== undefined && lots.gt(0)) {
    const margin = lots.times(D(input.marginPerLot));
    if (margin.gt(balance)) {
      warnings.push("Margin yang dibutuhkan melebihi balance — periksa leverage");
    }
  }
  if (input.equityUpdatedAt) {
    const t = input.equityUpdatedAt instanceof Date ? input.equityUpdatedAt : new Date(input.equityUpdatedAt);
    if (Date.now() - t.getTime() > STALE_MS) {
      warnings.push("Data equity sudah tidak segar (>10 menit) — verifikasi ulang sebelum entry");
    }
  }

  return {
    riskAmount,
    slDistance,
    rawLots,
    lots,
    actualRisk,
    valid: reasons.length === 0,
    reasons,
    warnings,
  };
}

/**
 * Drawdown adjusted for cash flows (PRD): compute the equity series adjusted
 * by cumulative net deposits so that deposits don't mask drawdown and
 * withdrawals don't fake it.
 *   adjEquity(t) = equity(t) − cumDeposits(t) + cumWithdrawals(t)
 *   ddPct = (peakAdj − adjEquity) / peakAdj × 100  (from peak)
 */
export interface EquityPointLike {
  at: Date | string;
  equity: Decimal | number | string;
  netCashFlow: Decimal | number | string; // deposits − withdrawals cumulative at t
}

export function adjustedDrawdown(points: EquityPointLike[]): {
  currentDdPct: Decimal;
  maxDdPct: Decimal;
  peak: Decimal;
  adjustedEquity: Decimal;
} {
  let peak = new Decimal(0);
  let maxDd = new Decimal(0);
  let currentAdj = new Decimal(0);
  for (const p of points) {
    const adj = D(p.equity).minus(D(p.netCashFlow));
    currentAdj = adj;
    if (adj.gt(peak)) peak = adj;
    if (peak.gt(0)) {
      const dd = peak.minus(adj).div(peak).times(100);
      if (dd.gt(maxDd)) maxDd = dd;
    }
  }
  const currentDd = peak.gt(0) ? peak.minus(currentAdj).div(peak).times(100) : new Decimal(0);
  return { currentDdPct: currentDd, maxDdPct: maxDd, peak, adjustedEquity: currentAdj };
}
