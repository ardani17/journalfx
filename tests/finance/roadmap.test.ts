import { describe, expect, it } from "vitest";
import { describeProjection, simulate } from "@/lib/finance/compounding";
import { ledgerMilestones, projectedMilestones, roadmapAmounts } from "@/lib/finance/roadmap";
import { D } from "@/lib/money";

describe("roadmap", () => {
  it("caps the nominal thresholds at the exact target and retains the target when already covered", () => {
    const thresholds = [200, 500, 1_000, 2_500];
    expect(roadmapAmounts(D("750.25"), thresholds, D(200)).map(String)).toEqual(["500", "750.25"]);
    expect(roadmapAmounts(D(100), thresholds, D(200)).map(String)).toEqual(["100"]);
  });

  it("uses the first simulated crossing, including cycle zero and unreachable milestones", () => {
    const result = simulate({
      initialCapital: 100, target: 150, returnPerCyclePct: 20, wdMode: "NONE",
      stressReturns: { 2: -10 }, deposits: { 1: 10 }, maxCycles: 2,
    });
    const milestones = projectedMilestones([D(100), D(130), D(150)], D(100), result);
    expect(milestones.map(({ cycle }) => cycle)).toEqual([0, 1, null]);
    expect(describeProjection(result, "MONTHLY")).toBe("Target belum tercapai dalam 2 bulan");
    expect(describeProjection({ reached: true, cyclesCount: 0 }, "MONTHLY")).toBe("Target sudah tercapai sejak awal");
  });

  it("records first ledger crossings even if the balance later drops", () => {
    const start = new Date("2025-01-01T05:00:00Z");
    const crossing = new Date("2025-01-02T05:00:00Z");
    const { balance, hits } = ledgerMilestones([D(500), D("550.25")], [
      { amount: 250, occurredAt: start },
      { amount: "300.25", occurredAt: crossing },
      { amount: -350, occurredAt: new Date("2025-01-03T05:00:00Z") },
    ]);
    expect(balance.toString()).toBe("200.25");
    expect(hits.map(({ amount, achievedAt, balanceAtHit }) => [String(amount), achievedAt, String(balanceAtHit)])).toEqual([
      ["500", crossing, "550.25"], ["550.25", crossing, "550.25"],
    ]);
  });
});
