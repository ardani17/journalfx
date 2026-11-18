import { z } from "zod";
import { D } from "@/lib/money";

const isoDate = z.string().datetime({ offset: true }).or(z.string().date());
const lotSize = z.coerce.number().positive().refine((value) => value < 1e16 && D(value).decimalPlaces() <= 8,
  "Lot harus memiliki paling banyak delapan desimal");

export const createTradeSchema = z.object({
  accountId: z.string().min(1),
  instrumentId: z.string().min(1).optional(),
  symbol: z.string().trim().min(1).max(64).optional(), // either instrumentId or symbol
  direction: z.enum(["LONG", "SHORT"]),
  lot: lotSize,
  entryPrice: z.coerce.number().positive("Entry price harus positif"),
  entryAt: isoDate,
  initialStopLoss: z.coerce.number().positive().optional(),
  initialTakeProfit: z.coerce.number().positive().optional(),
  strategyId: z.string().optional().or(z.literal("")),
  session: z.enum(["asian", "london", "newyork", ""]).optional(),
  timeframe: z.string().trim().max(10).optional(),
  ticket: z.string().trim().max(40).optional(),
  marketContext: z.string().trim().max(2000).optional(),
  entryReason: z.string().trim().max(2000).optional(),
  commission: z.coerce.number().min(0).default(0),
  swap: z.coerce.number().default(0), // negative cost represents a swap credit
  fees: z.coerce.number().min(0).default(0),
  preChecklist: z.record(z.string(), z.boolean()).optional(),
});

export const addExecutionSchema = z.object({
  kind: z.enum(["ENTRY", "PARTIAL_ENTRY", "CLOSE", "PARTIAL_CLOSE"]),
  quantity: lotSize,
  price: z.coerce.number().positive("Price harus positif"),
  commission: z.coerce.number().min(0).default(0),
  swap: z.coerce.number().default(0),
  fees: z.coerce.number().min(0).default(0),
  executedAt: isoDate.optional(),
  externalId: z.string().trim().max(120).optional(),
  reportedNetPnl: z.string().trim().regex(/^-?\d{1,16}(?:\.\d{1,2})?$/, "Masukkan P&L bersih dalam USD dengan maksimal dua desimal").optional(),
});

export const cancelTradeSchema = z.object({
  reason: z.string().trim().min(3, "Alasan wajib diisi").max(300),
});

export const updateJournalSchema = z.object({
  marketContext: z.string().trim().max(2000).optional(),
  entryReason: z.string().trim().max(2000).optional(),
  exitReason: z.string().trim().max(2000).optional(),
  emotionBefore: z.string().trim().max(40).optional(),
  emotionDuring: z.string().trim().max(40).optional(),
  emotionAfter: z.string().trim().max(40).optional(),
  confidence: z.coerce.number().int().min(1).max(5).optional(),
  stressLevel: z.coerce.number().int().min(1).max(5).optional(),
  fomo: z.boolean().optional(),
  revenge: z.boolean().optional(),
  overtrading: z.boolean().optional(),
  compliant: z.boolean().optional(),
  mistakes: z.array(z.string().trim().max(40)).max(20).optional(),
  lessons: z.string().trim().max(2000).optional(),
  improvement: z.string().trim().max(2000).optional(),
  tags: z.array(z.string().trim().max(30)).max(20).optional(),
  postChecklist: z.record(z.string(), z.boolean()).optional(),
});

export const listTradesQuery = z.object({
  accountId: z.string().optional(),
  status: z.enum(["PLANNED", "OPEN", "PARTIAL", "CLOSED", "CANCELLED"]).optional(),
  strategyId: z.string().optional(),
  result: z.enum(["win", "loss", "be"]).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  q: z.string().trim().max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

export const strategySchema = z.object({
  name: z.string().trim().min(2, "Nama strategi minimal 2 karakter").max(60),
  description: z.string().trim().max(1000).optional(),
  timeframe: z.string().trim().max(10).optional(),
  rules: z.string().trim().max(3000).optional(),
});

export const strategyUpdateSchema = strategySchema.partial().extend({
  isActive: z.boolean().optional(),
});

export type CreateTradeInput = z.infer<typeof createTradeSchema>;
export type AddExecutionInput = z.infer<typeof addExecutionSchema>;
export type UpdateJournalInput = z.infer<typeof updateJournalSchema>;
