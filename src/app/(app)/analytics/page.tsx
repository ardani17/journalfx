import { requireUser } from "@/server/auth";
import { byStrategy, coreMetrics, dailyPnl } from "@/server/services/analytics";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { DailyPnlChart } from "./daily-pnl-chart";
import { fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { startOfUTCDay, addUTCDays } from "@/lib/dates";
import { Activity, Percent, Scale, Target, TrendingUp } from "lucide-react";

export const metadata = { title: "Laporan & Analisis" };

export default async function AnalyticsPage() {
  const user = await requireUser();
  const to = addUTCDays(startOfUTCDay(new Date()), 1);
  const from30 = addUTCDays(to, -30);
  const [core, strategies, days] = await Promise.all([
    coreMetrics(user.id),
    byStrategy(user.id),
    dailyPnl(user.id, from30, to),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Laporan & Analisis"
        subtitle="Evaluasi performa trading dan perkembangan project"
        actions={<Badge tone="neutral">30 hari terakhir</Badge>}
      />

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total P/L"
          value={fmtUSDdelta(core.netPnl)}
          tone={core.netPnl.isPositive() ? "primary" : "loss"}
          icon={TrendingUp}
        />
        <StatCard label="Win Rate" value={core.winRate !== null ? `${fmtNum(core.winRate, 1)}%` : "N/A"} icon={Percent} sub={`${core.wins}W / ${core.losses}L`} />
        <StatCard
          label="Profit Factor"
          value={core.profitFactor !== null ? fmtNum(core.profitFactor, 2) : "N/A"}
          icon={Scale}
          sub={core.avgWin && core.avgLoss ? `AvgW ${fmtUSD(core.avgWin)} / AvgL ${fmtUSD(core.avgLoss)}` : undefined}
        />
        <StatCard
          label="Expectancy / Trade"
          value={core.expectancy !== null ? fmtUSDdelta(core.expectancy) : "N/A"}
          icon={Target}
          sub={core.avgR !== null ? `Avg ${fmtNum(core.avgR, 2)}R` : undefined}
        />
      </div>
      {core.sampleWarning && core.totalTrades > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn" role="status">
          Peringatan sampel: {core.totalTrades} trade tertutup (&lt;30) — interpretasi metrik dengan hati-hati.
        </p>
      ) : null}

      <Card>
        <CardHeader><CardTitle>P/L Harian (30 hari)</CardTitle></CardHeader>
        <CardContent>
          {days.some((d) => d.trades > 0) ? (
            <DailyPnlChart data={days} />
          ) : (
            <p className="py-10 text-center text-xs text-faint">Belum ada trade tertutup — grafik P/L harian akan muncul di sini.</p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-3 lg:grid-cols-2">
        <TableWrap>
          <Table>
            <THead><TR><TH>Strategi</TH><TH className="text-right">Trade</TH><TH className="text-right">Win Rate</TH><TH className="text-right">Net P/L</TH></TR></THead>
            <TBody>
              {strategies.length === 0 ? (
                <EmptyRow colSpan={4}>Belum ada data strategi</EmptyRow>
              ) : (
                strategies.map((s) => (
                  <TR key={s.strategyId ?? "none"}>
                    <TD className="text-xs font-medium">{s.name}</TD>
                    <TD className="tnum text-right text-xs">{s.trades}</TD>
                    <TD className="tnum text-right text-xs">{s.winRate !== null ? `${fmtNum(s.winRate, 1)}%` : "—"}</TD>
                    <TD className={`tnum text-right text-xs font-semibold ${s.netPnl.isPositive() ? "text-primary" : "text-loss"}`}>
                      {fmtUSDdelta(s.netPnl)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>

        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><Activity className="h-4 w-4 text-primary" aria-hidden /> Statistik Lanjutan</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-4 text-xs">
            <StatRow label="Win Streak Maks" value={`${core.maxWinStreak}`} />
            <StatRow label="Loss Streak Maks" value={`${core.maxLossStreak}`} />
            <StatRow label="Trade Terbaik" value={fmtUSDdelta(core.bestTrade)} tone="pos" />
            <StatRow label="Trade Terburuk" value={fmtUSDdelta(core.worstTrade)} tone="neg" />
            <StatRow label="Durasi Rata-rata" value={core.avgHoldMinutes !== null ? `${core.avgHoldMinutes} mnt` : "N/A"} />
            <StatRow label="Gross Win" value={fmtUSD(core.grossWin)} />
            <StatRow label="Gross Loss" value={fmtUSD(core.grossLoss)} />
            <StatRow label="Break Even" value={`${core.breakEven}`} />
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}

function StatRow({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft py-1.5">
      <span className="text-faint">{label}</span>
      <span className={`tnum font-medium ${tone === "pos" ? "text-primary" : tone === "neg" ? "text-loss" : "text-ink"}`}>{value}</span>
    </div>
  );
}
