import { z } from "zod";

export const scenarioSchema = z.object({
  name: z.string().trim().min(2, "Nama skenario minimal 2 karakter").max(80),
  initialCapital: z.coerce.number().positive(),
  targetAmount: z.coerce.number().positive(),
  returnPerCycle: z.coerce.number().min(-100).max(100), // percent, negative allowed for stress
  frequency: z.enum(["DAILY", "WEEKLY", "MONTHLY"]).default("WEEKLY"),
  wdMode: z.enum(["NONE", "FIXED", "DYNAMIC"]).default("DYNAMIC"),
  fixedWdAmount: z.coerce.number().min(0).optional(),
  wdRatio: z.coerce.number().min(0).max(100).optional(),
  costPerCycle: z.coerce.number().min(0).default(0),
  deposits: z.record(z.string(), z.coerce.number()).optional(),
  stressReturns: z.record(z.string(), z.coerce.number()).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const runSimulationSchema = scenarioSchema.omit({ name: true }).extend({
  name: z.string().optional(),
});

export const riskSettingsSchema = z.object({
  riskPerTrade: z.coerce.number().min(0.01).max(100).optional(),
  dailyLossLimit: z.coerce.number().min(0.01).max(100).optional(),
  weeklyLossLimit: z.coerce.number().min(0.01).max(100).optional(),
  ddReview: z.coerce.number().min(0.01).max(100).optional(),
  maxOpenRisk: z.coerce.number().min(0.01).max(100).optional(),
  equityMode: z.enum(["balance", "equity"]).optional(),
});

export const positionSizeSchema = z.object({
  balance: z.coerce.number().positive(),
  riskPct: z.coerce.number().min(0.01).max(100),
  entry: z.coerce.number().positive(),
  stopLoss: z.coerce.number().positive(),
  symbol: z.string().trim().min(1).max(20),
  costPerLot: z.coerce.number().min(0).optional(),
});
