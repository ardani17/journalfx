import { D, Decimal } from "@/lib/money";

/**
 * Deterministic compounding simulator — pure functions, decimal arithmetic.
 *
 * Per cycle:
 *   profit   = opening × returnPct/100 − costPerCycle   (return may be negative)
 *   wd       = 0 when profit ≤ 0 (profit-only, never from principal)
 *              NONE:   0
 *              FIXED:  min(fixedWdAmount, max(profit,0), closingBeforeWd − reserve)
 *              DYNAMIC:min(profit × wdRatio/100, needsCap?, max(profit,0))
 *   deposits scheduled for the cycle are added after WD
 *   closing  = opening + profit − wd + deposit
 *
 * Target reached when closing ≥ target (checked before simulating further —
 * an already-reached target yields ZERO cycles). maxCycles exceeded →
 * targetNotReached = true ("Target belum tercapai dalam horizon").
 */

export type WdModeSim = "NONE" | "FIXED" | "DYNAMIC";

export interface SimulateInput {
  initialCapital: Decimal | number | string;
  target: Decimal | number | string;
  returnPerCyclePct: Decimal | number | string; // e.g. 5 = 5%
  wdMode: WdModeSim;
  wdRatioPct?: Decimal | number | string; // DYNAMIC cap, e.g. 50 = 50% of profit
  fixedWdAmount?: Decimal | number | string;
  needsCap?: Decimal | number | string; // optional needs-based cap per cycle
  reserve?: Decimal | number | string;
  costPerCycle?: Decimal | number | string;
  deposits?: Record<number, Decimal | number | string>; // cycle n → amount added at end of cycle n
  stressReturns?: Record<number, Decimal | number | string>; // cycle n → override return % (negative allowed)
  maxCycles?: number;
}

export interface SimCycle {
  cycle: number;
  opening: Decimal;
  returnPct: Decimal;
  grossProfit: Decimal;
  costs: Decimal;
  profit: Decimal;
  wd: Decimal;
  deposit: Decimal;
  closing: Decimal;
}

export interface SimulateResult {
  cycles: SimCycle[];
  cyclesCount: number;
  finalBalance: Decimal;
  totalWd: Decimal;
  totalProfit: Decimal;
  totalDeposits: Decimal;
  reached: boolean;
  targetNotReached: boolean; // horizon exceeded
  weeklyEquivalent?: never;
}

export function simulate(input: SimulateInput): SimulateResult {
  const target = D(input.target);
  let balance = D(input.initialCapital);
  const maxCycles = Math.max(0, Math.min(input.maxCycles ?? 2000, 10000));
  const cost = D(input.costPerCycle ?? 0);
  const reserve = D(input.reserve ?? 0);

  // Already at target → zero cycles (PRD acceptance)
  if (balance.gte(target) || maxCycles === 0) {
    return {
      cycles: [],
      cyclesCount: 0,
      finalBalance: balance,
      totalWd: new Decimal(0),
      totalProfit: new Decimal(0),
      totalDeposits: new Decimal(0),
      reached: balance.gte(target),
      targetNotReached: !balance.gte(target),
    };
  }

  const cycles: SimCycle[] = [];
  let totalWd = new Decimal(0);
  let totalProfit = new Decimal(0);
  let totalDeposits = new Decimal(0);
  let reached = false;

  for (let n = 1; n <= maxCycles; n++) {
    const opening = balance;
    const returnPct = input.stressReturns?.[n] !== undefined
      ? D(input.stressReturns[n]!)
      : D(input.returnPerCyclePct);

    const grossProfit = opening.times(returnPct).div(100);
    const profit = grossProfit.minus(cost);
    const closingBeforeWd = opening.plus(profit);

    // profit-only withdrawal: never from principal, zero on nonpositive profit
    let wd = new Decimal(0);
    if (profit.isPositive()) {
      if (input.wdMode === "FIXED") {
        const fixed = D(input.fixedWdAmount ?? 0);
        wd = Decimal.min(fixed, profit, closingBeforeWd.minus(reserve).gte(0) ? closingBeforeWd.minus(reserve) : new Decimal(0));
      } else if (input.wdMode === "DYNAMIC") {
        const ratio = D(input.wdRatioPct ?? 0);
        let candidate = profit.times(ratio).div(100);
        if (input.needsCap !== undefined) {
          candidate = Decimal.min(candidate, D(input.needsCap));
        }
        wd = Decimal.min(candidate, profit);
      }
      wd = Decimal.max(wd, new Decimal(0));
    }

    const deposit = input.deposits?.[n] !== undefined ? D(input.deposits[n]!) : new Decimal(0);
    const closing = closingBeforeWd.minus(wd).plus(deposit);

    cycles.push({
      cycle: n,
      opening,
      returnPct,
      grossProfit,
      costs: cost,
      profit,
      wd,
      deposit,
      closing,
    });

    totalWd = totalWd.add(wd);
    totalProfit = totalProfit.add(profit);
    totalDeposits = totalDeposits.add(deposit);
    balance = closing;

    if (balance.gte(target)) {
      reached = true;
      break;
    }
    if (balance.lte(0)) {
      // blown account — stop simulating
      break;
    }
  }

  return {
    cycles,
    cyclesCount: cycles.length,
    finalBalance: balance,
    totalWd,
    totalProfit,
    totalDeposits,
    reached,
    targetNotReached: !reached,
  };
}

/** Estimated duration text: cycles → weeks/years for WEEKLY frequency. */
export function describeDuration(cycles: number, frequency: "DAILY" | "WEEKLY" | "MONTHLY"): {
  label: string;
  years: number | null;
} {
  if (cycles <= 0) return { label: "—", years: null };
  if (frequency === "WEEKLY") {
    const years = cycles / 52;
    return { label: `${cycles} minggu (± ${years.toFixed(1)} tahun)`, years };
  }
  if (frequency === "MONTHLY") {
    const years = cycles / 12;
    return { label: `${cycles} bulan (± ${years.toFixed(1)} tahun)`, years };
  }
  const years = cycles / 365;
  return { label: `${cycles} hari (± ${years.toFixed(1)} tahun)`, years };
}
