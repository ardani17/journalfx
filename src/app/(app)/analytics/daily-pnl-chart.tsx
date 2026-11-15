"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

interface Point {
  date: string;
  pnl: number;
  trades: number;
}

export function DailyPnlChart({ data }: { data: Point[] }) {
  return (
    <div className="h-[260px] w-full" role="img" aria-label="Grafik P dan L harian">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v: string) => v.slice(8)}
            tickLine={false}
            axisLine={false}
            minTickGap={20}
          />
          <YAxis
            tickFormatter={(v: number) => `$${v.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            cursor={{ fill: "rgba(48,59,80,0.3)" }}
            contentStyle={{ background: "#131b2e", border: "1px solid #303b50", borderRadius: 10, fontSize: 12 }}
            labelStyle={{ color: "#a8b3c7" }}
            formatter={(value) => [`$${Number(value).toLocaleString("id-ID", { minimumFractionDigits: 2 })}`, "P/L"]}
          />
          <Bar dataKey="pnl" radius={[3, 3, 0, 0]} maxBarSize={18}>
            {data.map((d) => (
              <Cell key={d.date} fill={d.pnl >= 0 ? "#22e69a" : "#f87171"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
