import { convertUsdIdr, type JisdorQuote } from "@/lib/finance/exchange";
import { explorationSchema } from "@/lib/finance/exploration-monte-carlo";
import { D, type Decimal } from "@/lib/money";
import { normalizeNumericInput } from "@/lib/number-input";

export function parseCapitalInput(value: string) {
  const normalized = normalizeNumericInput(value, true);
  return normalized && normalized.length <= 24 ? D(normalized) : null;
}

export function estimateTradingCapital(target: Decimal, netReturnPct: Decimal, profitSharePct: Decimal, quote: JisdorQuote | null) {
  if (target.lte(0) || profitSharePct.lt(0) || profitSharePct.gt(100)) return { status: "invalid" } as const;
  if (netReturnPct.lte(0) || profitSharePct.isZero()) return { status: "no-funding" } as const;

  const idr = target.times(10_000).div(netReturnPct.times(profitSharePct));
  const usd = convertUsdIdr(idr, "IDR", quote);
  return { status: "estimated", idr, usd } as const;
}

export function parseMonteCarloEquity(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{1,17}(?:\.\d{1,2})?$/.test(value)) return undefined;
  return explorationSchema.shape.capital.safeParse(value).data;
}

export function monteCarloEquityStorageKey(userId: string) {
  return `horizon-journal:monte-carlo-equity:${userId}`;
}
