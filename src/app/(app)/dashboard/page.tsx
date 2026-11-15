import {
  Activity,
  Target,
  TrendingUp,
  Wallet,
  BarChart3,
  Percent,
  CalendarRange,
} from "lucide-react";
import { requireUser } from "@/server/auth";
import { getDefaultProject } from "@/server/services/projects";
import { balanceSeries, computeBalance, weeklySummary } from "@/server/services/ledger";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { BalanceChart } from "@/components/dashboard/balance-chart";
import { PlanCards } from "@/components/dashboard/plan-cards";
import { D, fmtNum, fmtPct, fmtPctDelta, fmtUSD, fmtUSDdelta } from "@/lib/money";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const user = await requireUser();
  const project = await getDefaultProject(user.id);
  const [balances, weekly, series] = await Promise.all([
    computeBalance(user.id),
    weeklySummary(user.id),
    balanceSeries(user.id),
  ]);

  const balance = balances.balance;
  const equity = balance; // + unrealized P&L — trades arrive in v0.2.0
  const target = D(project.targetAmount);
  const progressPct = target.isZero() ? D(0) : balance.div(target).times(100);
  const nextMilestone =
    project.milestones.find((m) => !m.achievedAt && D(m.amount).gt(balance)) ??
    project.milestones.find((m) => !m.achievedAt) ??
    null;
  const growthPct = balances.deposits.isZero()
    ? null
    : balance.minus(balances.deposits).plus(balances.withdrawals).div(balances.deposits).times(100);

  return (
    <PageShell>
      <PageHeader
        title="Dashboard"
        subtitle="Ringkasan proyek trading, performa, dan rencana menuju $1.000.000"
      />

      {/* Project banner */}
      <section
        aria-label="Project banner"
        className="banner-gradient flex flex-wrap items-center gap-3 rounded-[14px] px-5 py-4"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <Target className="h-5 w-5 text-white" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white">{project.name}</h2>
          <p className="text-xs text-white/80">
            Forex XAUUSD · Modal Awal {fmtUSD(project.initialCapital)} · Target{" "}
            {fmtUSD(project.targetAmount, { compact: true })}
          </p>
        </div>
        <Badge className="border-white/30 bg-white/15 !text-white" tone="success">
          {progressPct.gt(0) ? "● Berjalan" : "● Dimulai"}
        </Badge>
      </section>

      {/* KPI row */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Balance Saat Ini"
          value={fmtUSD(balance)}
          tone="primary"
          icon={Wallet}
          sub={
            growthPct !== null ? (
              <span className={growthPct.isPositive() ? "text-primary" : "text-loss"}>
                {fmtPctDelta(growthPct)} ({fmtUSDdelta(balance.minus(balances.deposits))})
              </span>
            ) : undefined
          }
        />
        <StatCard label="Equity" value={fmtUSD(equity)} tone="info" icon={Activity} />
        <StatCard
          label="Total WD (Aktual)"
          value={fmtUSD(balances.withdrawals)}
          tone="primary"
          icon={Wallet}
          sub="Realisasi dari ledger"
        />
        <StatCard
          label="Progress Target"
          value={fmtPct(progressPct)}
          tone="indigo"
          icon={Target}
          sub={`dari ${fmtUSD(target, { compact: true })}`}
        />
      </div>

      {/* Middle: chart + weekly summary */}
      <div className="grid gap-3 xl:grid-cols-[68fr_32fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pertumbuhan Balance (Aktual)</CardTitle>
          </CardHeader>
          <CardContent>
            {series.length > 1 ? (
              <BalanceChart data={series} />
            ) : series.length === 1 ? (
              <>
                <BalanceChart data={series} />
                <p className="mt-2 text-center text-[11px] text-faint">
                  Baru 1 titik data — kurva tumbuh seiring transaksi berikutnya.
                </p>
              </>
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-8 w-8" />}
                title="Belum ada data balance"
                description="Balance akan tumbuh seiring transaksi di ledger: deposit, WD, dan P&L realisasi dari jurnal trading."
              />
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CalendarRange className="h-4 w-4 text-primary" aria-hidden /> Ringkasan Mingguan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SummaryRow icon={<BarChart3 className="h-3.5 w-3.5" />} label="Total Trade" value={fmtNum(weekly.tradesCount, 0)} />
            <SummaryRow
              icon={<Percent className="h-3.5 w-3.5" />}
              label="Return Mingguan"
              value={weekly.returnPct ? fmtPctDelta(weekly.returnPct) : "—"}
              tone={weekly.returnPct ? (weekly.returnPct.isPositive() ? "pos" : "neg") : undefined}
            />
            <SummaryRow
              icon={<TrendingUp className="h-3.5 w-3.5" />}
              label="P&L Realisasi"
              value={fmtUSDdelta(weekly.realizedPnl)}
              tone={weekly.realizedPnl.isPositive() ? "pos" : weekly.realizedPnl.isNegative() ? "neg" : undefined}
            />
            <SummaryRow icon={<Wallet className="h-3.5 w-3.5" />} label="Deposit" value={fmtUSD(weekly.deposits)} />
            <SummaryRow icon={<Wallet className="h-3.5 w-3.5" />} label="Withdrawal" value={fmtUSD(weekly.withdrawals)} />
          </CardContent>
        </Card>
      </div>

      {/* Bottom plan cards */}
      <PlanCards
        data={{
          nextMilestone: nextMilestone
            ? { amount: D(nextMilestone.amount), label: nextMilestone.label ?? fmtNum(D(nextMilestone.amount), 0) }
            : null,
          wdRecommended: null, // withdrawal engine ships in v0.4.0
          monthlyNeedsIdr: null, // finance pages ship in v0.4.0
          debtRemainingIdr: null,
          debtPaidPct: null,
        }}
      />
    </PageShell>
  );
}

function SummaryRow({
  icon,
  label,
  value,
  tone,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <span className="text-faint">{icon}</span>
        <span className="text-xs">{label}</span>
      </span>
      <span
        className={`tnum font-semibold ${
          tone === "pos" ? "text-primary" : tone === "neg" ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
