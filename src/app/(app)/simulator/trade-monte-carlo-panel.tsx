"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Table, TableWrap, TBody, TD, THead, TH, TR } from "@/components/ui/table";
import { D, fmtNum, fmtUSD } from "@/lib/money";
import { simulateTradeMonteCarlo, tradeSimulationFields, tradeSimulationSchema, type TradeMonteCarloResult, type TradeSimulationField, type TradeStep } from "@/lib/finance/trade-monte-carlo";
import { CyclePagination } from "./cycle-pagination";
import { formatTarget, parseSimulationNumber } from "./simulator-input";

const Chart = dynamic(() => import("./trade-monte-carlo-chart"), { ssr: false });
const pct = (value: number) => `${fmtNum(value, 2)}%`;
const failureMessage = "Simulasi Monte Carlo gagal. Periksa parameter dan coba lagi.";
const numericFields = Object.keys(tradeSimulationFields) as TradeSimulationField[];
const examples = [
  { name: "Konservatif", risk: 0.5, description: "Porsi risiko paling kecil pada setiap transaksi." },
  { name: "Santai", risk: 1, description: "Porsi risiko menengah untuk pembanding." },
  { name: "Agresif", risk: 2, description: "Porsi risiko paling tinggi sehingga saldo bisa bergerak lebih besar." },
] as const;

function initialNumericFields(initialEquity: number): Record<TradeSimulationField, string> {
  const { min, max } = tradeSimulationFields.initialEquity;
  return Object.fromEntries(numericFields.map((name) => [
    name, formatTarget(name === "initialEquity" && initialEquity >= min && initialEquity <= max
      ? Math.round(initialEquity * 100) / 100 : tradeSimulationFields[name].initial),
  ])) as Record<TradeSimulationField, string>;
}

export function TradeMonteCarloPanel({ initialEquity }: { initialEquity: number }) {
  const [form, setForm] = useState(() => initialNumericFields(initialEquity));
  const [example, setExample] = useState<(typeof examples)[number]["name"]>();
  const [throttle, setThrottle] = useState(true);
  const [withdrawal, setWithdrawal] = useState(false);
  const [result, setResult] = useState<TradeMonteCarloResult | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [invalidField, setInvalidField] = useState<string>();
  const worker = useRef<Worker | null>(null);
  useEffect(() => () => worker.current?.terminate(), []);

  const equity = parseSimulationNumber(form.initialEquity, true);
  const riskPercent = parseSimulationNumber(form.baseRiskPercent, true);
  const risk = equity !== undefined && equity > 0 && riskPercent !== undefined && riskPercent > 0
    ? { equity, percent: riskPercent, amount: D(equity).times(riskPercent).div(100) } : null;

  function applyExample(selected: (typeof examples)[number]) {
    setForm({ ...initialNumericFields(200), baseRiskPercent: formatTarget(selected.risk), pipValue: "5" });
    setExample(selected.name);
    setThrottle(true);
    setWithdrawal(false);
    setError("");
    setInvalidField(undefined);
    setResult(null);
  }

  function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (pending) return;
    const numbers = Object.fromEntries(numericFields.map((key) => [key, parseSimulationNumber(form[key], true)]));
    const input = tradeSimulationSchema.safeParse({
      ...numbers,
      enableDrawdownThrottle: throttle,
      enableWithdrawal: withdrawal,
    });
    if (!input.success) {
      const key = input.error.issues[0]?.path[0] as TradeSimulationField | undefined;
      const field = key && tradeSimulationFields[key];
      setInvalidField(key);
      if (key) document.getElementById(`monte-carlo-${key}`)?.focus();
      setError(field
        ? `${field.label} harus berupa ${field.step === 1 ? "bilangan bulat" : "angka"} antara ${formatTarget(field.min)} dan ${formatTarget(field.max)}.`
        : "Masukkan angka dalam rentang yang valid untuk setiap parameter.");
      return;
    }
    setPending(true);
    setError("");
    setInvalidField(undefined);

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
        <section aria-label="Contoh Monte Carlo" className="space-y-3 rounded-xl border border-line bg-panel-2/50 p-3">
          <Button variant="secondary" disabled={pending} onClick={() => applyExample(examples[1])}>Coba contoh US$200</Button>
          <div className="grid gap-2 sm:grid-cols-3">
            {examples.map((preset) => (
              <div key={preset.name} className="rounded-lg border border-line p-2">
                <Button variant={example === preset.name ? "primary" : "outline"} size="sm" aria-pressed={example === preset.name}
                  disabled={pending} onClick={() => applyExample(preset)}>
                  {preset.name}
                </Button>
                <p className="mt-2 text-xs text-muted">{formatTarget(preset.risk)}% · {preset.description}</p>
              </div>
            ))}
          </div>
          <p className="text-xs text-muted">Asumsi contoh: tingkat kemenangan 50%, rasio imbal hasil terhadap risiko 2:1, komisi US$7 per lot, dan spread serta selisih harga 1 pip. Setelah memilih contoh, Anda bisa mengubah semua parameter.</p>
        </section>
        <form aria-label="Parameter Monte Carlo" noValidate onSubmit={run} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {numericFields.map((name) => {
              const field = tradeSimulationFields[name];
              return (
                <Field key={name} label={field.label} htmlFor={`monte-carlo-${name}`}>
                  <Input id={`monte-carlo-${name}`} name={name} type="text" inputMode={field.step === 1 ? "numeric" : "decimal"} required
                    value={form[name]}
                    aria-invalid={invalidField === name || undefined}
                    aria-describedby={invalidField === name ? "monte-carlo-error" : undefined}
                    onChange={(event) => {
                      const value = event.target.value;
                      setForm((current) => ({ ...current, [name]: value }));
                      setExample(undefined);
                    }}
                    onBlur={() => {
                      const number = parseSimulationNumber(form[name], true);
                      if (number !== undefined) setForm((current) => ({ ...current, [name]: formatTarget(number) }));
                    }} />
                </Field>
              );
            })}
          </div>
          {risk ? <p className="text-xs text-muted" aria-live="polite">
            Risiko berdasarkan modal awal {formatTarget(risk.percent)}% × {fmtUSD(risk.equity)} = <strong>{fmtUSD(risk.amount)}</strong> per transaksi.
          </p> : null}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <label className="flex items-center gap-2"><input type="checkbox" checked={throttle} onChange={(event) => {
              setThrottle(event.target.checked);
              setExample(undefined);
            }} /> Kurangi risiko saat saldo turun</label>
            <label className="flex items-center gap-2"><input type="checkbox" checked={withdrawal} onChange={(event) => {
              setWithdrawal(event.target.checked);
              setExample(undefined);
            }} /> Penarikan berkala</label>
            <Button type="submit" disabled={pending}>{pending ? "Menghitung…" : "Simulasikan Monte Carlo"}</Button>
          </div>
          <p className="text-xs text-muted">Penarikan dihitung dari laba bersih di atas saldo setelah penarikan terakhir, atau modal awal untuk penarikan pertama.</p>
        </form>
        {pending ? <p role="status" className="text-xs text-muted">Menghitung jalur Monte Carlo…</p> : null}
        {error ? <p id="monte-carlo-error" role="alert" className="text-xs text-loss">{error}</p> : null}
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
      <p className="text-xs text-muted">
        Ilustrasi berdasarkan asumsi simulasi. Median adalah nilai tengah saldo akhir. Penurunan saldo dari puncak (drawdown) mengukur seberapa jauh saldo turun dari titik tertingginya. Peluang mencapai ambang kerugian menunjukkan bagian jalur simulasi yang melewati batas kerugian yang Anda isi.
      </p>
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
