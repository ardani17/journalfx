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
import { getRecommendation } from "@/server/services/withdrawals";
import { budgetOverview } from "@/server/services/finance";
import { prisma } from "@/server/db";
import { simulate } from "@/lib/finance/compounding";

import { refreshNotifications } from "@/server/services/reviews";
import { checkMilestones } from "@/server/services/ledger";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { EmptyState } from "@/components/ui/misc";
import { Badge } from "@/components/ui/badge";
import { BalanceChart } from "@/components/dashboard/balance-chart";
import { PlanCards } from "@/components/dashboard/plan-cards";
import { CurrencyConverter } from "@/components/finance/currency-converter";
import { formatFxEstimate } from "@/lib/finance/exchange";
import { D, fmtNum, fmtPct, fmtPctDelta, fmtUSD, fmtUSDdelta } from "@/lib/money";

export const metadata = { title: "Dasbor" };

export default async function DashboardPage() {
  const user = await requireUser();
  const project = await getDefaultProject(user.id);
  await checkMilestones(user.id);
  await refreshNotifications(user.id).catch(() => undefined);

  const [balances, weekly, series, wdBundle, budget, debts] = await Promise.all([
    computeBalance(user.id),
    weeklySummary(user.id),
    balanceSeries(user.id),
    getRecommendation(user.id),
    budgetOverview(user.id).catch(() => null),
    prisma.debt.findMany({ where: { userId: user.id, status: "ACTIVE" } }),
  ]);

  const balance = balances.balance;
  const fx = wdBundle.latestFx;
  const balanceIdr = formatFxEstimate(balance, "USD", fx);
  const pnlIdr = formatFxEstimate(weekly.realizedPnl, "USD", fx);
  const target = D(project.targetAmount);
  const progressPct = target.isZero() ? D(0) : balance.div(target).times(100);
  const nextMilestone =
    project.milestones.find((m) => !m.achievedAt && D(m.amount).gt(balance)) ??
    project.milestones.find((m) => !m.achievedAt) ??
    null;
  const growthPct = balances.deposits.isZero()
    ? null
    : balance.minus(balances.deposits).plus(balances.withdrawals).div(balances.deposits).times(100);

  // illustrative projection (5%/week, no WD) for the actual-vs-projected overlay
  const proj = simulate({
    initialCapital: D(project.initialCapital),
    target,
    returnPerCyclePct: 5,
    wdMode: "NONE",
    maxCycles: 260,
  });
  const projByWeek = new Map<number, number>();
  proj.cycles.forEach((c) => projByWeek.set(c.cycle, Number(c.closing.toFixed(2))));
  const actualWithProj = series.map((p, i) => ({
    date: p.date,
    balance: p.balance,
    projected: projByWeek.get(i + 1) ?? null,
  }));

  const debtRemaining = debts.reduce((s, d) => s.add(D(d.principalRemaining)), D(0));
  const debtOriginal = debts.reduce((s, d) => s.add(D(d.principalOriginal)), D(0));
  const debtPaidPct = debtOriginal.isZero() ? null : Number(debtOriginal.minus(debtRemaining).div(debtOriginal).times(100));
  const monthlyNeedsIdr = budget ? budget.planned : null;

  return (
    <PageShell>
      <PageHeader
        title="Dasbor"
        subtitle="Ringkasan proyek trading, performa, dan rencana menuju $1.000.000"
      />

      <section
        aria-label="Ringkasan proyek"
        className="banner-gradient flex flex-wrap items-center gap-3 rounded-[14px] px-5 py-4"
      >
        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/15">
          <Target className="h-5 w-5 text-white" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h2 className="text-base font-bold text-white">{project.name}</h2>
          <p className="text-xs text-white/80">
            Forex XAUUSD · Modal Awal {fmtUSD(project.initialCapital)} · Target{" "}
            {fmtUSD(target, { compact: true })}
          </p>
        </div>
        <Badge className="border-white/30 bg-white/15 !text-white" tone="success">
          {weekly.realizedPnl.gt(0) ? "● Minggu Profit" : "● Berjalan"}
        </Badge>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Saldo Saat Ini"
          value={fmtUSD(balance)}
          tone="primary"
          icon={Wallet}
          sub={
            <>
              {balanceIdr ? <span className="block">{balanceIdr}</span> : null}
              {growthPct !== null ? (
                <span className={growthPct.isPositive() ? "text-primary" : "text-loss"}>
                  {fmtPctDelta(growthPct)} ({fmtUSDdelta(balance.minus(balances.deposits))})
                </span>
              ) : null}
            </>
          }
        />
        <StatCard label="Equity" value={fmtUSD(balance)} tone="info" icon={Activity} sub="Unrealized: 0 (belum ada harga berjalan)" />
        <StatCard
          label="Total WD (Aktual)"
          value={fmtUSD(balances.withdrawals)}
          tone="primary"
          icon={Wallet}
          sub="Realisasi dari ledger"
        />
        <StatCard
          label="Progres Target"
          value={fmtPct(progressPct)}
          tone="indigo"
          icon={Target}
          sub={`dari ${fmtUSD(target, { compact: true })}`}
        />
      </div>

      <div className="grid gap-3 xl:grid-cols-[68fr_32fr]">
        <Card>
          <CardHeader>
            <CardTitle>Pertumbuhan Saldo · Aktual dan Proyeksi (contoh 5% per minggu)</CardTitle>
          </CardHeader>
          <CardContent>
            {actualWithProj.length > 1 ? (
              <BalanceChart data={actualWithProj} showProjection />
            ) : (
              <EmptyState
                icon={<TrendingUp className="h-8 w-8" />}
                title="Data saldo belum cukup"
                description="Grafik mengikuti setoran, penarikan, dan P&L terealisasi yang tercatat di buku besar."
              />
            )}
          </CardContent>
        </Card>

        <WeeklySummaryCard weekly={weekly} pnlIdr={pnlIdr} />
      </div>

      <CurrencyConverter quote={fx} />

      <PlanCards
        data={{
          nextMilestone: nextMilestone ? { amount: D(nextMilestone.amount) } : null,
          wdRecommended: wdBundle.recommendation.recommended,
          monthlyNeedsIdr,
          debtRemainingIdr: debtOriginal.isZero() ? null : debtRemaining,
          debtPaidPct,
        }}
      />
    </PageShell>
  );
}

