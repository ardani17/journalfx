import { D, Decimal } from "@/lib/money";

export const DEBT_FREQUENCIES = ["weekly", "monthly", "yearly"] as const;
export type DebtFrequency = (typeof DEBT_FREQUENCIES)[number];
export type DebtSchedule = DebtFrequency | "one_time" | "flexible";

export const DEBT_PERIODS_PER_YEAR: Record<DebtFrequency, number> = { weekly: 52, monthly: 12, yearly: 1 };

export function debtSchedule(debt: { repaymentMode: string | null; installmentFreq: string | null }): DebtSchedule {
  if (debt.repaymentMode === "one_time" || debt.repaymentMode === "flexible") return debt.repaymentMode;
  // The original calculator treated a missing frequency as monthly.
  return debt.installmentFreq === "weekly" || debt.installmentFreq === "yearly" ? debt.installmentFreq : "monthly";
}

export function isRecurringDebt(schedule: DebtSchedule): schedule is DebtFrequency {
  return schedule !== "one_time" && schedule !== "flexible";
}

export function debtDateKey(date: Date | null): string | null {
  return date?.toISOString().slice(0, 10) ?? null;
}

/** Calendar dates are ISO date strings, so comparing them needs no time-of-day conversion. */
export function scheduledDebtDate(schedule: DebtSchedule, firstDate: string | null, today: string): string | null {
  if (firstDate === null || schedule === "one_time") return firstDate;
  if (schedule !== "yearly") return null;
  if (firstDate >= today) return firstDate;

  const anniversary = (year: number) => {
    const leapYear = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
    const monthDay = firstDate.slice(5);
    return `${String(year).padStart(4, "0")}-${monthDay === "02-29" && !leapYear ? "02-28" : monthDay}`;
  };
  const year = Number(today.slice(0, 4));
  const thisYear = anniversary(year);
  return thisYear >= today ? thisYear : anniversary(year + 1);
}

/**
 * Debt repayment math — principal, interest and fees kept separate.
 * Only the principal portion reduces principalRemaining (PRD acceptance).
 */

export interface SplitInput {
  totalAmount: Decimal | number | string;
  interestPortion: Decimal | number | string;
  feePortion: Decimal | number | string;
  principalRemaining: Decimal | number | string;
}

export interface SplitResult {
  totalAmount: Decimal;
  interestPortion: Decimal;
  feePortion: Decimal;
  principalPortion: Decimal;
  remainingAfter: Decimal;
  paidOff: boolean;
}

export function splitDebtPayment(input: SplitInput): SplitResult {
  const total = D(input.totalAmount);
  const interest = D(input.interestPortion);
  const fee = D(input.feePortion);
  const remaining = D(input.principalRemaining);

  if (interest.plus(fee).gt(total)) {
    throw new Error("Porsi bunga + biaya melebihi total pembayaran");
  }
  const principalPortion = Decimal.min(total.minus(interest).minus(fee), Decimal.max(remaining, new Decimal(0)));
  const remainingAfter = Decimal.max(remaining.minus(principalPortion), new Decimal(0));
  return {
    totalAmount: total,
    interestPortion: interest,
    feePortion: fee,
    principalPortion,
    remainingAfter,
    paidOff: remainingAfter.lte(0),
  };
}

/**
 * Repayment projection with unknown terms flagged.
 * Simple straight-line projection: fixed installment until principal cleared,
 * interest accrued per period on remaining balance. When terms are unknown the
 * projection is marked incomplete (PRD: unknown debt terms → projections incomplete).
 */
export interface ProjectionInput {
  principalRemaining: Decimal | number | string;
  installmentAmount: Decimal | number | string | null;
  periodsPerYear: number;
  annualInterestRatePct: Decimal | number | string | null; // null = unknown
  maxPeriods?: number;
}

export interface ProjectionResult {
  complete: boolean;
  periods: number | null;
  totalInterest: Decimal | null;
  schedule: { period: number; interest: Decimal; principal: Decimal; remaining: Decimal }[];
  note: string;
}

export function projectRepayment(input: ProjectionInput): ProjectionResult {
  const remaining0 = D(input.principalRemaining);
  if (remaining0.lte(0)) {
    return { complete: true, periods: 0, totalInterest: D(0), schedule: [], note: "Hutang sudah lunas" };
  }
  if (input.annualInterestRatePct == null) {
    return { complete: false, periods: null, totalInterest: null, schedule: [], note: "Bunga belum diketahui — proyeksi belum lengkap" };
  }
  const r = D(input.annualInterestRatePct).div(100).div(input.periodsPerYear);
  const installment = input.installmentAmount !== null && input.installmentAmount !== undefined
    ? D(input.installmentAmount)
    : null;

  if (installment === null || installment.lte(0)) {
    return {
      complete: false,
      periods: null,
      totalInterest: null,
      schedule: [],
      note: "Nominal cicilan belum diketahui",
    };
  }

  const schedule: ProjectionResult["schedule"] = [];
  let remaining = remaining0;
  let totalInterest = new Decimal(0);
  const maxPeriods = Math.min(input.maxPeriods ?? 1200, 1200);
  let periods = 0;

  while (remaining.gt(0) && periods < maxPeriods) {
    periods++;
    const interest = remaining.times(r);
    // installment covers interest first, remainder reduces principal
    const principalPart = Decimal.min(installment.minus(interest), remaining);
    if (principalPart.lte(0)) {
      return {
        complete: false,
        periods: null,
        totalInterest: null,
        schedule,
        note: "Cicilan tidak menutup bunga — hutang tidak akan lunas dengan cicilan ini",
      };
    }
    remaining = remaining.minus(principalPart);
    totalInterest = totalInterest.add(interest);
    schedule.push({ period: periods, interest, principal: principalPart, remaining });
  }

  const complete = remaining.lte(0);
  return {
    complete,
    periods: complete ? periods : null,
    totalInterest,
    schedule: schedule.slice(0, 360), // cap payload
    note: complete
      ? `Lunas dalam ${periods} periode (estimasi)`
      : `Belum lunas dalam ${maxPeriods} periode — naikkan cicilan`,
  };
}
