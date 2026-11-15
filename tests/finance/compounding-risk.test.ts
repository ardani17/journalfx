import { describe, expect, it } from "vitest";
import { simulate, describeDuration } from "@/lib/finance/compounding";
import { adjustedDrawdown, positionSize } from "@/lib/finance/risk";


describe("simulate — PRD acceptance", () => {
  it("$200 × 5% → profit $10, WD 50% → $5, closing $205", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1_000_000,
      returnPerCyclePct: 5,
      wdMode: "DYNAMIC",
      wdRatioPct: 50,
      maxCycles: 1,
    });
    const c = r.cycles[0]!;
    expect(c.grossProfit.toFixed(2)).toBe("10.00");
    expect(c.wd.toFixed(2)).toBe("5.00");
    expect(c.closing.toFixed(2)).toBe("205.00");
    expect(r.totalWd.toFixed(2)).toBe("5.00");
  });

  it("target already reached → zero cycles", () => {
    const r = simulate({
      initialCapital: 1_000_000,
      target: 1_000_000,
      returnPerCyclePct: 5,
      wdMode: "NONE",
    });
    expect(r.cyclesCount).toBe(0);
    expect(r.reached).toBe(true);
    expect(r.targetNotReached).toBe(false);
  });

  it("negative return week → WD zero (never from principal)", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1000,
      returnPerCyclePct: 5,
      wdMode: "DYNAMIC",
      wdRatioPct: 50,
      stressReturns: { 1: -5 },
      maxCycles: 1,
    });
    const c = r.cycles[0]!;
    expect(c.profit.toFixed(2)).toBe("-10.00");
    expect(c.wd.toFixed(0)).toBe("0");
    expect(c.closing.toFixed(2)).toBe("190.00");
  });

  it("horizon exceeded → targetNotReached", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1_000_000,
      returnPerCyclePct: 1,
      wdMode: "NONE",
      maxCycles: 10,
    });
    expect(r.reached).toBe(false);
    expect(r.targetNotReached).toBe(true);
    expect(r.cyclesCount).toBe(10);
  });

  it("costs reduce profit; deposits add after WD", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1000,
      returnPerCyclePct: 5,
      wdMode: "NONE",
      costPerCycle: 1,
      deposits: { 1: 50 },
      maxCycles: 1,
    });
    const c = r.cycles[0]!;
    expect(c.profit.toFixed(2)).toBe("9.00"); // 10 − 1
    expect(c.closing.toFixed(2)).toBe("259.00"); // 200 + 9 + 50
  });

  it("FIXED wd capped by profit", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1000,
      returnPerCyclePct: 5,
      wdMode: "FIXED",
      fixedWdAmount: 100,
      maxCycles: 1,
    });
    expect(r.cycles[0]!.wd.toFixed(2)).toBe("10.00"); // capped at profit
  });

  it("DYNAMIC wd respects needs cap", () => {
    const r = simulate({
      initialCapital: 1000,
      target: 100000,
      returnPerCyclePct: 5,
      wdMode: "DYNAMIC",
      wdRatioPct: 50,
      needsCap: 10,
      maxCycles: 1,
    });
    expect(r.cycles[0]!.wd.toFixed(2)).toBe("10.00"); // min(25, 10)
  });

  it("reference estimate: $200→$1M at 5%/week = 175 cycles (mockup's 161 is illustrative; PRD formulas win)", () => {
    const r = simulate({
      initialCapital: 200,
      target: 1_000_000,
      returnPerCyclePct: 5,
      wdMode: "NONE",
      maxCycles: 500,
    });
    expect(r.reached).toBe(true);
    // ln(5000)/ln(1.05) = 174.56 → 175 whole cycles
    expect(r.cyclesCount).toBeGreaterThanOrEqual(174);
    expect(r.cyclesCount).toBeLessThanOrEqual(176);
    expect(r.finalBalance.gte(1_000_000)).toBe(true);
  });
});

describe("describeDuration", () => {
  it("weekly 161 cycles ≈ 3.1 years", () => {
    const d = describeDuration(161, "WEEKLY");
    expect(d.label).toContain("161 minggu");
    expect(d.years).toBeCloseTo(3.1, 1);
  });
});

describe("positionSize", () => {
  // XAUUSD: contract 100, lot step 0.01, min 0.01
  it("computes and floors to lot step", () => {
    const r = positionSize({
      balance: 500,
      riskPct: 1, // $5
      entry: 2025.4,
      stopLoss: 2020.4, // 5.0 distance
      contractSize: 100,
    });
    expect(r.riskAmount.toFixed(2)).toBe("5.00");
    expect(r.rawLots.toFixed(4)).toBe("0.0100");
    expect(r.lots.toFixed(2)).toBe("0.01");
    expect(r.valid).toBe(true);
  });

  it("includes cost per lot in denominator", () => {
    const r = positionSize({
      balance: 500,
      riskPct: 1,
      entry: 2025.4,
      stopLoss: 2020.4,
      contractSize: 100,
      costPerLot: 5, // denom 505 → 5/505 = 0.0099 → floor 0.00 → reject
    });
    expect(r.lots.toFixed(2)).toBe("0.00");
    expect(r.valid).toBe(false);
    expect(r.reasons[0]).toContain("minimum");
  });

  it("rejects when minimum lot exceeds risk limit (PRD acceptance)", () => {
    const r = positionSize({
      balance: 100,
      riskPct: 1, // $1 risk
      entry: 2025.4,
      stopLoss: 2015.4, // 10 distance → denom 1000 → 0.001 lots
      contractSize: 100,
      lotMin: 0.01,
    });
    expect(r.valid).toBe(false);
    expect(r.reasons.join()).toContain("DITOLAK");
  });

  it("zero SL distance rejected", () => {
    const r = positionSize({
      balance: 500,
      riskPct: 1,
      entry: 2025.4,
      stopLoss: 2025.4,
      contractSize: 100,
    });
    expect(r.valid).toBe(false);
  });

  it("stale equity produces warning only (no block)", () => {
    const r = positionSize({
      balance: 500,
      riskPct: 1,
      entry: 2025.4,
      stopLoss: 2020.4,
      contractSize: 100,
      equityUpdatedAt: new Date(Date.now() - 15 * 60 * 1000),
    });
    expect(r.valid).toBe(true);
    expect(r.warnings.join()).toContain("tidak segar");
  });
});

describe("adjustedDrawdown", () => {
  it("deposits do not mask drawdown", () => {
    // equity 1000 → 900 (dd 10%) → deposit 200 (equity 1100) → 1000
    const r = adjustedDrawdown([
      { at: new Date("2026-01-01"), equity: 1000, netCashFlow: 0 },
      { at: new Date("2026-01-02"), equity: 900, netCashFlow: 0 },
      { at: new Date("2026-01-03"), equity: 1100, netCashFlow: 200 },
      { at: new Date("2026-01-04"), equity: 1000, netCashFlow: 200 },
    ]);
    // adjusted: 1000, 900, 900, 800 → peak 1000, max dd (1000−800)/1000 = 20%
    expect(r.maxDdPct.toFixed(1)).toBe("20.0");
    expect(r.currentDdPct.toFixed(1)).toBe("20.0");
  });

  it("no drawdown on flat equity", () => {
    const r = adjustedDrawdown([
      { at: new Date("2026-01-01"), equity: 500, netCashFlow: 0 },
      { at: new Date("2026-01-02"), equity: 500, netCashFlow: 0 },
    ]);
    expect(r.maxDdPct.toFixed(1)).toBe("0.0");
  });
});
