import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/finance/compounding";
import { wdRecommendation } from "@/lib/finance/withdrawal";
import { allocationSchema } from "@/lib/validation/finance";
import { projectRepayment } from "@/lib/finance/debt";

describe("PRD financial regression checks", () => {
  it("dynamic simulation preserves the configured capital reserve", () => {
    const result = simulate({ initialCapital: 200, target: 1000, returnPerCyclePct: 5,
      wdMode: "DYNAMIC", wdRatioPct: 50, reserve: 209, maxCycles: 1 });
    expect(result.cycles[0]!.wd.toNumber()).toBe(1);
    expect(result.finalBalance.toNumber()).toBe(209);
  });

  it("dynamic simulation recovers losses before withdrawing new profit", () => {
    const result = simulate({ initialCapital: 200, target: 1000, returnPerCyclePct: 5,
      wdMode: "DYNAMIC", wdRatioPct: 50, stressReturns: { 1: -10 }, maxCycles: 2 });
    expect(result.cycles[1]!.wd.toNumber()).toBe(0);
  });

  it("already reserved withdrawal reduces profit allowance, not remaining cash twice", () => {
    const rec = wdRecommendation({ cumulativeRealizedPnl: 100, highWaterMark: 0,
      periodProfit: 100, periodWdTaken: 20, maxWdRatioPct: 50, availableCash: 25 });
    expect(rec.recommended.toNumber()).toBe(25);
  });

  it("rejects an allocation period whose end precedes its start", () => {
    expect(allocationSchema.safeParse({ periodStart: "2026-11-16", periodEnd: "2026-11-15", amount: 10 }).success).toBe(false);
  });

  it("does not invent a payoff date when interest is unknown", () => {
    const result = projectRepayment({ principalRemaining: 1000, installmentAmount: 100, periodsPerYear: 12, annualInterestRatePct: null });
    expect(result.complete).toBe(false);
    expect(result.periods).toBeNull();
  });
});
