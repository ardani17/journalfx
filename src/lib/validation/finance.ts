import { z } from "zod";
import { D } from "@/lib/money";
import { DEBT_FREQUENCIES } from "@/lib/finance/debt";

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const wdRuleSchema = z.object({
  maxWdRatio: z.coerce.number().min(1).max(100).optional(),
  needsTargetIdr: z.coerce.number().min(0).nullable().optional(),
  reserveUsd: z.coerce.number().min(0).optional(),
  minBalanceUsd: z.coerce.number().min(0).nullable().optional(),
  note: z.string().trim().max(300).optional(),
});

export const wdRequestSchema = z.object({
  accountId: z.string().min(1).optional(),
  amountUsd: z.coerce.number().positive(),
  note: z.string().trim().max(300).optional(),
});

export const wdCompleteSchema = z.object({
  fxRate: z.coerce.number().positive("Kurs USDIDR wajib diisi"),
  receivedAmount: z.coerce.number().min(0, "Jumlah diterima wajib diisi"),
  fees: z.coerce.number().min(0).optional(),
  note: z.string().trim().max(300).optional(),
});

export const categorySchema = z.object({
  name: z.string().trim().min(2, "Nama kategori minimal 2 karakter").max(60),
  plannedAmount: z.coerce.number().min(0),
});

export const financialTxSchema = z.object({
  kind: z.enum(["INCOME", "EXPENSE"]),
  amount: z.coerce.number().positive(),
  currency: z.string().length(3).default("IDR"),
  description: z.string().trim().max(200).optional(),
  categoryId: z.string().optional(),
  occurredAt: isoDate.optional(),
});

const isDebtMoney = (value: number) => D(value).decimalPlaces() <= 2 && Number.isSafeInteger(D(value).times(100).toNumber());
const moneyPrecision = "Nominal harus dalam rentang yang didukung dan maksimal dua desimal";

const numericInput = z.union([z.number(), z.string().trim().min(1)]).transform(Number);
const debtTermsFields = z.object({
  repaymentMode: z.enum(["recurring", "one_time", "flexible"]),
  interestRate: z.preprocess(
    (value) => typeof value === "string" && value.trim() === "" ? null : value,
    numericInput.pipe(z.number().min(0).max(1000)).nullable(),
  ),
  installmentAmount: numericInput.pipe(z.number().min(0).refine(isDebtMoney, moneyPrecision)).nullable().optional(),
  installmentFreq: z.enum(DEBT_FREQUENCIES).nullable().optional(),
  dueDate: z.iso.date().nullable().optional(),
});

function validateDebtTerms(value: Partial<z.output<typeof debtTermsFields>> & { dueDay?: number }, ctx: z.RefinementCtx) {
  const { repaymentMode, installmentFreq, installmentAmount, dueDate, dueDay } = value;
  if (repaymentMode === undefined) {
    if (dueDate || installmentFreq === "yearly") {
      ctx.addIssue({ code: "custom", path: ["repaymentMode"], message: "Pilih jenis jadwal pembayaran" });
    }
    return;
  }
  if (repaymentMode === "recurring") {
    if (!installmentFreq) {
      ctx.addIssue({ code: "custom", path: ["installmentFreq"], message: "Pilih frekuensi cicilan" });
    }
    if (installmentAmount === 0) {
      ctx.addIssue({ code: "custom", path: ["installmentAmount"], message: "Nominal cicilan harus positif jika diisi" });
    }
    if (dueDate && installmentFreq !== "yearly") {
      ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Tanggal cicilan pertama hanya berlaku untuk cicilan tahunan" });
    }
    if (dueDay && installmentFreq === "yearly") {
      ctx.addIssue({ code: "custom", path: ["dueDay"], message: "Gunakan tanggal cicilan pertama untuk cicilan tahunan" });
    }
    return;
  }
  if (installmentFreq || installmentAmount != null || dueDay) {
    ctx.addIssue({ code: "custom", path: ["repaymentMode"], message: "Jadwal ini tidak menggunakan cicilan tetap" });
  }
  if (repaymentMode === "one_time" && !dueDate) {
    ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Isi tanggal jatuh tempo pelunasan" });
  }
  if (repaymentMode === "flexible" && dueDate) {
    ctx.addIssue({ code: "custom", path: ["dueDate"], message: "Kosongkan tanggal untuk jadwal tanpa jatuh tempo" });
  }
}

export const debtTermsSchema = debtTermsFields.superRefine(validateDebtTerms);
export type DebtTermsInput = z.output<typeof debtTermsSchema>;

export const debtSchema = debtTermsFields.partial({ repaymentMode: true, interestRate: true }).extend({
  name: z.string().trim().min(2, "Nama hutang minimal 2 karakter").max(80),
  creditor: z.string().trim().max(80).optional(),
  principalOriginal: z.coerce.number().positive("Pokok hutang harus positif").refine(isDebtMoney, moneyPrecision),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  startDate: isoDate.optional(),
  notes: z.string().trim().max(500).optional(),
}).superRefine(validateDebtTerms);
export type DebtCreateInput = z.output<typeof debtSchema>;

export const debtPaymentSchema = z.object({
  totalAmount: z.coerce.number().positive("Total pembayaran harus positif").refine(isDebtMoney, moneyPrecision),
  interestPortion: z.coerce.number().min(0).refine(isDebtMoney, moneyPrecision).default(0),
  feePortion: z.coerce.number().min(0).refine(isDebtMoney, moneyPrecision).default(0),
  paidAt: isoDate.optional(),
  note: z.string().trim().max(300).optional(),
});

export const allocationSchema = z.object({
  periodStart: isoDate,
  periodEnd: isoDate,
  amount: z.coerce.number().positive(),
  note: z.string().trim().max(300).optional(),
}).refine((value) => new Date(value.periodEnd) > new Date(value.periodStart), {
  message: "Akhir periode harus setelah awal periode", path: ["periodEnd"],
});

export const bucketPercentSchema = z.object({
  buckets: z
    .array(
      z.object({
        id: z.string(),
        targetPercent: z.coerce.number().min(0).max(100),
      }),
    )
    .min(1),
});
