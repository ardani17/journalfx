import { z } from "zod";
import type { AiJournalAnalysis } from "@/lib/ai-journal";
import { isValidTimezone } from "@/lib/dates";

const count = z.int().nonnegative();
const money = z.string().max(100).regex(/^-?\d+(\.\d+)?(e[+-]?\d+)?$/i);
export function isPersistableReportText(value: string) {
  return value.isWellFormed() && !value.includes("\0");
}

const finding = z.strictObject({
  text: z.string().min(1).max(800).refine(isPersistableReportText),
  evidence: z.array(z.string().min(1).max(2400)).min(1).max(4),
});

export const aiJournalSnapshotV1 = z.strictObject({
  scope: z.strictObject({
    capturedAt: z.iso.datetime(),
    from: z.iso.date().nullable(),
    to: z.iso.date().nullable(),
    timezone: z.string().max(100).refine(isValidTimezone),
    closedTrades: count,
    currency: z.literal("USD"),
  }),
  coverage: z.strictObject({
    withJournal: count,
    withRecordedStop: count,
    withRecordedTarget: count,
    withExitTime: count,
    withExitReason: count,
    withRisk: count,
    withActualR: count,
    withSession: count,
    withJournalDiscipline: count,
    breakdownGroupsOmitted: count,
    examplesOmitted: count,
  }),
  metrics: z.strictObject({
    closedTrades: count,
    wins: count,
    losses: count,
    breakEven: count,
    winRate: z.number().nullable(),
    profitFactor: z.number().nullable(),
    netPnlUsd: money,
    avgWinUsd: money.nullable(),
    avgLossUsd: money.nullable(),
    realizedRiskReward: z.number().nullable(),
    avgR: z.number().nullable(),
    expectancyUsd: money.nullable(),
    closedTradeDrawdownUsd: money.nullable(),
  }),
  analyzedAt: z.iso.datetime(),
  summary: z.string().min(1).max(1500).refine(isPersistableReportText),
  strengths: z.array(finding).max(3),
  mistakes: z.array(finding).max(3),
  actionPlan: z.array(finding).max(3),
}) satisfies z.ZodType<AiJournalAnalysis>;

export const saveAiJournalInput = z.strictObject({
  reportId: z.uuid(),
  receipt: z.string().min(1).max(2048),
  analysis: aiJournalSnapshotV1,
});

export const aiJournalPdfInput = z.discriminatedUnion("source", [
  saveAiJournalInput.extend({ source: z.literal("current") }),
  z.strictObject({ source: z.literal("saved"), reportId: z.uuid() }),
]);

export type SaveAiJournalInput = z.infer<typeof saveAiJournalInput>;
export type AiJournalPdfInput = z.infer<typeof aiJournalPdfInput>;
