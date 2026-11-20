"use client";

import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { CalendarClock, Play, Repeat, Save, Trash2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ScenarioFacts, type ScenarioFactsData } from "@/components/planning/scenario-facts";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { D, fmtNum, fmtUSD } from "@/lib/money";
import { describeProjection, frequencyDetails, type CompoundingFrequency, type WdModeSim } from "@/lib/finance/compounding";
import { runSimulationSchema, scenarioSchema } from "@/lib/validation/planning";
import { formatTarget, parseSimulationNumber } from "./simulator-input";
import { CyclePagination } from "./cycle-pagination";
import { TradeMonteCarloPanel } from "./trade-monte-carlo-panel";

interface RunResult {
  cyclesCount: number;
  reached: boolean;
  targetNotReached: boolean;
  finalBalance: string;
  totalWd: string;
  totalProfit: string;
  series: { cycle: number; opening: number; closing: number; wd: number }[];
  cycles: {
    cycle: number;
    opening: string;
    returnPct: string;
    grossProfit: string;
    costs: string;
    profit: string;
    wd: string;
    deposit: string;
    closing: string;
  }[];
}

const SimulatorPlot = dynamic(() => import("recharts").then(({
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
}) => function SimulatorPlot({ data }: { data: RunResult["series"] }) {
  return (
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
          <defs>
            <linearGradient id="simFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#22e69a" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#22e69a" stopOpacity={0.02} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" vertical={false} />
          <XAxis dataKey="cycle" tickLine={false} axisLine={false} minTickGap={30} />
          <YAxis
            tickFormatter={(v: number) => (v >= 1_000_000 ? `$${(v / 1_000_000).toFixed(1)}jt` : `$${Math.round(v / 1000)}rb`)}
            tickLine={false}
            axisLine={false}
            width={56}
          />
          <Tooltip
            contentStyle={{ background: "#131b2e", border: "1px solid #303b50", borderRadius: 10, fontSize: 12 }}
            labelFormatter={(l) => `Siklus ${l}`}
            formatter={(value, name) => [fmtUSD(Number(value)), name === "closing" ? "Balance" : "WD"]}
          />
          <Area type="monotone" dataKey="closing" stroke="#22e69a" strokeWidth={2} fill="url(#simFill)" dot={false} />
        </AreaChart>
      </ResponsiveContainer>
  );
}), { ssr: false });

const numericFields = {
  targetAmount: { id: "sim-target", label: "Target (USD)" },
  initialCapital: { id: "sim-capital", label: "Modal Awal (USD)" },
  returnPerCycle: { id: "sim-return", label: "Return / Siklus (%)" },
  wdRatio: { id: "sim-ratio", label: "Cap WD (% dari profit)" },
  fixedWdAmount: { id: "sim-fixed", label: "Nominal WD (USD)" },
  costPerCycle: { id: "sim-cost", label: "Biaya / Siklus (USD)" },
} as const;
type NumericField = keyof typeof numericFields;
type FieldErrors = Partial<Record<NumericField | "name", string>>;

