import { expect, it } from "vitest";
import { estimateTradingCapital, parseCapitalInput, parseMonteCarloEquity } from "@/lib/finance/trading-capital";
import { D } from "@/lib/money";
import type { JisdorQuote } from "@/lib/finance/exchange";

const quote: JisdorQuote = { rate: "16000", at: "2026-11-19T09:00:00Z", status: "cached", source: "bi-jisdor" };

it("estimates capital with Decimal from localized monthly targets and optional JISDOR", () => {
  const target = parseCapitalInput("5.000.000")!;
  const result = estimateTradingCapital(target, D(5), D(50), quote);
  expect(result).toEqual({ status: "estimated", idr: D(200_000_000), usd: D(12_500) });
  expect(estimateTradingCapital(target.div(2), D(5), D(50), null))
    .toEqual({ status: "estimated", idr: D(100_000_000), usd: null });
  expect(parseCapitalInput("2.500.000,50")).toEqual(D("2500000.50"));
  expect(parseCapitalInput("1.2.3")).toBeNull();
});

it("handles missing funding and guards simulator handoff boundaries", () => {
  for (const [rate, share] of [[0, 50], [-2, 50], [5, 0]] as const) {
    expect(estimateTradingCapital(D(5_000_000), D(rate), D(share), quote)).toEqual({ status: "no-funding" });
  }
  expect(estimateTradingCapital(D(5_000_000), D(5), D(101), quote)).toEqual({ status: "invalid" });
  expect(parseMonteCarloEquity("12500.25")).toBe(12_500.25);
  expect(parseMonteCarloEquity("100000000.00")).toBe(100_000_000);
  for (const value of ["0", "100000000.01", "1e2", "1.000,50", ["12"]]) {
    expect(parseMonteCarloEquity(value)).toBeUndefined();
  }
});
