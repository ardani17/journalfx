import type { Prisma } from "@prisma/client";

export const journalCompletionSelect = {
  marketContext: true,
  entryReason: true,
  exitReason: true,
  lessons: true,
  improvement: true,
  tags: true,
  emotionBefore: true,
  emotionDuring: true,
  emotionAfter: true,
  confidence: true,
  stressLevel: true,
  fomo: true,
  revenge: true,
  overtrading: true,
  compliant: true,
  mistakes: true,
} satisfies Prisma.TradeJournalSelect;

type Journal = Prisma.TradeJournalGetPayload<{ select: typeof journalCompletionSelect }>;

export function isTradeJournalComplete(journal: Journal | null, hasCheckedItem: boolean): boolean {
  if (!journal) return false;

  const hasText = (value: string | null) => Boolean(value?.trim());
  const hasReflection = [
    journal.marketContext, journal.entryReason, journal.exitReason,
    journal.lessons, journal.improvement, ...journal.tags,
  ].some(hasText);

  const hasPsychology = [
    journal.emotionBefore, journal.emotionDuring, journal.emotionAfter, ...journal.mistakes,
  ].some(hasText) || journal.confidence !== null || journal.stressLevel !== null ||
    journal.fomo || journal.revenge || journal.overtrading || journal.compliant !== null || hasCheckedItem;

  return hasReflection && hasPsychology;
}
