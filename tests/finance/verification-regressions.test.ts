import { describe, expect, it } from "vitest";
import { simulate } from "@/lib/finance/compounding";
import { wdRecommendation } from "@/lib/finance/withdrawal";
import { allocationSchema } from "@/lib/validation/finance";
import { projectRepayment } from "@/lib/finance/debt";
import { parseStatementCsv } from "@/lib/finance/import-parsers";

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

  it("preserves three decimal prices and small lots in statement imports", () => {
    const result = parseStatementCsv("Ticket,Open Time,Type,Size,Item,Price\n1,2026.11.16 08:00,buy,0.001,XAUUSD,2000.123");
    expect(result.rows[0]!.lot).toBe(0.001);
    expect(result.rows[0]!.openPrice).toBe(2000.123);
  });
  it("rejects invalid statement dates instead of replacing them with today", () => {
    const result = parseStatementCsv("Ticket,Open Time,Type,Size,Item,Price\n1,invalid,buy,0.1,XAUUSD,2000");
    expect(result.rows).toHaveLength(0);
    expect(result.errors.length).toBeGreaterThan(0);
  });
  it("does not realize a full MT5 position when the imported exit volume is partial", () => {
    const result = parseStatementCsv("Time,Deal,Symbol,Type,Direction,Volume,Price\n2026.11.16 08:00,1,XAUUSD,buy,in,0.1,2000\n2026.11.16 09:00,2,XAUUSD,sell,out,0.04,2001");
    expect(result.rows).toHaveLength(0);
    expect(result.errors.join()).toContain("partial");
  });
});
