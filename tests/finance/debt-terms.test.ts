import { describe, expect, it } from "vitest";
import { debtSchedule, scheduledDebtDate } from "@/lib/finance/debt";
import { D } from "@/lib/money";
import { debtPaymentSchema, debtSchema, debtTermsSchema } from "@/lib/validation/finance";
import { debtProjection } from "@/server/services/finance";

describe("debt terms", () => {
  it("distinguishes zero interest from an unknown rate", () => {
    const input = { name: "Hutang pribadi", principalOriginal: "550000", repaymentMode: "flexible" };
    expect(debtSchema.parse({ ...input, interestRate: "0" }).interestRate).toBe(0);
    expect(debtSchema.parse({ ...input, interestRate: "   " }).interestRate).toBeNull();
    expect(debtSchema.parse({ ...input, interestRate: null }).interestRate).toBeNull();
    expect(debtSchema.safeParse({ ...input, interestRate: false }).success).toBe(false);
  });

  it("rejects fractional cents before computing the remaining principal", () => {
    expect(debtPaymentSchema.safeParse({ totalAmount: "99.999" }).success).toBe(false);
    expect(debtPaymentSchema.safeParse({ totalAmount: "100", interestPortion: "0.005" }).success).toBe(false);
    expect(debtPaymentSchema.parse({ totalAmount: "99.99", feePortion: "0.01" })).toMatchObject({
      totalAmount: 99.99, feePortion: 0.01,
    });
  });

  it("requires a valid date for a one-time payoff and rejects incompatible terms", () => {
    const oneTime = { repaymentMode: "one_time", interestRate: null };
    expect(debtTermsSchema.safeParse(oneTime).success).toBe(false);
    expect(debtTermsSchema.safeParse({ ...oneTime, dueDate: "2027-02-29" }).success).toBe(false);
    expect(debtTermsSchema.parse({ ...oneTime, dueDate: "2028-02-29" }).dueDate).toBe("2028-02-29");
    expect(debtTermsSchema.safeParse({ ...oneTime, dueDate: "2028-02-29", installmentAmount: 1000 }).success).toBe(false);
    expect(debtTermsSchema.safeParse({ repaymentMode: "flexible", interestRate: 0, dueDate: "2028-02-29" }).success).toBe(false);
  });

  it("accepts yearly installments with or without a date and accepts legacy requests", () => {
    const yearly = { repaymentMode: "recurring", installmentFreq: "yearly", installmentAmount: "1200000", interestRate: 0 };
    expect(debtTermsSchema.parse(yearly).installmentAmount).toBe(1_200_000);
    expect(debtTermsSchema.safeParse({ ...yearly, dueDate: "2027-04-01" }).success).toBe(true);
    expect(debtTermsSchema.safeParse({ ...yearly, installmentAmount: 0 }).success).toBe(false);
    expect(debtSchema.safeParse({ name: "Hutang bulanan", principalOriginal: 1000, installmentFreq: "monthly", dueDay: 25 }).success).toBe(true);
    expect(debtSchedule({ repaymentMode: null, installmentFreq: null })).toBe("monthly");
  });

  it("uses annual interest per yearly installment and omits a projection for flexible debt", () => {
    const input = { repaymentMode: "recurring", installmentFreq: "yearly", principalRemaining: D(1_200_000), installmentAmount: D(600_000) };
    const projection = debtProjection({ ...input, interestRate: D(12) });
    expect(projection?.totalInterest?.toString()).toBe("261273.6");
    expect(projection?.note).toBe("Lunas dalam 3 tahun (estimasi)");
    expect(debtProjection({ ...input, interestRate: D(0) })?.periods).toBe(2);
    expect(debtProjection({ ...input, interestRate: null })?.periods).toBeNull();
    expect(debtProjection({ ...input, repaymentMode: "flexible", installmentFreq: null, interestRate: D(0) })).toBeNull();
  });

  it("keeps first dates, advances yearly dates, and restores February 29 in leap years", () => {
    expect(scheduledDebtDate("yearly", "2028-02-29", "2026-11-18")).toBe("2028-02-29");
    expect(scheduledDebtDate("yearly", "2024-02-29", "2027-02-28")).toBe("2027-02-28");
    expect(scheduledDebtDate("yearly", "2024-02-29", "2027-03-01")).toBe("2028-02-29");
    expect(scheduledDebtDate("one_time", "2026-11-18", "2026-11-19")).toBe("2026-11-18");
    expect(scheduledDebtDate("yearly", null, "2026-11-19")).toBeNull();
  });
});
