import { describe, expect, it } from "vitest";
import { defaultExplorationInput, explorationPaths, simulateExploration } from "@/lib/finance/exploration-monte-carlo";

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

    const losses = simulateExploration({ ...input, winRate: 0, lossReturn: 100, fee: 10 }, 42);
    expect(losses.reachedCount).toBe(0);
    expect(losses.sample).toHaveLength(1);
    expect(losses.sample[0]).toMatchObject({ opening: 1000, profit: -1000, closing: 0 });
    expect(losses.chart).toHaveLength(4);
    expect(losses.chart.at(-1)!.bounds).toEqual([0, 0]);
  });
});
