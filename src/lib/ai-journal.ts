export const MIN_AI_JOURNAL_TRADES = 3;
export const AI_JOURNAL_SMALL_SAMPLE = 30;

export interface AiJournalScope {
  capturedAt: string;
  from: string | null;
  to: string | null;
  timezone: string;
  closedTrades: number;
  currency: "USD";
}

export interface AiJournalCoverage {
  withJournal: number;
  withRecordedStop: number;
  withRecordedTarget: number;
  withExitTime: number;
  withExitReason: number;
  withRisk: number;
  withActualR: number;
  withSession: number;
  withJournalDiscipline: number;
  breakdownGroupsOmitted: number;
  examplesOmitted: number;
}

export interface AiJournalMetrics {
  closedTrades: number;
  wins: number;
  losses: number;
  breakEven: number;
  winRate: number | null;
  profitFactor: number | null;
  netPnlUsd: string;
  avgWinUsd: string | null;
  avgLossUsd: string | null;
  realizedRiskReward: number | null;
  avgR: number | null;
  expectancyUsd: string | null;
  closedTradeDrawdownUsd: string | null;
}

export interface AiJournalFinding {
  text: string;
  evidence: string[];
}

export interface AiJournalAnalysis {
  scope: AiJournalScope;
  coverage: AiJournalCoverage;
  metrics: AiJournalMetrics;
  analyzedAt: string;
  summary: string;
  strengths: AiJournalFinding[];
  mistakes: AiJournalFinding[];
  actionPlan: AiJournalFinding[];
}
