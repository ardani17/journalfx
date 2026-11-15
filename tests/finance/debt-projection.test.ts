import { describe, expect, it } from "vitest";
import { projectRepayment } from "@/lib/finance/debt";

describe("projectRepayment", () => {
  it("straight-line without interest", () => {
    const r = projectRepayment({
      principalRemaining: 1_000_000,
      installmentAmount: 250_000,
      periodsPerYear: 12,
      annualInterestRatePct: 0,
    });
    expect(r.complete).toBe(true);
    expect(r.periods).toBe(4);
    expect(r.totalInterest?.toFixed(0)).toBe("0");
  });

  it("interest extends the payoff", () => {
    const r = projectRepayment({
      principalRemaining: 1_000_000,
      installmentAmount: 250_000,
      periodsPerYear: 12,
      annualInterestRatePct: 24, // 2%/month
    });
    expect(r.complete).toBe(true);
    expect(r.periods!).toBeGreaterThan(4);
    expect(Number(r.totalInterest)).toBeGreaterThan(0);
  });

  it("unknown installment → incomplete projection flagged", () => {
    const r = projectRepayment({
      principalRemaining: 1_000_000,
      installmentAmount: null,
      periodsPerYear: 12,
      annualInterestRatePct: 10,
    });
    expect(r.complete).toBe(false);
    expect(r.note).toContain("belum diketahui");
  });

  it("installment below interest → flagged unpayable", () => {
    const r = projectRepayment({
      principalRemaining: 10_000_000,
      installmentAmount: 10_000,
      periodsPerYear: 12,
      annualInterestRatePct: 60, // 5%/mo = 500k > 10k installment
    });
    expect(r.complete).toBe(false);
    expect(r.note).toContain("tidak akan lunas");
  });
});
