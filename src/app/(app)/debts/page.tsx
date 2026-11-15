import Link from "next/link";
import { requireUser } from "@/server/auth";
import { debtProjection, listDebts } from "@/server/services/finance";
import { D, Decimal } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";

import { Progress } from "@/components/ui/misc";
import { DebtsClient } from "./debts-client";
import { fmtIDR } from "@/lib/money";
import { CreditCard } from "lucide-react";

export const metadata = { title: "Hutang" };

export default async function DebtsPage() {
  const user = await requireUser();
  const debts = await listDebts(user.id);

  const totalOriginal = debts.reduce((s, d) => s.add(D(d.principalOriginal)), new Decimal(0));
  const totalRemaining = debts.reduce((s, d) => s.add(D(d.principalRemaining)), new Decimal(0));
  const paidPct = totalOriginal.isZero() ? 0 : Number(totalOriginal.minus(totalRemaining).div(totalOriginal).times(100).toFixed(1));

  const projections = debts.map((d) =>
    debtProjection({
      principalRemaining: D(d.principalRemaining),
      installmentAmount: d.installmentAmount ? D(d.installmentAmount) : null,
      installmentFreq: d.installmentFreq,
      interestRate: d.interestRate ? D(d.interestRate) : null,
    }),
  );

  return (
    <PageShell>
      <PageHeader
        title="Keuangan Pribadi"
        subtitle="Kelola kebutuhan bulanan, hutang, dan arus kas dari hasil trading"
        actions={
          <nav aria-label="Tab keuangan" className="inline-flex gap-1 rounded-xl border border-line bg-panel-2 p-1">
            <Link href="/expenses" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Kebutuhan Bulanan</Link>
            <span className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-[#06281a]">Hutang</span>
            <Link href="/finance/cashflow" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Arus Kas</Link>
          </nav>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <Card className="border-loss/30 plan-rose">
          <CardContent className="flex items-center gap-3 p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-loss/15">
              <CreditCard className="h-5 w-5 text-loss" aria-hidden />
            </span>
            <div>
              <p className="text-xs text-muted">Total Hutang (Pokok)</p>
              <p className="tnum text-2xl font-bold">{fmtIDR(totalOriginal)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted">Terbayar</p>
            <p className="tnum text-2xl font-bold text-primary">
              {fmtIDR(totalOriginal.minus(totalRemaining))} ({paidPct.toFixed(1)}%)
            </p>
            <Progress value={paidPct} className="mt-2 h-1.5" label="Pelunasan" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs text-muted">Sisa Hutang</p>
            <p className="tnum text-2xl font-bold text-loss">{fmtIDR(totalRemaining)}</p>
            <p className="mt-1 text-[11px] text-faint">Pembayaran mengurangi pokok saja — bunga & biaya dicatat terpisah</p>
          </CardContent>
        </Card>
      </div>

      <DebtsClient
        debts={debts.map((d, i) => ({
          id: d.id,
          name: d.name,
          creditor: d.creditor,
          status: d.status,
          principalOriginal: d.principalOriginal.toString(),
          principalRemaining: d.principalRemaining.toString(),
          interestRate: d.interestRate?.toString() ?? null,
          installmentAmount: d.installmentAmount?.toString() ?? null,
          installmentFreq: d.installmentFreq,
          projectionNote: projections[i]?.note ?? "",
          projectionPeriods: projections[i]?.periods ?? null,
          lastPayments: d.payments.map((p) => ({
            id: p.id,
            paidAt: p.paidAt.toISOString(),
            totalAmount: p.totalAmount.toString(),
            principalPortion: p.principalPortion.toString(),
            interestPortion: p.interestPortion.toString(),
          })),
        }))}
      />
    </PageShell>
  );
}
