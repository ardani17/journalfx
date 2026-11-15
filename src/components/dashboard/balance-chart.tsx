"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

export interface BalancePointDTO {
  date: string;
  balance: number;
  projected?: number | null;
}

function fmtTick(v: number): string {
  return `$${v.toLocaleString("id-ID", { maximumFractionDigits: 0 })}`;
}

function fmtDateLabel(iso: string): string {
  const [, m, d] = iso.split("-");
  const months = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];
  return `${Number(d)} ${months[Number(m) - 1] ?? ""}`;
}

export function BalanceChart({ data, showProjection }: { data: BalancePointDTO[]; showProjection?: boolean }) {
  return (
    <div className="h-[260px] w-full" role="img" aria-label="Grafik pertumbuhan balance">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="balanceFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22e69a" stopOpacity={0.32} />
              <stop offset="100%" stopColor="#22e69a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={fmtDateLabel}
            tickLine={false}
            axisLine={false}
            minTickGap={28}
          />
          <YAxis
            tickFormatter={fmtTick}
            tickLine={false}
            axisLine={false}
            width={64}
            domain={["auto", "auto"]}
          />
          <Tooltip
            cursor={{ stroke: "#303b50" }}
            contentStyle={{
              background: "#131b2e",
              border: "1px solid #303b50",
              borderRadius: 10,
              fontSize: 12,
            }}
            labelStyle={{ color: "#a8b3c7" }}
            formatter={(value) => [`$${Number(value).toLocaleString("id-ID", { minimumFractionDigits: 2 })}`, "Balance"]}
            labelFormatter={(label) => fmtDateLabel(String(label ?? ""))}
          />
          <Area
            type="monotone"
            dataKey="balance"
            stroke="#22e69a"
            strokeWidth={2}
            fill="url(#balanceFill)"
            dot={{ r: 2.5, fill: "#22e69a", strokeWidth: 0 }}
            activeDot={{ r: 4 }}
          />
          {showProjection ? (
            <Area
              type="monotone"
              dataKey="projected"
              stroke="#6d5fd4"
              strokeWidth={1.5}
              strokeDasharray="5 4"
              fill="none"
              dot={false}
              connectNulls
              name="Proyeksi"
            />
          ) : null}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
