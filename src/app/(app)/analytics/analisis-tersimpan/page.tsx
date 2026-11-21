import Link from "next/link";
import { Card } from "@/components/ui/card";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { AI_JOURNAL_HISTORY_PATH } from "@/lib/ai-journal";
import { fmtNum } from "@/lib/money";
import { requireUser } from "@/server/auth";
import { listSavedAiJournalAnalyses } from "@/server/services/ai-journal-history";

export const metadata = { title: "Riwayat analisis AI" };

export default async function AiJournalHistoryPage({ searchParams }: {
  searchParams: Promise<{ page?: string | string[] }>;
}) {
  const user = await requireUser();
  const { page: query } = await searchParams;
  const requested = typeof query === "string" && /^\d+$/.test(query) ? Number(query) : 1;
  const { reports, page, pageCount } = await listSavedAiJournalAnalyses(user.id,
    Number.isSafeInteger(requested) && requested > 0 ? requested : 1);
  const date = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeStyle: "short", timeZone: user.timezone });
  const pageHref = (number: number) => number === 1 ? AI_JOURNAL_HISTORY_PATH : AI_JOURNAL_HISTORY_PATH + "?page=" + number;

  return (
    <PageShell>
      <PageHeader title="Riwayat analisis AI" actions={
        <Link href="/analytics" className="text-sm text-primary hover:underline">Kembali ke Analytics</Link>
      } />
      {reports.length ? (
        <Card>
          <ul className="divide-y divide-line-soft">
            {reports.map((report) => (
              <li key={report.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                <div>
                  <p className="text-sm font-semibold">
                    <time dateTime={report.analyzedAt.toISOString()}>{date.format(report.analyzedAt)}</time>
                  </p>
                  <p className="text-xs text-muted">{fmtNum(report.tradeCount, 0)} trade dianalisis</p>
                </div>
                <Link href={AI_JOURNAL_HISTORY_PATH + "/" + report.id} className="text-sm text-primary hover:underline">
                  Buka laporan <span className="sr-only">{date.format(report.analyzedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      ) : <Card className="p-4 text-sm text-muted">Belum ada analisis tersimpan.</Card>}
      {pageCount > 1 ? (
        <nav aria-label="Halaman riwayat analisis" className="flex flex-wrap items-center gap-3 text-xs">
          {page > 1 ? <Link href={pageHref(page - 1)} className="text-primary hover:underline">Sebelumnya</Link> : null}
          <span className="text-muted">Halaman {page} dari {pageCount}</span>
          {page < pageCount ? <Link href={pageHref(page + 1)} className="text-primary hover:underline">Berikutnya</Link> : null}
        </nav>
      ) : null}
    </PageShell>
  );
}
