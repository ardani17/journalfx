import { z } from "zod";
import { reviewKinds } from "@/lib/review-period";

export const reviewSelectorSchema = z.object({
  kind: z.enum(reviewKinds),
  date: z.iso.date("Tanggal review tidak valid.").refine((date) => !date.startsWith("0000"), "Tanggal review tidak valid.").optional(),
  reviewId: z.string().min(1).max(100).optional(),
});

export const reviewFieldsSchema = reviewSelectorSchema.extend({
  performance: z.string().trim().max(4000).optional(),
  riskNotes: z.string().trim().max(4000).optional(),
  reflections: z.string().trim().max(4000).optional(),
  nextPlan: z.string().trim().max(4000).optional(),
});

export const reviewActionSchema = reviewSelectorSchema.extend({
  action: z.enum(["close", "correct"]),
});
