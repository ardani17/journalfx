import { describe, expect, it } from "vitest";
import { defaultExplorationInput, explorationPaths, explorationSchema, simulateExploration } from "@/lib/finance/exploration-monte-carlo";

describe("Monte Carlo exploration", () => {
  it("replays the same wins and losses for the same seed and draws a new path when rerolled", () => {
    const input = defaultExplorationInput(1000, 10000);
    const first = simulateExploration(input, 42);
    expect(first.sample.some(({ win }) => win)).toBe(true);
    expect(first.sample.some(({ win }) => !win)).toBe(true);
    expect(simulateExploration(input, 42)).toEqual(first);
    expect(simulateExploration(input, 43).sample.map(({ win }) => win)).not.toEqual(first.sample.map(({ win }) => win));
    expect(first.chart.at(-1)!.bounds[0]).toBeLessThan(first.median);
    expect(first.chart.at(-1)!.bounds[1]).toBeGreaterThan(first.median);
  });

  it("counts paths that touch the target and stops trading at a zero balance", () => {
    const input = { ...defaultExplorationInput(1000, 1060), trades: 3 };
    const wins = simulateExploration({ ...input, winRate: 100 }, 42);
    expect(wins.reachedCount).toBe(explorationPaths);
    expect(wins.sample[0]!.closing).toBe(1060);

    const losses = simulateExploration({ ...input, winRate: 0, lossReturn: 100, fee: "10" }, 42);
    expect(losses.reachedCount).toBe(0);
    expect(losses.sample).toHaveLength(1);
    expect(losses.sample[0]).toMatchObject({ opening: 1000, profit: -1000, closing: 0 });
    expect(losses.chart).toHaveLength(4);
    expect(losses.chart.at(-1)!.bounds).toEqual([0, 0]);
  });

  it("does not count a large balance that falls one dollar short of the target", () => {
    const input = explorationSchema.parse({
      ...defaultExplorationInput(1_000_000_000_000_000, 1_000_000_000_000_001),
      trades: 1, winRate: 100, winReturn: 100, withdrawal: "DYNAMIC", withdrawalRate: 100,
    });
    expect(simulateExploration(input, 42).reachedCount).toBe(0);
  });

  it("preserves exact amounts above the safe integer range and accepts older numeric saved inputs", () => {
    const input = explorationSchema.parse({
      ...defaultExplorationInput("9999999999999999.99", "10000000000000000"),
      trades: 1, fee: 1.234, withdrawal: "FIXED", withdrawalAmount: "1", winRate: 0,
    });
    expect(input).toMatchObject({ capital: "9999999999999999.99", target: "10000000000000000", fee: "1.23" });
    expect(simulateExploration(input, 42).reachedCount).toBe(0);
    expect(explorationSchema.shape.capital.safeParse("9999999999999999.999999999999999").success).toBe(false);
  });
});
