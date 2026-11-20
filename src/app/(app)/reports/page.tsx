import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listReviewsWithPnl } from "@/server/services/reviews";
import { CalendarReviewTabs } from "@/components/layout/calendar-review-tabs";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { localDateKey, reviewHref, reviewKindLabel, reviewPeriodLabel } from "@/lib/review-period";
import { fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { reviewSelectorSchema } from "@/lib/validation/reviews";
import { PeriodPicker } from "./period-picker";

export const metadata = { title: "Laporan" };

export default async function ReportsPage({ searchParams }: { searchParams: Promise<{ calendar?: string }> }) {
  const user = await requireUser();
  const calendar = reviewSelectorSchema.shape.date.safeParse((await searchParams).calendar).data;
  const reviews = await listReviewsWithPnl(user.id);

  return (
    <PageShell>
      <PageHeader
        title="Review Periodik"
        subtitle="Pilih periode untuk meninjau performa dan membuka catatan tersimpan."
      />

      <CalendarReviewTabs active="reports" date={calendar} />
      <PeriodPicker key={calendar ?? "current"} today={localDateKey(new Date(), user.timezone)} timezone={user.timezone} calendar={calendar} />

      <Card>
        <CardHeader><CardTitle>Riwayat Review</CardTitle></CardHeader>
        <CardContent className="p-0">
          <TableWrap className="rounded-none border-0">
          <Table>
            <THead>
              <TR><TH>Periode</TH><TH>Jenis</TH><TH>Status</TH><TH className="text-right">P&L Neto</TH><TH className="text-right">Penarikan Aktual</TH><TH className="text-right">Laba Ditahan</TH><TH className="text-right">Disiplin</TH></TR>
            </THead>
            <TBody>
              {reviews.length === 0 ? (
                <EmptyRow colSpan={7}>Belum ada review periodik.</EmptyRow>
              ) : (
                reviews.map((r) => {
                  const ds = (r.disciplineScore ?? null) as { total?: number | null } | null;
                  return (
                    <TR key={r.id}>
                      <TD className="tnum text-xs">
                        <Link prefetch={false} href={reviewHref(r.kind, { reviewId: r.id, calendar })} className="font-medium text-primary hover:underline">
                          {reviewPeriodLabel(r.window, user.timezone)}
                        </Link>
                      </TD>
                      <TD className="text-xs">{reviewKindLabel[r.kind]}{r.correctionOfId ? " (koreksi)" : ""}</TD>
                      <TD>
                        <Badge tone={r.status === "CLOSED" ? "success" : "warn"}>{r.status === "CLOSED" ? "Selesai" : "Draf"}</Badge>
                      </TD>
                      <TD className="tnum whitespace-nowrap text-right text-xs">
                        <span className="font-semibold">{fmtUSDdelta(r.livePnl)}</span>
                        {r.snapshotPnl !== null ? <span className="block text-faint">Saat ditutup: {fmtUSDdelta(r.snapshotPnl)}</span> : null}
                      </TD>
                      <TD className="tnum text-right text-xs">{fmtUSD(r.wdActual)}</TD>
                      <TD className="tnum text-right text-xs">{fmtUSD(r.compoundedAmount)}</TD>
                      <TD className="tnum text-right text-xs font-semibold">{ds?.total != null ? fmtNum(ds.total, 1) : "—"}</TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
          </TableWrap>
        </CardContent>
      </Card>
    </PageShell>
  );
}