function WeeklySummaryCard({ weekly, pnlIdr }: {
  weekly: Awaited<ReturnType<typeof weeklySummary>>;
  pnlIdr: ReturnType<typeof formatFxEstimate>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarRange className="h-4 w-4 text-primary" aria-hidden /> Ringkasan Mingguan
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <SummaryRow icon={<BarChart3 className="h-3.5 w-3.5" />} label="Total Transaksi" value={fmtNum(weekly.tradesCount, 0)} />
        <SummaryRow
          icon={<Percent className="h-3.5 w-3.5" />}
          label="Imbal Hasil Mingguan"
          value={weekly.returnPct ? fmtPctDelta(weekly.returnPct) : "—"}
          tone={weekly.returnPct ? (weekly.returnPct.gt(0) ? "pos" : "neg") : undefined}
        />
        <SummaryRow
          icon={<TrendingUp className="h-3.5 w-3.5" />}
          label="P&L Realisasi"
          value={
            <>
              {fmtUSDdelta(weekly.realizedPnl)}
              {pnlIdr ? <span className="block text-xs font-normal text-muted">{pnlIdr}</span> : null}
            </>
          }
          tone={weekly.realizedPnl.gt(0) ? "pos" : weekly.realizedPnl.lt(0) ? "neg" : undefined}
        />
        <SummaryRow icon={<Wallet className="h-3.5 w-3.5" />} label="Deposit" value={fmtUSD(weekly.deposits)} />
        <SummaryRow icon={<Wallet className="h-3.5 w-3.5" />} label="Penarikan Dana" value={fmtUSD(weekly.withdrawals)} />
      </CardContent>
    </Card>
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
  value: React.ReactNode;
  tone?: "pos" | "neg";
}) {
  return (
    <div className="flex items-center justify-between gap-2 text-sm">
      <span className="flex items-center gap-2 text-muted">
        <span className="text-faint">{icon}</span>
        <span className="text-xs">{label}</span>
      </span>
      <span
        className={`tnum text-right font-semibold ${
          tone === "pos" ? "text-primary" : tone === "neg" ? "text-loss" : "text-ink"
        }`}
      >
        {value}
      </span>
    </div>
  );
}
