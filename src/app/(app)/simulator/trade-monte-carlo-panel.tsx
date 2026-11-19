"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, THead, TH, TR } from "@/components/ui/table";
import { fmtNum, fmtUSD } from "@/lib/money";
import { simulateTradeMonteCarlo, tradeSimulationFields, tradeSimulationSchema, type TradeMonteCarloResult, type TradeStep } from "@/lib/finance/trade-monte-carlo";
import { CyclePagination } from "./cycle-pagination";

const Chart = dynamic(() => import("./trade-monte-carlo-chart"), { ssr: false });
const pct = (value: number) => `${fmtNum(value, 2)}%`;
const failureMessage = "Simulasi Monte Carlo gagal. Periksa parameter dan coba lagi.";

export function TradeMonteCarloPanel({ initialEquity }: { initialEquity: number }) {
  const [result, setResult] = useState<TradeMonteCarloResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const data = new FormData(event.currentTarget);
    const numbers = Object.fromEntries(Object.keys(tradeSimulationFields).map((key) => {
      const value = data.get(key);
      return [key, value === "" || value === null ? Number.NaN : Number(value)];
    }));
    const input = tradeSimulationSchema.safeParse({
      ...numbers,
      enableDrawdownThrottle: data.has("enableDrawdownThrottle"),
      enableWithdrawal: data.has("enableWithdrawal"),
    });
    if (!input.success) {
      setError("Masukkan angka dalam rentang yang valid untuk setiap parameter.");
      return;
    }
    setPending(true);
    setError("");

    function finish(message: { result?: TradeMonteCarloResult; error?: string }) {
      worker.current?.terminate();
      worker.current = null;
      if (message.result) setResult(message.result);
      if (message.error) setError(message.error);
      setPending(false);
    }

    try {
      if (input.data.iterations >= 2_000 || input.data.iterations * input.data.totalTrades >= 500_000) {
        const instance = new Worker(new URL("./monte-carlo.worker.ts", import.meta.url));
        worker.current = instance;
        instance.onmessage = ({ data }) => finish(data);
        instance.onerror = () => finish({ error: failureMessage });
        instance.postMessage(input.data);
      } else {
        finish({ result: simulateTradeMonteCarlo(input.data) });
      }
    } catch {
      finish({ error: failureMessage });
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Monte Carlo</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <form aria-label="Parameter Monte Carlo" onSubmit={run} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(tradeSimulationFields).map(([name, field]) => (
              <Field key={name} label={field.label} htmlFor={`monte-carlo-${name}`}>
                <Input id={`monte-carlo-${name}`} name={name} type="number" required
                  min={field.min} max={field.max} step={field.step}
                  defaultValue={name === "initialEquity" && initialEquity >= field.min && initialEquity <= field.max
                    ? Math.round(initialEquity * 100) / 100 : field.initial} />
              </Field>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" name="enableDrawdownThrottle" defaultChecked /> Kurangi risiko saat drawdown</label>
            <label className="flex items-center gap-2"><input type="checkbox" name="enableWithdrawal" /> Withdrawal berkala</label>
            <Button type="submit" disabled={pending}>{pending ? "Menghitung…" : "Simulasikan Monte Carlo"}</Button>
          </div>
          <p className="text-xs text-muted">Withdrawal dihitung dari laba bersih di atas saldo setelah withdrawal terakhir, atau modal awal untuk withdrawal pertama.</p>
        </form>
        {pending ? <p role="status" className="text-xs text-muted">Menghitung jalur Monte Carlo…</p> : null}
        {error ? <p role="alert" className="text-xs text-loss">{error}</p> : null}
        {result ? <MonteCarloResults result={result} /> : null}
      </CardContent>
    </Card>
  );
}

function MonteCarloResults({ result }: { result: TradeMonteCarloResult }) {
  const metrics = [
    ["Median saldo akhir", fmtUSD(result.medianFinal)],
    ["P5 saldo akhir", fmtUSD(result.p5Final)],
    ["Median kas ditarik", fmtUSD(result.medianWithdrawn)],
    ["Rata-rata max drawdown", pct(result.meanMaxDrawdown)],
    ["P95 max drawdown", pct(result.p95MaxDrawdown)],
    ["Risiko kehancuran", pct(result.riskOfRuin)],
    ["Rata-rata rentetan rugi terpanjang", fmtNum(result.meanLossStreak, 2)],
    ["Rentetan rugi maksimum", fmtNum(result.maxLossStreak, 0)],
  ];
  return (
    <div className="space-y-4">
      <dl className="grid grid-cols-2 gap-2 lg:grid-cols-4">
        {metrics.map(([label, value]) => (
          <div key={label} className="rounded-lg border border-line p-2">
            <dt className="text-xs text-muted">{label}</dt><dd className="tnum text-sm font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <Chart chart={result.chart} />
      <ExamplePath result={result} />
    </div>
  );
}

function ExamplePath({ result }: { result: TradeMonteCarloResult }) {
  const [expanded, setExpanded] = useState<number | null>(null);
  const { steps, tradesPerCycle, example } = result;
  const count = Math.ceil(steps.length / tradesPerCycle);
  return (
    <>
      <h3 className="text-sm font-semibold">Contoh jalur simulasi</h3>
      {example.stopped ? <p className="text-xs text-loss">
        {steps.length ? `Simulasi berhenti setelah trade ${steps.length} karena saldo mencapai batas margin.`
          : "Simulasi berhenti sebelum trade pertama karena saldo mencapai batas margin."}
      </p> : null}
      <CyclePagination count={count} label="Riwayat siklus Monte Carlo">
        {(start, end) => (
          <div className="space-y-2">
            {Array.from({ length: end - start }, (_, offset) => {
              const index = start + offset;
              const cycle = steps.slice(index * tradesPerCycle, (index + 1) * tradesPerCycle);
              const first = cycle[0]!;
              const last = cycle.at(-1)!;
              const totals = cycle.reduce((sum, item) => ({
                wins: sum.wins + Number(item.win),
                drawdown: Math.max(sum.drawdown, item.drawdown),
                cost: sum.cost + item.cost,
                gross: sum.gross + item.gross,
                net: sum.net + item.net,
                withdrawal: sum.withdrawal + item.withdrawal,
              }), { wins: 0, drawdown: 0, cost: 0, gross: 0, net: 0, withdrawal: 0 });
              const open = expanded === index;
              return (
                <div className="rounded-lg border border-line p-2" key={index}>
                  <Button variant="ghost" size="sm" aria-expanded={open} onClick={() => setExpanded(open ? null : index)}>
                    Siklus {index + 1} · Trade {first.trade}–{last.trade} ({cycle.length} trade)
                  </Button>
                  <p className="px-2 text-xs text-muted">
                    {totals.wins} menang · {cycle.length - totals.wins} kalah · Drawdown {pct(totals.drawdown)}
                  </p>
                  <p className="px-2 text-xs text-muted">
                    Saldo awal {fmtUSD(first.opening)} · Return {pct(100 * totals.net / first.opening)} · L/R kotor {fmtUSD(totals.gross)}
                    {" · "}Biaya {fmtUSD(totals.cost)} · L/R bersih {fmtUSD(totals.net)} · WD {fmtUSD(totals.withdrawal)} · Saldo akhir {fmtUSD(last.closing)}
                  </p>
                  {open ? <TradeDetails steps={cycle} /> : null}
                </div>
              );
            })}
          </div>
        )}
      </CyclePagination>
    </>
  );
}

function TradeDetails({ steps }: { steps: TradeStep[] }) {
  return (
    <TableWrap>
      <Table>
        <THead><TR>
          {["Trade", "Hasil", "Lot", "Risiko efektif", "Biaya", "L/R bersih", "WD", "Saldo", "Penanda"].map((label) => <TH key={label}>{label}</TH>)}
        </TR></THead>
        <TBody>
          {steps.map((step) => (
            <TR key={step.trade}>
              <TD>{step.trade}</TD><TD>{step.win ? "Menang" : "Kalah"}</TD><TD>{fmtNum(step.lot, 2)}</TD>
              <TD>{pct(step.riskPercent)} · {fmtUSD(step.actualRisk)}</TD><TD>{fmtUSD(step.cost)}</TD>
              <TD>{fmtUSD(step.net)}</TD><TD>{fmtUSD(step.withdrawal)}</TD><TD>{fmtUSD(step.closing)}</TD>
              <TD>{[step.throttled && "Throttle", step.withdrawal > 0 && "Withdrawal", step.stopped && "Batas margin"].filter(Boolean).join(" · ") || "—"}</TD>
            </TR>
          ))}
        </TBody>
      </Table>
    </TableWrap>
  );
}
