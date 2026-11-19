"use client";

import { useState } from "react";
import dynamic from "next/dynamic";
import { Dices } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import { fmtNum, fmtUSD } from "@/lib/money";

interface McResult {
  p10: number[];
  p50: number[];
  p90: number[];
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  riskOfRuinPct: number;
  medianMaxDdPct: number;
  sampleTrades: number;
  caveat: string | null;
}

const MonteCarloPlot = dynamic(() => import("recharts").then(({
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
}) => function MonteCarloPlot({ data }: { data: { trade: number; p10: number | undefined; p50: number; p90: number | undefined }[] }) {
  return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="mcFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22e69a" stopOpacity={0.25} />
              <stop offset="100%" stopColor="#22e69a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="trade" tickLine={false} axisLine={false} minTickGap={40} />
          <YAxis
            tickFormatter={(v: number) => `$${Math.round(v / 100) / 10}rb`}
            tickLine={false}
            axisLine={false}
            width={52}
          />
          <Tooltip
            contentStyle={{ background: "#131b2e", border: "1px solid #303b50", borderRadius: 10, fontSize: 12 }}
            labelFormatter={(l) => `Trade ke-${l}`}
            formatter={(value, name) => [fmtUSD(Number(value)), name === "p50" ? "Median" : name === "p90" ? "P90" : "P10"]}
          />
          <Area type="monotone" dataKey="p10" stroke="#f87171" strokeWidth={1} fill="none" dot={false} name="P10" />
          <Area type="monotone" dataKey="p90" stroke="#22e69a" strokeWidth={1} fill="none" dot={false} name="P90" />
          <Area type="monotone" dataKey="p50" stroke="#22e69a" strokeWidth={2} fill="url(#mcFill)" dot={false} name="Median" />
        </AreaChart>
      </ResponsiveContainer>
  );
}), { ssr: false });

export function MonteCarloPanel() {
  const [risk, setRisk] = useState(1);
  const [trades, setTrades] = useState(52);
  const [result, setResult] = useState<McResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/simulator/monte-carlo", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ riskPctPerTrade: risk, tradesPerPath: trades, paths: 800, seed: 42 }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Simulasi gagal");
        return;
      }
      setResult(json.data);
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  const data = result
    ? result.p50.map((v, i) => ({
        trade: i,
        p10: result.p10[i],
        p50: v,
        p90: result.p90[i],
      }))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Dices className="h-4 w-4 text-primary" aria-hidden /> Monte Carlo (bootstrap historis, seeded)
          <Badge tone="neutral">ilustratif — bukan prediksi</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Mengambil sampel R-multiple dari trade historis Anda (dengan pengembalian), 800 jalur
          equity. Seed tetap → hasil identik (reproducible). Pita p10–p90 menunjukkan sebaran
          hasil; risk-of-ruin = persentase jalur yang menyentuh drawdown ≥30%.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Risiko / Trade (%)" htmlFor="mc-risk" className="w-36">
            <Input id="mc-risk" type="number" min="0.1" max="10" step="0.1" value={risk} onChange={(e) => setRisk(Number(e.target.value))} />
          </Field>
          <Field label="Jumlah Trade / Jalur" htmlFor="mc-trades" className="w-40">
            <Input id="mc-trades" type="number" min="10" max="520" value={trades} onChange={(e) => setTrades(Number(e.target.value))} />
          </Field>
          <Button onClick={run} disabled={loading}>{loading ? "Menjalankan 800 jalur…" : "Jalankan Monte Carlo"}</Button>
        </div>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {result ? (
          <>
            {result.caveat ? (
              <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn">⚠ {result.caveat}</p>
            ) : null}
            <div className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
              <Box label="Median Akhir" value={fmtUSD(result.medianFinal)} strong />
              <Box label="P10 – P90" value={`${fmtUSD(result.p10Final)} – ${fmtUSD(result.p90Final)}`} />
              <Box label="Risk of Ruin (DD≥30%)" value={`${fmtNum(result.riskOfRuinPct, 1)}%`} />
              <Box label="Median Max DD" value={`${fmtNum(result.medianMaxDdPct, 1)}%`} />
            </div>
            <div className="h-[240px]" role="img" aria-label="Pita Monte Carlo p10 p50 p90">
              <MonteCarloPlot data={data} />
            </div>
          </>
        ) : null}
      </CardContent>
    </Card>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2">
      <p className="text-[10px] text-faint">{label}</p>
      <p className={`tnum ${strong ? "text-sm font-bold text-primary" : "text-sm font-semibold text-ink"}`}>{value}</p>
    </div>
  );
}
