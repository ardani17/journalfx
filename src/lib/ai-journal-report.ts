import { AI_JOURNAL_SMALL_SAMPLE, type AiJournalAnalysis } from "@/lib/ai-journal";
import { fmtNum, fmtUSD } from "@/lib/money";

export const AI_JOURNAL_REPORT_TITLE = "Laporan analisis AI";
export const AI_JOURNAL_OVERVIEW_TITLE = "Ringkasan Performa & Metrik Kunci";
export const AI_JOURNAL_EMPTY_FINDINGS = "Bukti yang tersedia belum cukup.";

export function presentAiJournalReport(analysis: AiJournalAnalysis) {
  const { metrics, coverage, scope, analyzedAt } = analysis;
  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });
  const dateTime = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: scope.timezone });
  const period = scope.from && scope.to ? date.formatRange(new Date(scope.from), new Date(scope.to)) : "Periode tidak tersedia";
  const number = (value: number | null) => value === null ? "N/A" : fmtNum(value, 2);
  const money = (value: string | null) => value === null ? "N/A" : fmtUSD(value);
  const tiles = [
    ["Total trade", fmtNum(metrics.closedTrades, 0)],
    ["Tingkat kemenangan", metrics.winRate === null ? "N/A" : number(metrics.winRate) + "%"],
    ["Faktor laba", number(metrics.profitFactor)],
    ["P&L Neto", money(metrics.netPnlUsd)],
    ["Rata-rata untung", money(metrics.avgWinUsd)],
    ["Rata-rata rugi", money(metrics.avgLossUsd)],
    ["Rasio untung/rugi terealisasi", number(metrics.realizedRiskReward)],
    ["Drawdown P&L trade tertutup", money(metrics.closedTradeDrawdownUsd)],
  ] as const;

  const notes = [
    "SL tercatat " + coverage.withRecordedStop + "/" + scope.closedTrades +
    " · TP tercatat " + coverage.withRecordedTarget + "/" + scope.closedTrades +
    " · " + coverage.withJournal + " trade memiliki jurnal",
  ];
  if (metrics.avgR !== null) notes.push("Rata-rata R " + number(metrics.avgR) + "R dari " + coverage.withActualR + " trade.");
  if (coverage.withExitTime < scope.closedTrades) {
    notes.push("Drawdown menggunakan " + coverage.withExitTime + " trade dengan waktu exit tercatat.");
  }
  return {
    scopeLabel: scope.closedTrades + " trade dianalisis · " + period,
    analyzedLabel: dateTime.format(new Date(analyzedAt)),
    sampleWarning: scope.closedTrades < AI_JOURNAL_SMALL_SAMPLE,
    tiles,
    notes,
    sections: [
      { title: "Apa yang Sudah Benar", findings: analysis.strengths },
      { title: "Apa yang Salah", findings: analysis.mistakes },
      { title: "Evaluasi & Rencana Perbaikan", findings: analysis.actionPlan },
    ],
  };
}
