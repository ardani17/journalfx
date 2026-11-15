import { D, Decimal } from "@/lib/money";

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
  periodsPerYear: number; // 12 monthly, 52 weekly
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
  const r = input.annualInterestRatePct !== null && input.annualInterestRatePct !== undefined
    ? D(input.annualInterestRatePct).div(100).div(input.periodsPerYear)
    : null;
  const installment = input.installmentAmount !== null && input.installmentAmount !== undefined
    ? D(input.installmentAmount)
    : null;

  if (installment === null || installment.lte(0)) {
    return {
      complete: false,
      periods: null,
      totalInterest: null,
      schedule: [],
      note: "Cicilan wajib belum diketahui — proyeksi belum lengkap (PRD)",
    };
  }

  const schedule: ProjectionResult["schedule"] = [];
  let remaining = remaining0;
  let totalInterest = new Decimal(0);
  const maxPeriods = Math.min(input.maxPeriods ?? 1200, 1200);
  let periods = 0;

  while (remaining.gt(0) && periods < maxPeriods) {
    periods++;
    const interest = r ? remaining.times(r) : new Decimal(0);
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
