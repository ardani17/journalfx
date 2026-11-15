import { D, Decimal } from "@/lib/money";

/**
 * Dynamic withdrawal engine — profit-only, high-water mark loss recovery.
 *
 * Rules (PRD):
 * - Cumulative realized net trading P&L is independent of deposits/withdrawals.
 * - Eligible profit = max(0, cumulativeProfit − HWM of closed periods).
 *   Losses must be recovered before any WD (cum must exceed prior peak).
 * - Eligibility never reused: completing a WD raises HWM to cumulativeProfit.
 * - Current period recommendation additionally requires positive period profit,
 *   and subtracts WD already reserved/completed in this period.
 * - WD = min(eligible × maxRatio%, needsTarget, cash available above reserve).
 * - Recommendation only; manual broker action with receipt reconciliation.
 * - Monthly needs → weekly via ×12/52 when used for weekly planning.
 */

export interface WdRecommendationInput {
  cumulativeRealizedPnl: Decimal | number | string;
  /** HWM from previously COMPLETED withdrawal periods (starts at 0) */
  highWaterMark: Decimal | number | string;
  /** realized trading P&L inside the current period (week) */
  periodProfit: Decimal | number | string;
  /** WD already reserved/completed inside the current period */
  periodWdTaken: Decimal | number | string;
  /** max share of eligible profit, percent (e.g. 50 = 50%) */
  maxWdRatioPct: Decimal | number | string;
  /** needs cap for this period (USD) — monthly needs × 12/52 for weeks */
  needsTargetUsd?: Decimal | number | string;
  /** cash available for withdrawal (balance, unrealized excluded) */
  availableCash: Decimal | number | string;
  /** cash floor that must remain in the account */
  reserveUsd?: Decimal | number | string;
  /** data-quality guards */
  dataStale?: boolean;
  dataUnknown?: boolean;
}

export interface WdRecommendation {
  cumulativeProfit: Decimal;
  highWaterMark: Decimal;
  eligibleProfit: Decimal;
  profitOnlyCap: Decimal; // eligible × ratio
  needsCap: Decimal | null;
  cashCap: Decimal;
  recommended: Decimal;
  zeroReasons: string[];
  warnings: string[];
  caps: {
    byRatio: boolean;
    byNeeds: boolean;
    byCash: boolean;
    byPeriodProfit: boolean;
    byEligibility: boolean;
  };
}

export function wdRecommendation(input: WdRecommendationInput): WdRecommendation {
  const cum = D(input.cumulativeRealizedPnl);
  const hwm = Decimal.max(D(input.highWaterMark), new Decimal(0));
  const periodProfit = D(input.periodProfit);
  const taken = D(input.periodWdTaken);
  const ratio = D(input.maxWdRatioPct);
  const available = D(input.availableCash);
  const reserve = D(input.reserveUsd ?? 0);

  const eligible = Decimal.max(cum.minus(hwm), new Decimal(0));
  const profitOnlyCap = eligible.times(ratio).div(100);
  const needsCap = input.needsTargetUsd !== undefined ? D(input.needsTargetUsd) : null;
  const cashCap = Decimal.max(available.minus(reserve), new Decimal(0));

  const zeroReasons: string[] = [];
  const warnings: string[] = [];
  if (input.dataUnknown) warnings.push("Data kebutihan belum lengkap — verifikasi anggaran & hutang sebelum WD");
  if (input.dataStale) warnings.push("Data ledger tidak segar — verifikasi balance broker sebelum eksekusi WD");

  const caps = {
    byRatio: false,
    byNeeds: false,
    byCash: false,
    byPeriodProfit: false,
    byEligibility: false,
  };

  if (eligible.lte(0)) {
    zeroReasons.push(
      cum.lte(0)
        ? "Belum ada laba kumulatif — loss harus dipulihkan dulu sebelum WD"
        : "Seluruh laba eligibel periode sebelumnya sudah ditarik (HWM)",
    );
    caps.byEligibility = true;
  }
  if (periodProfit.lte(0)) {
    zeroReasons.push("Profit periode ini tidak positif — aturan profit-only melarang WD");
    caps.byPeriodProfit = true;
  }

  let recommended = Decimal.min(profitOnlyCap, cashCap);
  if (needsCap !== null) {
    if (needsCap.lt(recommended)) caps.byNeeds = true;
    recommended = Decimal.min(recommended, needsCap);
  }
  if (profitOnlyCap.lte(recommended) && !profitOnlyCap.isZero()) caps.byRatio = true;
  if (cashCap.lt(profitOnlyCap)) caps.byCash = true;

  recommended = Decimal.max(recommended, new Decimal(0));
  // profit-only and eligibility gates hard-zero the recommendation
  if (caps.byPeriodProfit || caps.byEligibility) {
    recommended = new Decimal(0);
  }
  // subtract WD already taken this period
  recommended = Decimal.max(recommended.minus(taken), new Decimal(0));

  if (recommended.isZero() && zeroReasons.length === 0) {
    zeroReasons.push("Rekomendasi menjadi 0 setelah batasan rasio/kebutuhan/kas/taken");
  }
  if (taken.gt(0)) warnings.push(`Sudah ada WD ${taken.toFixed(2)} USD periode ini — dikurangkan dari rekomendasi`);

  return {
    cumulativeProfit: cum,
    highWaterMark: hwm,
    eligibleProfit: eligible,
    profitOnlyCap,
    needsCap,
    cashCap,
    recommended,
    zeroReasons,
    warnings,
    caps,
  };
}

/** After a WD completes, HWM rises so eligibility is never reused. */
export function hwmAfterCompletion(
  currentHwm: Decimal | number | string,
  cumulativeProfit: Decimal | number | string,
): Decimal {
  return Decimal.max(D(currentHwm), D(cumulativeProfit));
}

/** Monthly needs → weekly planning figure (PRD: ×12/52). */
export function monthlyToWeekly(monthly: Decimal | number | string): Decimal {
  return D(monthly).times(12).div(52);
}

/** Actual outstanding budget + mandatory debt installments due in window → needs cap. */
export function needsCapForWindow(
  outstandingBudget: Decimal | number | string,
  debtDue: Decimal | number | string,
): Decimal {
  return D(outstandingBudget).plus(D(debtDue));
}
