export const MIN_AI_JOURNAL_TRADES = 3;
export const AI_JOURNAL_SMALL_SAMPLE = 30;

export interface AiJournalAnalysis {
  coverage: { closedTrades: number; disciplineTrades: number };
  findings: Array<{ id: string; finding: string; evidence: string[]; reviewAction: string }>;
}
