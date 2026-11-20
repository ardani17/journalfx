import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listReviews } from "@/server/services/reviews";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { localDateKey, reviewHref, reviewKindLabel, reviewPeriodLabel } from "@/lib/review-period";
import { D, fmtNum, fmtUSD } from "@/lib/money";
import { PeriodPicker } from "./period-picker";

export const metadata = { title: "Laporan" };

export default async function ReportsPage() {
  const user = await requireUser();
  const reviews = await listReviews(user.id);

  return (
    <PageShell>
      <PageHeader
        title="Laporan"
        subtitle="Review periodik dengan snapshot yang tersimpan"
      />

      <PeriodPicker today={localDateKey(new Date(), user.timezone)} timezone={user.timezone} />

      <Card>
        <CardHeader><CardTitle>Riwayat Review (snapshot tertutup immutable)</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH>Periode</TH><TH>Jenis</TH><TH>Status</TH><TH className="text-right">WD Aktual</TH><TH className="text-right">Compounded</TH><TH className="text-right">Discipline</TH></TR>
            </THead>
            <TBody>
              {reviews.length === 0 ? (
                <EmptyRow colSpan={6}>Belum ada review periodik.</EmptyRow>
              ) : (
                reviews.map((r) => {
                  const ds = (r.disciplineScore ?? null) as { total?: number | null } | null;
                  return (
                    <TR key={r.id}>
                      <TD className="tnum text-xs">
                        <Link prefetch={false} href={reviewHref(r.kind, { reviewId: r.id })} className="font-medium text-primary hover:underline">
                          {reviewPeriodLabel({ start: r.periodStart, end: r.periodEnd }, user.timezone)}
                        </Link>
                      </TD>
                      <TD className="text-xs">{reviewKindLabel[r.kind]}{r.correctionOfId ? " (koreksi)" : ""}</TD>
                      <TD>
                        <Badge tone={r.status === "CLOSED" ? "success" : "warn"}>{r.status === "CLOSED" ? "Ditutup" : "Terbuka"}</Badge>
                      </TD>
                      <TD className="tnum text-right text-xs">{r.wdActual ? fmtUSD(D(r.wdActual)) : "—"}</TD>
                      <TD className="tnum text-right text-xs">{r.compoundedAmount ? fmtUSD(D(r.compoundedAmount)) : "—"}</TD>
                      <TD className="tnum text-right text-xs font-semibold">{ds?.total != null ? fmtNum(ds.total, 1) : "—"}</TD>
                    </TR>
                  );
                })
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
