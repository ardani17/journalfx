import { AI_JOURNAL_SMALL_SAMPLE, type AiJournalAnalysis, type AiJournalFinding } from "@/lib/ai-journal";
import { fmtNum, fmtUSD } from "@/lib/money";

function Findings({ title, findings }: { title: string; findings: AiJournalFinding[] }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {findings.length === 0 ? <p className="text-xs text-muted">Bukti yang tersedia belum cukup.</p> : (
        <ul className="space-y-2">
          {findings.map(({ text, evidence }, index) => (
            <li key={index} className="space-y-1 rounded-xl border border-line-soft p-3 text-xs">
              <p className="whitespace-pre-line">{text}</p>
              <ul className="space-y-1 text-muted">
                {evidence.map((proof) => <li key={proof}>{proof}</li>)}
              </ul>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function AnalysisReport({ analysis, previous }: { analysis: AiJournalAnalysis; previous: boolean }) {
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
  ];
  return (
    <section aria-label="Laporan analisis AI" className="space-y-4 rounded-xl border border-line-soft p-3 sm:p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{previous ? "Hasil terakhir" : "Laporan analisis AI"}</h3>
        <p className="text-xs text-muted">
          {scope.closedTrades} trade dianalisis · {period} · Dibuat <time dateTime={analyzedAt}>{dateTime.format(new Date(analyzedAt))}</time>
        </p>
        {scope.closedTrades < AI_JOURNAL_SMALL_SAMPLE ? <p className="text-xs text-muted">Sampel kecil.</p> : null}
      </div>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">Ringkasan Performa &amp; Metrik Kunci</h4>
        <p className="whitespace-pre-line text-xs">{analysis.summary}</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line-soft p-2 text-xs">
              <dt className="text-muted">{label}</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        <p className="text-xs text-muted">
          SL tercatat {coverage.withRecordedStop}/{scope.closedTrades} · TP tercatat {coverage.withRecordedTarget}/{scope.closedTrades}
          {" · "}{coverage.withJournal} trade memiliki jurnal
        </p>
        {metrics.avgR !== null ? (
          <p className="text-xs text-muted">Rata-rata R {number(metrics.avgR)}R dari {coverage.withActualR} trade.</p>
        ) : null}
        {coverage.withExitTime < scope.closedTrades ? (
          <p className="text-xs text-muted">Drawdown menggunakan {coverage.withExitTime} trade dengan waktu exit tercatat.</p>
        ) : null}
      </section>
      <Findings title="Apa yang Sudah Benar" findings={analysis.strengths} />
      <Findings title="Apa yang Salah" findings={analysis.mistakes} />
      <Findings title="Evaluasi & Rencana Perbaikan" findings={analysis.actionPlan} />
    </section>
  );
}
