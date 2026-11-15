import { z } from "zod";

export const reviewFieldsSchema = z.object({
  kind: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  performance: z.string().trim().max(4000).optional(),
  riskNotes: z.string().trim().max(4000).optional(),
  reflections: z.string().trim().max(4000).optional(),
  nextPlan: z.string().trim().max(4000).optional(),
});

export const reviewActionSchema = z.object({
  kind: z.enum(["DAILY", "WEEKLY", "MONTHLY"]),
  action: z.enum(["close", "correct"]),
});
