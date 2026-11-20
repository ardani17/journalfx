import Link from "next/link";
import { requireUser } from "@/server/auth";
import { budgetOverview } from "@/server/services/finance";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { BudgetClient } from "./budget-client";
import { TradingCapitalEstimate } from "./trading-capital-estimate";
import { fmtIDR, fmtNum } from "@/lib/money";
import { PiggyBank } from "lucide-react";
import { getJisdorQuote } from "@/server/services/jisdor";
import { JisdorRateNote } from "@/components/finance/jisdor-rate-note";
import { formatFxEstimate } from "@/lib/finance/exchange";
import { monthlyToWeekly } from "@/lib/finance/withdrawal";

export const metadata = { title: "Kebutuhan Bulanan" };

export default async function ExpensesPage() {
  const user = await requireUser();
  const [overview, fx] = await Promise.all([budgetOverview(user.id), getJisdorQuote()]);
  const { budget } = overview;

  return (
    <PageShell>
      <PageHeader
        title="Keuangan Pribadi"
        subtitle="Kelola kebutuhan bulanan, hutang, dan arus kas dari hasil trading"
        actions={
          <nav aria-label="Tab keuangan" className="inline-flex gap-1 rounded-xl border border-line bg-panel-2 p-1">
            <span className="rounded-lg bg-indigo-soft px-3.5 py-1.5 text-xs font-semibold text-white">Kebutuhan Bulanan</span>
            <Link href="/debts" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Hutang</Link>
            <Link href="/finance/cashflow" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Arus Kas</Link>
          </nav>
        }
      />

      <div className="grid gap-3 lg:grid-cols-2">
        <Card className="border-indigo-soft/30 bg-indigo/10">
          <CardContent className="flex items-center gap-4 p-4">
            <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-indigo-soft/20">
              <PiggyBank className="h-5 w-5 text-indigo-soft" aria-hidden />
            </span>
            <div className="min-w-0">
              <p className="text-xs text-muted">Kebutuhan Bulanan (terencana)</p>
              <p className="tnum text-2xl font-bold">{fmtIDR(overview.planned)}</p>
              <p className="tnum text-[11px] text-indigo-soft">≈ {fmtIDR(monthlyToWeekly(overview.planned))} / minggu</p>
              {fx ? <p className="tnum mt-1 text-sm text-ink">{formatFxEstimate(overview.planned, "IDR", fx)} / bulan</p> : null}
              <JisdorRateNote quote={fx} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Periode: {budget.periodStart.toLocaleDateString("id-ID", { month: "long", year: "numeric", timeZone: user.timezone })}</span>
              <Badge tone={overview.coveragePct >= 100 ? "success" : overview.coveragePct > 0 ? "warn" : "neutral"}>
                {fmtNum(overview.coveragePct, 1)}% terdanai
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <Progress value={Math.min(overview.coveragePct, 100)} label="Terndanai" />
            <p className="tnum text-[11px] text-faint">
              Terdanai {fmtIDR(overview.funded)} · Terpakai {fmtIDR(overview.totalSpent)} · Target {fmtIDR(overview.planned)}
            </p>
          </CardContent>
        </Card>
      </div>

      <TradingCapitalEstimate planned={overview.planned.toString()} quote={fx} />
      <BudgetClient
        categories={overview.categories.map((c) => ({
          id: c.id,
          name: c.name,
          plannedAmount: c.plannedAmount.toString(),
          spent: c.spent.toString(),
          isActive: c.isActive,
        }))}
      />
    </PageShell>
  );
}
