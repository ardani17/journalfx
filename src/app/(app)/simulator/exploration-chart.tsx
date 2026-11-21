"use client";

import { Area, CartesianGrid, ComposedChart, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { addUTCDays } from "@/lib/dates";
import { explorationTradeDay, explorationTradesPerCycle, type ExplorationResult } from "@/lib/finance/exploration-monte-carlo";
import { fmtUSD } from "@/lib/money";

export type ExplorationAxis = "cycle" | "day" | "date";

const compact = new Intl.NumberFormat("id-ID", { notation: "compact", maximumFractionDigits: 1 });
const dateFormat = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short" });
const dateWithYear = new Intl.DateTimeFormat("id-ID", { timeZone: "UTC", day: "numeric", month: "short", year: "2-digit" });

export function formatExplorationBalance(value: number) {
  return Math.abs(value) >= 1e15 ? (value < 0 ? "−$" : "$") + Math.abs(value).toExponential(2) : fmtUSD(value);
}

export default function ExplorationChart({ chart, target, axis, startDate, tradesPerDay }: {
  chart: ExplorationResult["chart"];
  target?: number;
  axis: ExplorationAxis;
  startDate: string;
  tradesPerDay: number;
}) {
  const last = chart.length - 1;
  const byCycle = axis === "cycle";
  const group = byCycle ? explorationTradesPerCycle : tradesPerDay;
  const periods = explorationTradeDay(last, group);
  const tickSpan = byCycle ? periods : periods - 1;
  const intervals = Math.min(tickSpan, 4);
  const ticks = Array.from({ length: intervals + 1 }, (_, index) => {
    const period = Math.round(index * tickSpan / Math.max(intervals, 1));
    return byCycle ? Math.min(last, period * group) : period * group + 1;
  });
  const start = new Date(startDate + "T00:00:00Z");
  const end = addUTCDays(start, explorationTradeDay(last, tradesPerDay) - 1);
  const date = start.getUTCFullYear() === end.getUTCFullYear() ? dateFormat : dateWithYear;
  const label = (trade: number) => {
    if (axis === "date") return date.format(addUTCDays(start, Math.max(0, explorationTradeDay(trade, tradesPerDay) - 1)));
    if (trade === 0) return "Awal";
    return (byCycle ? "Siklus " : "Hari ") + explorationTradeDay(trade, group);
  };

  return (
    <div className="h-44 w-full min-w-0 sm:h-48" role="img" aria-label={"Proyeksi saldo dari " + label(byCycle ? 0 : 1) + " hingga " + label(last)}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <ComposedChart data={chart} margin={{ top: 10, left: 0, right: 16, bottom: 0 }}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="trade" type="number" domain={[0, last]} ticks={ticks} tickFormatter={label}
            interval="preserveStartEnd" tickLine={false} axisLine={false} minTickGap={12} padding={{ right: 13 }} />
          <YAxis width={50} tickLine={false} axisLine={false} tickCount={4}
            domain={[0, (max: number) => Math.max(max, target ?? 0)]}
            tickFormatter={(value: number) => "$" + (value >= 1e15 ? value.toExponential(0) : compact.format(value))} />
          <Tooltip
            contentStyle={{ background: "#131b2e", border: "1px solid #303b50", borderRadius: 10, fontSize: 12 }}
            labelFormatter={(value) => {
              const trade = Number(value);
              if (trade === 0) return axis === "date" ? `Saldo awal · ${label(trade)}` : "Saldo awal";
              return `${label(trade)} · Trade ${trade}`;
            }}
            formatter={(value) => Array.isArray(value)
              ? value.map((amount) => formatExplorationBalance(Number(amount))).join(" – ")
              : formatExplorationBalance(Number(value))}
          />
          <Area dataKey="bounds" name="Rentang P10–P90" stroke="none" fill="#22e69a" fillOpacity={0.22} isAnimationActive={false} />
          {target !== undefined ? <ReferenceLine y={target} stroke="#a8b3c7" strokeDasharray="4 4" /> : null}
          <Line dataKey="sample" name="Jalur contoh" stroke="#43e8a4" strokeWidth={2} dot={false} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
