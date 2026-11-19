import { z } from "zod";

export const createAccountSchema = z.object({
  name: z.string().trim().min(2, "Nama akun minimal 2 karakter").max(60),
  broker: z.string().trim().max(60).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  initialDeposit: z.coerce.number().min(0, "Deposit awal tidak boleh negatif").optional(),
});

export const updateAccountSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  broker: z.string().trim().max(60).optional().or(z.literal("")),
  accountNumber: z.string().trim().max(40).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
  isActive: z.boolean().optional(),
});

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());

export const createTransactionSchema = z
  .object({
    accountId: z.string().min(1),
    type: z.enum(["DEPOSIT", "WITHDRAWAL", "ADJUSTMENT"]),
    amount: z.coerce.number(),
    occurredAt: isoDate.optional(),
    note: z.string().trim().max(300).optional().or(z.literal("")),
  })
  .refine((v) => v.type === "ADJUSTMENT" ? v.amount !== 0 : v.amount > 0, {
    message: "Deposit dan withdrawal harus positif. Adjustment tidak boleh nol.",
    path: ["amount"],
  })
  .refine((v) => v.type !== "ADJUSTMENT" || Boolean(v.note), {
    message: "Adjustment wajib memiliki catatan",
    path: ["note"],
  });

export const reverseTransactionSchema = z.object({
  reason: z.string().trim().min(3, "Alasan pembatalan wajib diisi").max(300),
});

export const listTransactionsQuery = z.object({
  accountId: z.string().optional(),
  type: z.enum(["DEPOSIT", "WITHDRAWAL", "REALIZED_PNL", "ADJUSTMENT", "FEE", "REVERSAL"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(100),
  offset: z.coerce.number().int().min(0).default(0),
});

export type CreateAccountInput = z.infer<typeof createAccountSchema>;
export type CreateTransactionInput = z.infer<typeof createTransactionSchema>;
