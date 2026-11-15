import { describe, expect, it } from "vitest";
import {
  hwmAfterCompletion,
  monthlyToWeekly,
  needsCapForWindow,
  wdRecommendation,
} from "@/lib/finance/withdrawal";
import { splitDebtPayment } from "@/lib/finance/debt";

describe("wdRecommendation — PRD acceptance", () => {
  it("$200 balance, +$10 profit this week, 50% cap → WD $5", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 10,
      highWaterMark: 0,
      periodProfit: 10,
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 210,
    });
    expect(r.eligibleProfit.toFixed(2)).toBe("10.00");
    expect(r.recommended.toFixed(2)).toBe("5.00");
  });

  it("loss $20 then profit $10 → zero eligible WD", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: -10, // −20 + 10
      highWaterMark: 0,
      periodProfit: 10,
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 190,
    });
    expect(r.eligibleProfit.toFixed(2)).toBe("0.00");
    expect(r.recommended.toFixed(2)).toBe("0.00");
    expect(r.zeroReasons.join()).toContain("dipulihkan");
  });

  it("next profit $30 → $20 eligible (loss recovery), WD $10 at 50%", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 20, // −20 +10 +30
      highWaterMark: 0,
      periodProfit: 30,
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 220,
    });
    expect(r.eligibleProfit.toFixed(2)).toBe("20.00");
    expect(r.recommended.toFixed(2)).toBe("10.00");
  });

  it("nonpositive period profit → zero WD even with eligibility", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 50,
      highWaterMark: 10,
      periodProfit: -5, // losing week
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 300,
    });
    expect(r.recommended.toFixed(2)).toBe("0.00");
    expect(r.caps.byPeriodProfit).toBe(true);
  });

  it("HWM prevents reusing consumed eligibility", () => {
    // cum 100, WD'd up to HWM 100 → nothing eligible next week despite new tiny profit
    const r = wdRecommendation({
      cumulativeRealizedPnl: 100,
      highWaterMark: 100,
      periodProfit: 1,
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 500,
    });
    expect(r.eligibleProfit.toFixed(2)).toBe("0.00");
  });

  it("already-taken WD this period is subtracted", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 100,
      highWaterMark: 0,
      periodProfit: 40,
      periodWdTaken: 20,
      maxWdRatioPct: 50,
      availableCash: 500,
    });
    // eligible 100 → cap 50 → minus taken 20 = 30
    expect(r.recommended.toFixed(2)).toBe("30.00");
  });

  it("needs cap limits the recommendation", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 1000,
      highWaterMark: 0,
      periodProfit: 200,
      periodWdTaken: 0,
      maxWdRatioPct: 50, // 500
      needsTargetUsd: 60,
      availableCash: 2000,
    });
    expect(r.recommended.toFixed(2)).toBe("60.00");
    expect(r.caps.byNeeds).toBe(true);
  });

  it("cash above reserve limits the recommendation", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 1000,
      highWaterMark: 0,
      periodProfit: 500,
      periodWdTaken: 0,
      maxWdRatioPct: 100, // 1000
      availableCash: 1000,
      reserveUsd: 950,
    });
    expect(r.recommended.toFixed(2)).toBe("50.00");
    expect(r.caps.byCash).toBe(true);
  });

  it("stale/unknown data produce warnings", () => {
    const r = wdRecommendation({
      cumulativeRealizedPnl: 100,
      highWaterMark: 0,
      periodProfit: 20,
      periodWdTaken: 0,
      maxWdRatioPct: 50,
      availableCash: 500,
      dataStale: true,
      dataUnknown: true,
    });
    expect(r.warnings.length).toBe(2);
  });
});

describe("HWM lifecycle", () => {
  it("rises to cumulative profit on completion, never falls", () => {
    expect(hwmAfterCompletion(0, 100).toFixed(2)).toBe("100.00");
    expect(hwmAfterCompletion(100, 60).toFixed(2)).toBe("100.00"); // after further loss
  });
});

describe("needs conversion", () => {
  it("monthly ×12/52 → weekly", () => {
    expect(monthlyToWeekly(10_000_000).div(1).toFixed(0)).toBe(String(Math.round((10_000_000 * 12) / 52)));
  });
  it("outstanding budget + debt due = window cap", () => {
    expect(needsCapForWindow(2_500_000, 1_000_000).toFixed(0)).toBe("3500000");
  });
});

describe("splitDebtPayment — PRD acceptance", () => {
  it("IDR 1,000,000 incl 200,000 interest reduces principal by 800,000", () => {
    const s = splitDebtPayment({ totalAmount: 1_000_000, interestPortion: 200_000, feePortion: 0, principalRemaining: 5_000_000 });
    expect(s.principalPortion.toFixed(0)).toBe("800000");
    expect(s.remainingAfter.toFixed(0)).toBe("4200000");
  });

  it("fee portion also excluded from principal", () => {
    const s = splitDebtPayment({ totalAmount: 500_000, interestPortion: 50_000, feePortion: 25_000, principalRemaining: 1_000_000 });
    expect(s.principalPortion.toFixed(0)).toBe("425000");
    expect(s.remainingAfter.toFixed(0)).toBe("575000");
  });

  it("payment larger than remaining principal finishes the debt", () => {
    const s = splitDebtPayment({ totalAmount: 1_000_000, interestPortion: 0, feePortion: 0, principalRemaining: 300_000 });
    expect(s.remainingAfter.toFixed(0)).toBe("0");
    expect(s.paidOff).toBe(true);
  });

  it("rejects negative split", () => {
    expect(() =>
      splitDebtPayment({ totalAmount: 100, interestPortion: 200, feePortion: 0, principalRemaining: 1000 }),
    ).toThrow();
  });
});
