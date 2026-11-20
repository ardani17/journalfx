import { requireUser } from "@/server/auth";
import { listAllocations, listBucketsWithAllocated } from "@/server/services/finance";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { fmtDateID } from "@/lib/dates";
import { AllocationClient } from "./allocation-client";
import { PieChart } from "lucide-react";

export const metadata = { title: "Alokasi Laba" };

export default async function AllocationPage() {
  const user = await requireUser();
  const [buckets, allocations] = await Promise.all([
    listBucketsWithAllocated(user.id),
    listAllocations(user.id),
  ]);
  const totalAllocated = buckets.reduce((s, b) => s + Number(b.allocated), 0);

  return (
    <PageShell>
      <PageHeader
        title="Alokasi Laba"
        subtitle="Alokasikan dana penarikan yang sudah diterima ke pos keuangan sesuai prioritas."
        actions={
          totalAllocated > 0 ? (
            <Badge tone="success">Total teralokasi: ${totalAllocated.toLocaleString("id-ID", { maximumFractionDigits: 2 })}</Badge>
          ) : undefined
        }
      />

      <AllocationClient buckets={buckets} />

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {buckets.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div className="flex items-center gap-2.5">
                <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo/30">
                  <PieChart className="h-4.5 w-4.5 text-indigo-soft" aria-hidden />
                </span>
                <div>
                  <p className="text-sm font-semibold">{b.name}</p>
                  <p className="text-[11px] text-faint">Prioritas {b.priority}{b.targetPercent ? ` · target ${Number(b.targetPercent).toFixed(0)}%` : " · tanpa %"}</p>
                </div>
              </div>
              <p className="tnum text-sm font-bold text-primary">
                ${Number(b.allocated).toLocaleString("id-ID", { maximumFractionDigits: 2 })}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader><CardTitle>Riwayat Alokasi</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <THead>
              <TR><TH>Waktu</TH><TH>Bucket</TH><TH>Periode Sumber</TH><TH className="text-right">Jumlah (USD)</TH></TR>
            </THead>
            <TBody>
              {allocations.length === 0 ? (
                <EmptyRow colSpan={4}>Belum ada alokasi laba.</EmptyRow>
              ) : (
                allocations.map((a) => (
                  <TR key={a.id}>
                    <TD className="tnum text-xs">{fmtDateID(a.createdAt, "d MMM yyyy")}</TD>
                    <TD className="text-xs font-medium">{a.bucket.name}</TD>
                    <TD className="tnum text-xs text-muted">
                      {fmtDateID(a.sourcePeriodStart, "d MMM")} – {fmtDateID(a.sourcePeriodEnd, "d MMM yyyy")}
                    </TD>
                    <TD className="tnum text-right text-xs font-semibold text-primary">
                      ${Number(a.amount).toLocaleString("id-ID", { minimumFractionDigits: 2 })}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </CardContent>
      </Card>
    </PageShell>
  );
}
