import Decimal from "decimal.js";

// Deterministic decimal arithmetic for all money in MDTP.
// Never use JS floats for money. Convert at boundaries only.
Decimal.set({ precision: 28, toExpNeg: -18, toExpPos: 36 });

export { Decimal };

export const D = (v: Decimal.Value | null | undefined): Decimal =>
  v === null || v === undefined ? new Decimal(0) : new Decimal(v);

export const TRADING_CURRENCIES = ["USD", "USC"] as const;
export type TradingCurrency = typeof TRADING_CURRENCIES[number];

export function tradingAmountToUsd(amount: Decimal.Value | null | undefined, currency: string) {
  return currency === "USC" ? D(amount).div(100) : D(amount);
}

export function usdToTradingAmount(amount: Decimal.Value | null | undefined, currency: string) {
  return currency === "USC" ? D(amount).times(100) : D(amount);
}

export function toNum(d: Decimal): number {
  return Number(d.toString());
}

const usdFmt = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const usdFmt0 = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});
const idrFmt = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});
const pctFmt = new Intl.NumberFormat("id-ID", {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const pctFmt0 = new Intl.NumberFormat("id-ID", {
  maximumFractionDigits: 0,
});

/** $248,40 — matches MDTP mockup number style (id-ID decimals) */
export function fmtUSD(v: Decimal.Value | null | undefined, opts?: { compact?: boolean }): string {
  const d = D(v);
  if (!d.isFinite()) return "—";
  const neg = d.isNegative();
  const abs = d.abs();
  const body = opts?.compact && abs.gte(1_000_000)
    ? `${usdFmt0.format(Number(abs.div(1_000_000)))}jt`
    : usdFmt.format(abs.toString() as `${number}`);
  return `${neg ? "−" : ""}$${body}`;
}

/** $1.002.311 style without decimals for large roadmap amounts */
export function fmtUSD0(v: Decimal.Value | null | undefined): string {
  const d = D(v);
  const neg = d.isNegative();
  return `${neg ? "−" : ""}$${usdFmt0.format(toNum(d.abs()))}`;
}

/** Rp10.000.000 */
export function fmtIDR(v: Decimal.Value | null | undefined): string {
  const d = D(v);
  const neg = d.isNegative();
  return `${neg ? "−" : ""}Rp${idrFmt.format(d.abs().toString() as `${number}`)}`;
}

/** 5,00% — percent from a percent-value (5.0000 → "5,00%") */
export function fmtPct(v: Decimal.Value | null | undefined, decimals = 2): string {
  const d = D(v);
  const f = decimals === 0 ? pctFmt0 : pctFmt;
  const neg = d.isNegative();
  return `${neg ? "−" : ""}${f.format(toNum(d.abs()))}%`;
}

/** Signed USD with explicit + for gains: +$48,40 / −$12,00 */
export function fmtUSDdelta(v: Decimal.Value | null | undefined): string {
  const d = D(v);
  if (d.isZero()) return fmtUSD(d);
  return `${d.isPositive() ? "+" : ""}${fmtUSD(d)}`;
}

export function fmtTradingMoney(value: Decimal.Value, currency: string): string {
  const amount = D(value);
  return currency === "USD" ? fmtUSD(amount) : `${usdFmt.format(amount.toString() as `${number}`)} ${currency}`;
}

export function fmtTradingDelta(value: Decimal.Value, currency: string): string {
  const amount = D(value);
  return `${amount.gt(0) ? "+" : ""}${fmtTradingMoney(amount, currency)}`;
}

/** Signed percent: +24,20% */
export function fmtPctDelta(v: Decimal.Value | null | undefined): string {
  const d = D(v);
  if (d.isZero()) return fmtPct(d);
  return `${d.isPositive() ? "+" : ""}${fmtPct(d)}`;
}

export function fmtNum(v: Decimal.Value | null | undefined, decimals = 2): string {
  const d = D(v);
  const f = new Intl.NumberFormat("id-ID", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
  return f.format(toNum(d));
}

export function fmtDecimal(value: Decimal.Value, minimumFractionDigits = 2): string {
  const number = D(value);
  return new Intl.NumberFormat("id-ID", {
    minimumFractionDigits,
    maximumFractionDigits: Math.max(minimumFractionDigits, number.decimalPlaces()),
  }).format(number.toFixed() as `${number}`);
}

export const ZERO = new Decimal(0);
