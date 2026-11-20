import type { ImportReport } from "@/server/services/imports";

export function Mt5ImportResult({ report }: { report: ImportReport }) {
  return (
    <div className="space-y-2 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary">
      <div role="status" className="space-y-1">
        <p>{report.imported} posisi baru, {report.reconciled} posisi terbuka ditutup, {report.duplicates} duplikat posisi dilewati.</p>
        <p>{report.depositsImported} setoran, {report.withdrawalsImported} penarikan, {report.cashflowDuplicates} duplikat arus kas dilewati.</p>
        <p>{report.feesImported} biaya dicatat di buku besar, {report.feeDuplicates} duplikat biaya dilewati.</p>
        <p>{report.skipped} baris bermasalah.</p>
      </div>
      {report.registeredSymbols.length > 0 && <p>Simbol baru · {report.registeredSymbols.join(", ")}</p>}
      {report.errors.length > 0 && (
        <details>
          <summary className="cursor-pointer">Lihat baris bermasalah</summary>
          <ul className="mt-1 max-h-40 space-y-1 overflow-auto text-muted">
            {report.errors.map((error) => <li key={error}>{error}</li>)}
          </ul>
        </details>
      )}
    </div>
  );
}
