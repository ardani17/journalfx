import { describe, expect, it } from "vitest";
import { simulateTradeMonteCarlo, type TradeSimulationInput } from "@/lib/finance/trade-monte-carlo";

const base: TradeSimulationInput = {
  initialEquity: 100, baseRiskPercent: 10, winRate: 50, avgRR: 2, stopLossPips: 10, pipValue: 10,
  maxLotCap: 50, commissionPerLot: 0, avgSpreadAndSlippagePips: 0, drawdownThreshold: 10,
  minMarginRequirement: 0, withdrawalIntervalTrades: 1, withdrawalRatePercent: 30, ruinLossPercent: 10,
  totalTrades: 4, tradesPerCycle: 2, iterations: 1, enableDrawdownThrottle: true, enableWithdrawal: false,
};

describe("Trade Monte Carlo", () => {
  it("halves risk at the threshold and restores it after the equity recovers", () => {
    const rolls = [0.9, 0.1, 0.1, 0.9];
    const result = simulateTradeMonteCarlo(base, () => rolls.shift()!);
    expect(result.steps.map(({ lot, riskPercent, closing }) => [lot, riskPercent, closing])).toEqual([
      [0.10, 10, 90],
      [0.04, 5, 98],
      [0.09, 10, 116],
      [0.11, 10, 105],
    ]);
    expect(result.chart[0]).toMatchObject({ trade: 1, p5: 90, p95: 90, expected: 105 });
  });

  it("floors position size, applies min lot and cap, and charges both outcomes once", () => {
    const costs = { commissionPerLot: 5, avgSpreadAndSlippagePips: 1, totalTrades: 1 };
    const capped = simulateTradeMonteCarlo({ ...base, ...costs, maxLotCap: 0.055 }, () => 0.1);
    expect(capped.steps[0]).toMatchObject({ lot: 0.05, actualRisk: 5, cost: 0.75, gross: 10, net: 9.25 });
    const minimum = simulateTradeMonteCarlo({ ...base, ...costs, baseRiskPercent: 0.01 }, () => 0.9);
    expect(minimum.steps[0]).toMatchObject({ lot: 0.01, actualRisk: 1, cost: 0.15, gross: -1, net: -1.15 });
  });

  it("accounts for withdrawals separately, then freezes a path at the margin floor", () => {
    const rolls = [0.1, 0.9];
    const result = simulateTradeMonteCarlo({ ...base, enableWithdrawal: true, minMarginRequirement: 105 }, () => rolls.shift()!);
    expect(result.steps).toHaveLength(0);
    expect(result.chart.map(({ p50 }) => p50)).toEqual([100, 100, 100, 100]);
    expect(result.example.stopped).toBe(true);

    const stopped = simulateTradeMonteCarlo({ ...base, enableWithdrawal: true, minMarginRequirement: 95 }, () => {
      return rolls.shift() ?? 0.9;
    });
    expect(stopped.steps[0]).toMatchObject({ withdrawal: 6, closing: 114 });
    expect(stopped.example.withdrawn).toBe(6);
    expect(stopped.steps.at(-1)?.stopped).toBe(true);
    expect(stopped.chart.at(-1)?.p50).toBe(stopped.steps.at(-1)?.closing);
  });

  it("includes stopped paths in percentiles and computes risk across all iterations", () => {
    const rolls = [0.9, 0.1, 0.1];
    const result = simulateTradeMonteCarlo({ ...base, iterations: 2, totalTrades: 2, minMarginRequirement: 90, ruinLossPercent: 5 }, () => rolls.shift()!);
    expect(result.chart[1]).toMatchObject({ p5: 92.7, p25: 103.5, p50: 117, p75: 130.5, p95: 141.3 });
    expect(result.riskOfRuin).toBe(50);
    expect(result.meanMaxDrawdown).toBe(5);
    expect(result.p95MaxDrawdown).toBe(9.5);
    expect(result.meanLossStreak).toBe(0.5);
    expect(result.maxLossStreak).toBe(1);
    expect(result.steps).toHaveLength(1);
  });

  it("rejects zero denominators and non-finite or oversized inputs", () => {
    expect(() => simulateTradeMonteCarlo({ ...base, pipValue: 0 })).toThrow();
    expect(() => simulateTradeMonteCarlo({ ...base, avgRR: Infinity })).toThrow();
    expect(() => simulateTradeMonteCarlo({ ...base, iterations: 5001 })).toThrow();
  });
});