export function SimulatorClient({
  defaults,
  saved,
  selected,
  monteCarloEquity,
}: {
  defaults: {
    initialCapital: number;
    targetAmount: number;
    returnPerCycle: number;
    frequency: CompoundingFrequency;
    wdMode: WdModeSim;
    wdRatio: number;
  };
  saved: { id: string; name: string; returnPerCycle: number; wdMode: string; wdRatio: number | null }[];
  selected: (ScenarioFactsData & { id: string; name: string }) | null;
  monteCarloEquity?: number;
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "Rencana Utama",
    initialCapital: String(defaults.initialCapital),
    targetAmount: formatTarget(defaults.targetAmount),
    returnPerCycle: String(defaults.returnPerCycle),
    frequency: defaults.frequency,
    wdMode: defaults.wdMode,
    wdRatio: String(defaults.wdRatio),
    fixedWdAmount: "0",
    costPerCycle: "0",
  });
  const [result, setResult] = useState<{ data: RunResult; frequency: CompoundingFrequency } | null>(null);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"run" | "save" | "delete" | null>(null);

  function buildInput(action: "run" | "save") {
    const parseField = (key: NumericField) => parseSimulationNumber(form[key], key === "targetAmount") ?? null;
    const input = {
      initialCapital: parseField("initialCapital"),
      targetAmount: parseField("targetAmount"),
      returnPerCycle: parseField("returnPerCycle"),
      frequency: form.frequency,
      wdMode: form.wdMode,
      wdRatio: form.wdMode === "DYNAMIC" ? parseField("wdRatio") : undefined,
      fixedWdAmount: form.wdMode === "FIXED" ? parseField("fixedWdAmount") : undefined,
      costPerCycle: parseField("costPerCycle"),
    };
    const parsed = action === "save"
      ? scenarioSchema.safeParse({ ...input, name: form.name })
      : runSimulationSchema.safeParse(input);
    if (parsed.success) {
      setFieldErrors({});
      return parsed.data;
    }
    const errors: FieldErrors = {};
    for (const issue of parsed.error.issues) {
      const key = issue.path[0];
      if (key === "name") errors.name = "Masukkan nama skenario (2–80 karakter).";
      else if (typeof key === "string" && Object.hasOwn(numericFields, key)) {
        const field = key as NumericField;
        errors[field] = form[field].trim() ? "Masukkan angka dalam rentang yang valid." : "Kolom ini wajib diisi.";
      }
    }
    setFieldErrors(errors);
  }

  async function submit(action: "run" | "save") {
    setError(null);
    const input = buildInput(action);
    if (!input) return;
    const endpoint = action === "save" ? "/api/scenarios" : "/api/simulator/run";
    setPending(action);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? (action === "run" ? "Simulasi gagal" : "Gagal menyimpan skenario"));
        return;
      }
      if (action === "run") setResult({ data: body.data, frequency: form.frequency });
      else router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setPending(null);
    }
  }

  async function remove(id: string) {
    setError(null);
    setPending("delete");
    try {
      const res = await fetch(`/api/scenarios/${encodeURIComponent(id)}`, { method: "DELETE" });
      const body = await res.json();
      if (!res.ok || !body.ok) return setError(body.error ?? "Gagal menghapus skenario");
      if (selected?.id === id) router.replace("/simulator");
      else router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setPending(null);
    }
  }

  function numberField(key: NumericField) {
    const { id, label } = numericFields[key];
    const grouped = key === "targetAmount";
    return (
      <Field label={label} htmlFor={id} error={fieldErrors[key]}>
        <Input id={id} inputMode="decimal" value={form[key]} aria-invalid={!!fieldErrors[key]}
          onChange={(e) => {
            const value = e.target.value;
            setForm((current) => ({ ...current, [key]: value }));
            setFieldErrors((current) => ({ ...current, [key]: undefined }));
          }}
          onFocus={grouped ? (e) => {
            const value = parseSimulationNumber(e.target.value, true);
            if (value !== undefined) setForm((current) => ({ ...current, [key]: D(value).toFixed() }));
          } : undefined}
          onBlur={(e) => {
            const value = parseSimulationNumber(e.target.value, grouped);
            if (value !== undefined) setForm((current) => ({ ...current, [key]: grouped ? formatTarget(value) : D(value).toFixed() }));
          }} />
      </Field>
    );
  }

  return (
    <>
      {selected ? (
        <Card>
          <CardHeader><CardTitle>{selected.name}</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <ScenarioFacts scenario={selected} />
            <Link className="inline-block text-sm text-primary hover:underline" href="/simulator">Kembali ke Simulator</Link>
          </CardContent>
        </Card>
      ) : <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          {numberField("targetAmount")}
          {numberField("initialCapital")}
          {numberField("returnPerCycle")}
          <Field label="Frekuensi" htmlFor="sim-freq">
            <Select id="sim-freq" value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value as typeof form.frequency })}>
              {Object.entries(frequencyDetails).map(([value, detail]) => <option key={value} value={value}>{detail.name}</option>)}
            </Select>
          </Field>
          <Field label="Mode WD" htmlFor="sim-wd">
            <Select id="sim-wd" value={form.wdMode}
              onChange={(e) => setForm({ ...form, wdMode: e.target.value as typeof form.wdMode })}>
              <option value="NONE">Tanpa WD (full compounding)</option>
              <option value="DYNAMIC">Dinamis (% profit)</option>
              <option value="FIXED">Nominal tetap</option>
            </Select>
          </Field>
          {form.wdMode === "DYNAMIC" && numberField("wdRatio")}
          {form.wdMode === "FIXED" && numberField("fixedWdAmount")}
          {numberField("costPerCycle")}
          <Field label="Nama Skenario" htmlFor="sim-name" error={fieldErrors.name}>
            <Input id="sim-name" value={form.name} maxLength={80} aria-invalid={!!fieldErrors.name}
              onChange={(e) => {
                setForm({ ...form, name: e.target.value });
                setFieldErrors((current) => ({ ...current, name: undefined }));
              }} />
          </Field>
          <div className="flex flex-wrap items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button onClick={() => submit("run")} disabled={pending !== null}>
              <Play className="h-4 w-4" aria-hidden /> {pending === "run" ? "Menghitung…" : "Simulasikan"}
            </Button>
            <Button variant="purple" onClick={() => submit("save")} disabled={pending !== null}>
              <Save className="h-4 w-4" aria-hidden /> {pending === "save" ? "Menyimpan…" : "Simpan Skenario"}
            </Button>
          </div>
        </CardContent>
      </Card>}

      {error ? <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p> : null}

      {selected ? <SavedSimulationResult id={selected.id} frequency={selected.frequency} />
        : result ? <SimulationResult result={result.data} frequency={result.frequency} /> : null}

      <TradeMonteCarloPanel
        key={monteCarloEquity ?? selected?.id ?? "default"}
        initialEquity={monteCarloEquity ?? Number(selected?.initialCapital ?? defaults.initialCapital)}
      />

      {/* Saved scenarios */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Skenario Tersimpan</h2>
        <TableWrap>
          <Table>
            <THead><TR><TH>Nama</TH><TH className="text-right">Return</TH><TH>Mode WD</TH><TH className="text-right">Aksi</TH></TR></THead>
            <TBody>
              {saved.length === 0 ? (
                <EmptyRow colSpan={4}>Belum ada skenario tersimpan.</EmptyRow>
              ) : (
                saved.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-xs font-medium">{s.name}</TD>
                    <TD className="tnum text-right text-xs">{fmtNum(s.returnPerCycle, 2)}%</TD>
                    <TD className="text-xs text-muted">{s.wdMode === "DYNAMIC" ? `Dinamis ${s.wdRatio ?? "—"}%` : s.wdMode === "FIXED" ? "Tetap" : "Tanpa WD"}</TD>
                    <TD className="text-right">
                      <div className="flex flex-wrap items-center justify-end gap-x-2">
                        <Link href={`/simulator?scenarioId=${encodeURIComponent(s.id)}`} className="inline-flex min-h-9 items-center text-xs text-primary hover:underline" aria-label={`Buka ${s.name}`}>Buka</Link>
                        <Button variant="ghost" size="sm" onClick={() => remove(s.id)} disabled={pending !== null} aria-label={`Hapus ${s.name}`}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </div>
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      </div>
    </>
  );
}

function SavedSimulationResult({ id, frequency }: { id: string; frequency: CompoundingFrequency }) {
  const simulation = useQuery({
    queryKey: ["saved-simulation", id],
    queryFn: async ({ signal }): Promise<RunResult> => {
      const response = await fetch(`/api/scenarios/${encodeURIComponent(id)}/run`, { method: "POST", signal });
      const body = await response.json().catch(() => null);
      if (!response.ok || !body?.ok) throw new Error(body?.error ?? "Simulasi skenario gagal.");
      return body.data;
    },
    gcTime: 0,
    retry: false,
  });

  if (simulation.isPending || simulation.isFetching) {
    return <p role="status" className="rounded-lg border border-line bg-panel p-3 text-sm text-muted">Menghitung simulasi…</p>;
  }
  if (simulation.isError) {
    return (
      <div className="flex flex-wrap items-center gap-3 rounded-lg border border-loss/30 bg-loss/10 p-3">
        <p role="alert" className="text-sm text-loss">{simulation.error.message}</p>
        <Button variant="secondary" size="sm" onClick={() => simulation.refetch()}>Coba Lagi</Button>
      </div>
    );
  }
  return <SimulationResult result={simulation.data} frequency={frequency} />;
}

function SimulationResult({ result, frequency }: { result: RunResult; frequency: CompoundingFrequency }) {
  return (
    <>
      {/* Estimate panel + growth curve */}
      <div className="grid gap-3 lg:grid-cols-[32fr_68fr]">
        <Card className="border-indigo-soft/30 bg-indigo/10">
          <CardHeader><CardTitle className="text-indigo-soft">Estimasi Pencapaian</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex items-center gap-2.5 text-sm">
              <CalendarClock className="h-4 w-4 text-indigo-soft" aria-hidden />
              <div>
                <p className="text-xs text-muted">Lama Estimasi</p>
                <p className="tnum font-bold">
                  {describeProjection(result, frequency)}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <Repeat className="h-4 w-4 text-indigo-soft" aria-hidden />
              <div>
                <p className="text-xs text-muted">Jumlah Siklus</p>
                <p className="tnum font-bold">{result.cyclesCount}×</p>
              </div>
            </div>
            <div className="flex items-center gap-2.5 text-sm">
              <TrendingUp className="h-4 w-4 text-indigo-soft" aria-hidden />
              <div>
                <p className="text-xs text-muted">Balance Akhir (Estimasi)</p>
                <p className="tnum font-bold text-primary">{fmtUSD(result.finalBalance)}</p>
              </div>
            </div>
            <div>
              <p className="text-xs text-muted">Total WD (Estimasi)</p>
              <p className="tnum font-bold">{fmtUSD(result.totalWd)}</p>
            </div>
            <Badge tone={result.reached ? "success" : "warn"}>
              {result.reached ? "Target tercapai (proyeksi)" : "Target belum tercapai dalam horizon"}
            </Badge>
            <p className="text-[10px] leading-relaxed text-faint">
              Proyeksi deterministik dari parameter Anda. Performa aktual bergantung pada hasil
              trading nyata dan tercatat terpisah di ledger.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Kurva Pertumbuhan (Proyeksi)</CardTitle></CardHeader>
          <CardContent>
            <div className="h-[280px]" role="img" aria-label="Kurva pertumbuhan simulasi">
              <SimulatorPlot data={result.series} />
            </div>
          </CardContent>
        </Card>
      </div>

      <CyclePagination count={result.cycles.length} label="Riwayat siklus deterministik">
        {(start, end) => (
          <TableWrap>
            <Table>
              <THead>
                <TR>
                  <TH>Siklus</TH>
                  {["Saldo awal", "Return", "L/R kotor", "Biaya", "L/R bersih", "Deposit", "Withdrawal", "Saldo akhir"].map((label) => (
                    <TH key={label} className="text-right">{label}</TH>
                  ))}
                </TR>
              </THead>
              <TBody>
                {result.cycles.length === 0 ? <EmptyRow colSpan={9}>Target sudah tercapai sejak awal.</EmptyRow> :
                  result.cycles.slice(start, end).map((cycle) => (
                    <TR key={cycle.cycle}>
                      <TD className="tnum whitespace-nowrap text-xs">{cycle.cycle} {frequencyDetails[frequency].unit}</TD>
                      {[fmtUSD(cycle.opening), `${fmtNum(D(cycle.returnPct), 2)}%`, fmtUSD(cycle.grossProfit),
                        fmtUSD(cycle.costs), fmtUSD(cycle.profit), fmtUSD(cycle.deposit),
                        fmtUSD(cycle.wd), fmtUSD(cycle.closing)].map((value, index) => (
                        <TD className="tnum whitespace-nowrap text-right text-xs" key={index}>{value}</TD>
                      ))}
                    </TR>
                  ))}
              </TBody>
            </Table>
          </TableWrap>
        )}
      </CyclePagination>
    </>
  );
}
