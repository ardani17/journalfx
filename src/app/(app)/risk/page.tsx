import Link from "next/link";
import { requireUser } from "@/server/auth";
import { riskStatus } from "@/server/services/risk";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { StatCard } from "@/components/ui/stat-card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/misc";

import { RiskSettingsForm } from "./risk-settings-form";
import { fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { AlertTriangle, Calculator, ShieldAlert, TrendingDown } from "lucide-react";

export const metadata = { title: "Manajemen Risiko" };

export default async function RiskPage() {
  const user = await requireUser();
  const st = await riskStatus(user.id);

  return (
    <PageShell>
      <PageHeader
        title="Manajemen Risiko"
        subtitle="Batas risiko ilustratif — peringatan, bukan pemblokir. Disiplin tetap milik Anda."
        actions={
          <Link href="/risk/calculator">
            <Button variant="secondary"><Calculator className="h-4 w-4" aria-hidden /> Kalkulator Lot</Button>
          </Link>
        }
      />

      {st.breaches.length > 0 ? (
        <div className="rounded-xl border border-loss/40 bg-loss/10 p-3" role="alert">
          {st.breaches.map((b) => (
            <p key={b} className="flex items-center gap-2 text-xs font-medium text-loss">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden /> {b}
            </p>
          ))}
        </div>
      ) : null}

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Saldo" value={fmtUSD(st.balance)} icon={ShieldAlert} tone="info" />
        <StatCard
          label="Rugi Hari Ini"
          value={fmtUSDdelta(st.dayPnl)}
          icon={TrendingDown}
          tone={st.dayPnl.isNegative() ? "loss" : "primary"}
          sub={st.dayLimitUsedPct !== null ? `Pemakaian batas: ${Math.max(0, st.dayLimitUsedPct).toFixed(0)}%` : undefined}
        />
        <StatCard
          label="Rugi Minggu Ini"
          value={fmtUSDdelta(st.weekPnl)}
          icon={TrendingDown}
          tone={st.weekPnl.isNegative() ? "loss" : "primary"}
          sub={st.weekLimitUsedPct !== null ? `Pemakaian batas: ${Math.max(0, st.weekLimitUsedPct).toFixed(0)}%` : undefined}
        />
        <StatCard
          label="Risiko Terbuka"
          value={fmtUSD(st.openRisk)}
          icon={ShieldAlert}
          tone={st.openRiskUsedPct !== null && st.openRiskUsedPct >= 100 ? "loss" : "warn"}
          sub={`${st.openTrades} posisi terbuka`}
        />
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Pemakaian Batas</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <LimitBar label={`Loss Harian (batas ${fmtNum(Number(st.settings.dailyLossLimit), 1)}%)`} used={st.dayLimitUsedPct} />
            <LimitBar label={`Loss Mingguan (batas ${fmtNum(Number(st.settings.weeklyLossLimit), 1)}%)`} used={st.weekLimitUsedPct} />
            <LimitBar label={`Risiko Terbuka (batas ${fmtNum(Number(st.settings.maxOpenRisk), 1)}%)`} used={st.openRiskUsedPct} />
            <LimitBar label={`Drawdown Review (ambang ${fmtNum(Number(st.settings.ddReview), 0)}%)`} used={Number(st.currentDdPct.div(Number(st.settings.ddReview)).times(100))} />
            <div className="grid grid-cols-2 gap-2 border-t border-line-soft pt-3 text-xs">
              <div>
                <p className="text-faint">Penurunan Saldo Aktual (disesuaikan dengan arus kas)</p>
                <p className="tnum font-bold text-ink">{fmtNum(Number(st.currentDdPct), 2)}%</p>
              </div>
              <div>
                <p className="text-faint">Penurunan Saldo Maksimum</p>
                <p className="tnum font-bold text-ink">{fmtNum(Number(st.maxDdPct), 2)}%</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <RiskSettingsForm
          initial={{
            riskPerTrade: Number(st.settings.riskPerTrade),
            dailyLossLimit: Number(st.settings.dailyLossLimit),
            weeklyLossLimit: Number(st.settings.weeklyLossLimit),
            ddReview: Number(st.settings.ddReview),
            maxOpenRisk: Number(st.settings.maxOpenRisk),
            equityMode: st.settings.equityMode as "balance" | "equity",
          }}
        />
      </div>

      <p className="text-[11px] leading-relaxed text-faint">
        Drawdown dihitung dengan penyesuaian arus kas: deposit tidak menutupi drawdown dan WD tidak
        mengecilkan drawdown artifisial. Batas bersifat konfigurasi pribadi dan ilustratif — tidak
        ada eksekusi otomatis yang diblokir oleh aplikasi.
      </p>
    </PageShell>
  );
}

function LimitBar({ label, used }: { label: string; used: number | null }) {
  const v = used === null ? 0 : Math.max(0, Math.min(120, used));
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted">{label}</span>
        <span className={`tnum font-semibold ${v >= 100 ? "text-loss" : v >= 60 ? "text-warn" : "text-ink"}`}>
          {used === null ? "N/A" : `${v.toFixed(0)}%`}
        </span>
      </div>
      <Progress value={(v / 100) * 100} tone={v >= 100 ? "loss" : v >= 60 ? undefined : "primary"} label={label} />
    </div>
  );
}
