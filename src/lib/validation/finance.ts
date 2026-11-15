import { z } from "zod";

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

export const debtSchema = z.object({
  name: z.string().trim().min(2, "Nama hutang minimal 2 karakter").max(80),
  creditor: z.string().trim().max(80).optional(),
  principalOriginal: z.coerce.number().positive("Pokok hutang harus positif"),
  interestRate: z.coerce.number().min(0).max(1000).optional(),
  installmentAmount: z.coerce.number().min(0).optional(),
  installmentFreq: z.enum(["monthly", "weekly"]).optional(),
  dueDay: z.coerce.number().int().min(1).max(31).optional(),
  startDate: isoDate.optional(),
  notes: z.string().trim().max(500).optional(),
});

export const debtPaymentSchema = z.object({
  totalAmount: z.coerce.number().positive("Total pembayaran harus positif"),
  interestPortion: z.coerce.number().min(0).default(0),
  feePortion: z.coerce.number().min(0).default(0),
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
