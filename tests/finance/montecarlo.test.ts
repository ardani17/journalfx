import { describe, expect, it } from "vitest";
import { monteCarlo, mulberry32 } from "@/lib/finance/montecarlo";

describe("mulberry32", () => {
  it("is deterministic per seed", () => {
    const a = mulberry32(42);
    const b = mulberry32(42);
    expect([a(), a(), a()]).toEqual([b(), b(), b()]);
  });
  it("produces [0,1)", () => {
    const r = mulberry32(7);
    for (let i = 0; i < 1000; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe("monteCarlo", () => {
  const base = {
    historicalR: [1, 2, -1, 0.5, 3, -1, 1.5, -0.5, 2, -1],
    startingBalance: 500,
    riskPctPerTrade: 1,
    tradesPerPath: 50,
    paths: 400,
    maxDdPct: 30,
  };

  it("reproducible: same seed → identical result", () => {
    const a = monteCarlo({ ...base, seed: 123 });
    const b = monteCarlo({ ...base, seed: 123 });
    expect(a.p50).toEqual(b.p50);
    expect(a.riskOfRuinPct).toBe(b.riskOfRuinPct);
  });

  it("different seed → different paths (statistically)", () => {
    const a = monteCarlo({ ...base, seed: 1 });
    const b = monteCarlo({ ...base, seed: 2 });
    expect(a.p50).not.toEqual(b.p50);
  });

  it("bands are ordered p10 ≤ p50 ≤ p90 at every step", () => {
    const r = monteCarlo({ ...base, seed: 9 });
    for (let i = 0; i < r.p50.length; i++) {
      expect(r.p10[i]!).toBeLessThanOrEqual(r.p50[i]!);
      expect(r.p50[i]!).toBeLessThanOrEqual(r.p90[i]!);
    }
  });

  it("positive-expectancy sample yields median growth", () => {
    // avg R = (1+2+3+1.5+2+0.5 - 3.5)/10 = 0.65 > 0
    const r = monteCarlo({ ...base, seed: 5 });
    expect(r.medianFinal).toBeGreaterThan(500);
  });

  it("small sample flagged with caveat", () => {
    const r = monteCarlo({ ...base, historicalR: [1, -1], seed: 3 });
    expect(r.caveat).toContain("Sampel historis kecil");
  });

  it("throws on empty history", () => {
    expect(() => monteCarlo({ ...base, historicalR: [], seed: 1 })).toThrow();
  });
});
