import Link from "next/link";
import { requireUser } from "@/server/auth";
import { debtProjection, listDebts } from "@/server/services/finance";
import { D, Decimal } from "@/lib/money";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { calendarDate } from "@/lib/dates";
import { debtDateKey, debtSchedule, scheduledDebtDate } from "@/lib/finance/debt";

import { Progress } from "@/components/ui/misc";
import { DebtsClient } from "./debts-client";
import { fmtIDR } from "@/lib/money";
import { CreditCard } from "lucide-react";
import { getJisdorQuote } from "@/server/services/jisdor";
import { JisdorRateNote } from "@/components/finance/jisdor-rate-note";
import { formatFxEstimate } from "@/lib/finance/exchange";

export const metadata = { title: "Hutang" };

export default async function DebtsPage() {
  const user = await requireUser();
  const [debts, fx] = await Promise.all([listDebts(user.id), getJisdorQuote()]);

  const totalOriginal = debts.reduce((s, d) => s.add(D(d.principalOriginal)), new Decimal(0));
  const totalRemaining = debts.reduce((s, d) => s.add(D(d.principalRemaining)), new Decimal(0));
  const paidPct = totalOriginal.isZero() ? 0 : Number(totalOriginal.minus(totalRemaining).div(totalOriginal).times(100).toFixed(1));

  const today = calendarDate(new Date(), user.timezone).toISOString().slice(0, 10);
  const debtCards = debts.map((debt) => {
    const schedule = debtSchedule(debt);
    const dueDate = debtDateKey(debt.dueDate);
    const active = debt.status === "ACTIVE";
    return {
      id: debt.id,
      name: debt.name,
      creditor: debt.creditor,
      status: debt.status,
      principalOriginal: debt.principalOriginal.toString(),
      principalRemaining: debt.principalRemaining.toString(),
      interestRate: debt.interestRate?.toString() ?? null,
      installmentAmount: debt.installmentAmount?.toString() ?? null,
      schedule,
      dueDate,
      dueDay: debt.dueDay,
      nextDueDate: active ? scheduledDebtDate(schedule, dueDate, today) : dueDate,
      overdue: active && schedule === "one_time" && dueDate !== null && dueDate < today,
      projectionNote: active ? debtProjection({
        principalRemaining: D(debt.principalRemaining),
        installmentAmount: debt.installmentAmount === null ? null : D(debt.installmentAmount),
        installmentFreq: debt.installmentFreq,
        interestRate: debt.interestRate === null ? null : D(debt.interestRate),
        repaymentMode: debt.repaymentMode,
      })?.note ?? null : null,
      lastPayments: debt.payments.map((payment) => ({
        id: payment.id,
        paidAt: payment.paidAt.toISOString(),
        totalAmount: payment.totalAmount.toString(),
        principalPortion: payment.principalPortion.toString(),
        interestPortion: payment.interestPortion.toString(),
      })),
    };
  });

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
            {fx ? <p className="tnum mt-1 text-sm text-ink">{formatFxEstimate(totalRemaining, "IDR", fx)}</p> : null}
            <JisdorRateNote quote={fx} />
            <p className="mt-1 text-[11px] text-faint">Pembayaran mengurangi pokok saja — bunga & biaya dicatat terpisah</p>
          </CardContent>
        </Card>
      </div>

      <DebtsClient debts={debtCards} />
    </PageShell>
  );
}
