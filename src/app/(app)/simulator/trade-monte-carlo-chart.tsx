"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { fmtUSD } from "@/lib/money";
import type { TradeMonteCarloResult } from "@/lib/finance/trade-monte-carlo";

export default function TradeMonteCarloChart({ chart }: { chart: TradeMonteCarloResult["chart"] }) {
  const data = chart.map((row) => ({ ...row, outer: [row.p5, row.p95], inner: [row.p25, row.p75] }));
  return (
    <div className="h-80" role="img" aria-label="Distribusi ekuitas Monte Carlo berdasarkan jumlah transaksi">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart data={data} margin={{ top: 8, right: 12, bottom: 18, left: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="trade" type="number" domain={[1, Math.max(2, chart.length)]}
            label={{ value: "Trade Count", position: "insideBottom", offset: -8 }} />
          <YAxis domain={["auto", "auto"]} tickFormatter={(value) => fmtUSD(value)} width={90} />
          <Tooltip labelFormatter={(value) => `Transaksi ke-${value}`}
            formatter={(value) => Array.isArray(value) ? value.map((item) => fmtUSD(Number(item))).join(" – ") : fmtUSD(Number(value))}
            contentStyle={{ background: "#131b2e", border: "1px solid #303b50", borderRadius: 10, fontSize: 12 }} />
          <Legend verticalAlign="top" />
          <Area dataKey="outer" name="P5–P95" fill="#22e69a" fillOpacity={0.14} stroke="none" isAnimationActive={false} />
          <Area dataKey="inner" name="P25–P75" fill="#22e69a" fillOpacity={0.3} stroke="none" isAnimationActive={false} />
          <Line dataKey="p50" name="Median" stroke="#22e69a" strokeWidth={2} dot={false} isAnimationActive={false} />
          <Line dataKey="p5" name="P5" stroke="#f87171" dot={false} isAnimationActive={false} />
          <Line dataKey="expected" name="Ekspektasi per transaksi" stroke="#9ca3ff" strokeDasharray="5 4" dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
