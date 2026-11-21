import type { AiJournalAnalysis, AiJournalFinding } from "@/lib/ai-journal";
import { AI_JOURNAL_EMPTY_FINDINGS, AI_JOURNAL_OVERVIEW_TITLE, AI_JOURNAL_REPORT_TITLE, presentAiJournalReport } from "@/lib/ai-journal-report";

function Findings({ title, findings }: { title: string; findings: AiJournalFinding[] }) {
  return (
    <section className="space-y-2">
      <h4 className="text-sm font-semibold">{title}</h4>
      {findings.length === 0 ? <p className="text-xs text-muted">{AI_JOURNAL_EMPTY_FINDINGS}</p> : (
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
  const report = presentAiJournalReport(analysis);
  return (
    <section aria-label={AI_JOURNAL_REPORT_TITLE} className="space-y-4 rounded-xl border border-line-soft p-3 sm:p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold">{previous ? "Hasil terakhir" : AI_JOURNAL_REPORT_TITLE}</h3>
        <p className="text-xs text-muted">
          {report.scopeLabel} · Dibuat <time dateTime={analysis.analyzedAt}>{report.analyzedLabel}</time>
        </p>
        {report.sampleWarning ? <p className="text-xs text-muted">Sampel kecil.</p> : null}
      </div>
      <section className="space-y-2">
        <h4 className="text-sm font-semibold">{AI_JOURNAL_OVERVIEW_TITLE}</h4>
        <p className="whitespace-pre-line text-xs">{analysis.summary}</p>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {report.tiles.map(([label, value]) => (
            <div key={label} className="rounded-lg border border-line-soft p-2 text-xs">
              <dt className="text-muted">{label}</dt>
              <dd className="mt-1 font-semibold">{value}</dd>
            </div>
          ))}
        </dl>
        {report.notes.map((note) => <p key={note} className="text-xs text-muted">{note}</p>)}
      </section>
      {report.sections.map(({ title, findings }) => <Findings key={title} title={title} findings={findings} />)}
    </section>
  );
}
