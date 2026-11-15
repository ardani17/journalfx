import { describe, expect, it } from "vitest";
import { disciplineScore } from "@/lib/finance/discipline";

describe("disciplineScore — PRD weights", () => {
  it("perfect discipline = 100", () => {
    const r = disciplineScore({
      riskRespected: { ok: 10, total: 10 },
      setupFollowed: { ok: 10, total: 10 },
      slPresent: { ok: 10, total: 10 },
      emotionsClean: { ok: 10, total: 10 },
      completeness: { ok: 10, total: 10 },
      frequencyOk: { ok: 10, total: 10 },
    });
    expect(r.total).toBe(100);
    expect(r.missing).toHaveLength(0);
  });

  it("applies weights: risk 30% dominates", () => {
    const r = disciplineScore({
      riskRespected: { ok: 0, total: 10 }, // 0 × 30
      setupFollowed: { ok: 10, total: 10 }, // 100 × 25
      slPresent: { ok: 10, total: 10 }, // 100 × 15
      emotionsClean: { ok: 10, total: 10 }, // 100 × 15
      completeness: { ok: 10, total: 10 }, // 100 × 10
      frequencyOk: { ok: 10, total: 10 }, // 100 × 5
    });
    // (0×30 + 100×70)/100 = 70
    expect(r.total).toBe(70);
  });

  it("missing components are excluded and flagged, weights renormalized", () => {
    const r = disciplineScore({
      riskRespected: { ok: 5, total: 10 }, // 50, weight 30
      setupFollowed: { ok: 10, total: 10 }, // 100, weight 25
      // others missing
    });
    // (50×30 + 100×25)/(30+25) = (1500+2500)/55 = 72.7
    expect(r.total).toBeCloseTo(72.7, 1);
    expect(r.missing).toContain("Stop Loss");
    expect(r.missing).toContain("Emosi");
  });

  it("no data at all → null total", () => {
    const r = disciplineScore({});
    expect(r.total).toBeNull();
    expect(r.missing).toHaveLength(6);
  });
});
