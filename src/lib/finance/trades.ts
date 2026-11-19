import { D, Decimal } from "@/lib/money";

/**
 * Trade pricing engine — pure functions, decimal arithmetic, no IO.
 *
 * Conventions:
 * - LONG profits when exit > entry; SHORT when exit < entry.
 * - Gross P&L per close = priceDiff × contractSize × closedQty × dir.
 * - Costs (commission/swap/fees) recorded per execution reduce net P&L.
 * - Partial closes recognize ONLY the closed portion (PRD acceptance).
 * - Weighted average entry price for multi-fill entries.
 */

export type Direction = "LONG" | "SHORT";

export interface ExecutionLike {
  kind: "ENTRY" | "PARTIAL_ENTRY" | "CLOSE" | "PARTIAL_CLOSE";
  quantity: Decimal | number | string;
  price: Decimal | number | string;
  commission?: Decimal | number | string;
  swap?: Decimal | number | string;
  fees?: Decimal | number | string;
  realizedPnl?: Decimal | number | string | null;
}

export interface InstrumentSpec {
  contractSize: Decimal | number | string;
}

export interface CloseResult {
  /** net realized P&L attributable to THIS close (incl. its cost share) */
  realizedPnl: Decimal;
  /** remaining open quantity after this close */
  remainingQty: Decimal;
}

function dirSign(direction: Direction): 1 | -1 {
  return direction === "LONG" ? 1 : -1;
}

/** Weighted average entry price across ENTRY/PARTIAL_ENTRY fills. */
export function avgEntryPrice(entries: ExecutionLike[]): Decimal {
  let qtySum = new Decimal(0);
  let notional = new Decimal(0);
  for (const e of entries) {
    const q = D(e.quantity);
    qtySum = qtySum.add(q);
    notional = notional.add(q.times(D(e.price)));
  }
  if (qtySum.isZero()) return new Decimal(0);
  return notional.div(qtySum);
}

/** Total costs booked on an execution. */
export function executionCosts(e: ExecutionLike): Decimal {
  return D(e.commission).add(D(e.swap)).add(D(e.fees));
}

/**
 * Realized P&L for one (partial) close against the average entry.
 * gross = (exit − avgEntry) × contractSize × qty × dir
 * net   = gross − costs(close)
 */
export function closePnl(
  direction: Direction,
  avgEntry: Decimal,
  close: ExecutionLike,
  spec: InstrumentSpec,
): Decimal {
  const q = D(close.quantity);
  const gross = D(close.price)
    .minus(avgEntry)
    .times(D(spec.contractSize))
    .times(q)
    .times(dirSign(direction));
  return gross.minus(executionCosts(close));
}

/**
 * Fold executions into: net realized P&L, avg entry, open qty, closed qty.
 * Entries and closes must be in execution order.
 */
export interface TradeRollup {
  avgEntry: Decimal;
  openQty: Decimal;
  closedQty: Decimal;
  totalCosts: Decimal;
  realizedPnl: Decimal;
  isFullyClosed: boolean;
}

export function rollupExecutions(
  direction: Direction,
  executions: ExecutionLike[],
  spec: InstrumentSpec | null,
): TradeRollup {
  const entries = executions.filter((e) => e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY");

  const avgEntry = avgEntryPrice(entries);
  let enteredQty = new Decimal(0);
  let closedQty = new Decimal(0);
  let costs = new Decimal(0);
  let realized = new Decimal(0);
  for (const e of executions) {
    costs = costs.add(executionCosts(e));
    if (e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY") {
      enteredQty = enteredQty.add(D(e.quantity));
    } else {
      closedQty = closedQty.add(D(e.quantity));
      if (e.realizedPnl != null) realized = realized.add(D(e.realizedPnl));
      else if (spec) realized = realized.add(closePnl(direction, avgEntry, e, spec));
      else throw new Error("Eksekusi penutupan memerlukan P&L atau spesifikasi kontrak");
    }
  }
  return {
    avgEntry,
    openQty: Decimal.max(enteredQty.minus(closedQty), new Decimal(0)),
    closedQty,
    totalCosts: costs,
    realizedPnl: realized,
    isFullyClosed: closedQty.gte(enteredQty) && !enteredQty.isZero(),
  };
}

/** Actual R multiple = realizedPnl / initialRisk (null when risk unknown/zero). */
export function actualR(realizedPnl: Decimal, initialRisk: Decimal | null | undefined): Decimal | null {
  if (initialRisk === null || initialRisk === undefined) return null;
  const risk = D(initialRisk);
  if (risk.isZero()) return null;
  return realizedPnl.div(risk);
}

/** Planned R:R from entry/SL/TP (risk : reward). Null when SL/TP missing. */
export function plannedRR(
  direction: Direction,
  entry: Decimal,
  sl: Decimal | null | undefined,
  tp: Decimal | null | undefined,
  spec: InstrumentSpec,
  lot: Decimal,
): Decimal | null {
  if (sl === null || sl === undefined || tp === null || tp === undefined) return null;
  const risk = D(entry).minus(D(sl)).abs().times(D(spec.contractSize)).times(D(lot));
  const reward = D(tp).minus(D(entry)).abs().times(D(spec.contractSize)).times(D(lot));
  if (risk.isZero() || reward.isZero()) return null;
  return reward.div(risk);
}

/** Initial risk in USD from entry/SL (positive), null when SL missing. */
export function initialRiskUsd(
  direction: Direction,
  entry: Decimal,
  sl: Decimal | null | undefined,
  spec: InstrumentSpec,
  lot: Decimal,
): Decimal | null {
  if (sl === null || sl === undefined) return null;
  const dist = D(entry).minus(D(sl)).abs();
  if (dist.isZero()) return null;
  return dist.times(D(spec.contractSize)).times(D(lot));
}

export type TradeStatusCalculated = "PLANNED" | "OPEN" | "PARTIAL" | "CLOSED" | "CANCELLED";

export function deriveStatus(
  cancelled: boolean,
  enteredQty: Decimal,
  closedQty: Decimal,
): TradeStatusCalculated {
  if (cancelled) return "CANCELLED";
  if (enteredQty.isZero()) return "PLANNED";
  if (closedQty.isZero()) return "OPEN";
  if (closedQty.gte(enteredQty)) return "CLOSED";
  return "PARTIAL";
}
