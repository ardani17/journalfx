"use client";

import { useDeferredValue, useEffect, useMemo, useState, type FormEvent } from "react";
import { ArrowUpRight, Shuffle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, THead, TH, TR } from "@/components/ui/table";
import { formatFxEstimate, type JisdorQuote } from "@/lib/finance/exchange";
import {
  explorationFieldNames, explorationFields, explorationPaths, explorationSchema, explorationTradeDay, explorationTradesPerCycle,
  simulateExploration, type ExplorationField, type ExplorationInput, type ExplorationTrade,
} from "@/lib/finance/exploration-monte-carlo";
import { monteCarloEquityStorageKey, parseMonteCarloEquity } from "@/lib/finance/trading-capital";
import { normalizeNumericInput } from "@/lib/number-input";
import ExplorationChart, { formatExplorationBalance, type ExplorationAxis } from "./exploration-chart";
import { formatTarget, parseSimulationNumber } from "./simulator-input";

type ExplorationForm = Record<ExplorationField, string> & Pick<ExplorationInput, "withdrawal">;
type SavedScenario = { id: string; name: string; input: ExplorationInput };
const axes = [["cycle", "Siklus"], ["day", "Hari"], ["date", "Tanggal"]] as const;
const primaryFields = ["capital", "target", "trades", "winRate", "winReturn", "lossReturn"] as const;
const groupedAmounts = new Set<ExplorationField>(["capital", "target", "withdrawalAmount", "fee"]);

function parseField(name: ExplorationField, value: string) {
  if (name === "tradesPerDay") {
    const normalized = normalizeNumericInput(value, true);
    if (!normalized || !/^\d+$/.test(normalized)) return undefined;
    const number = Number(normalized);
    return Number.isSafeInteger(number) ? number : undefined;
  }
  return groupedAmounts.has(name) ? normalizeNumericInput(value, true) : parseSimulationNumber(value);
}

function toForm(input: ExplorationInput): ExplorationForm {
  return {
    ...Object.fromEntries(explorationFieldNames.map((key) => [key, formatTarget(input[key])])) as Record<ExplorationField, string>,
    withdrawal: input.withdrawal,
  };
}

function readForm(form: ExplorationForm) {
  const numbers = Object.fromEntries(explorationFieldNames.map((key) => [key, parseField(key, form[key])]));
  return explorationSchema.safeParse({
    ...numbers,
    tradesPerDay: numbers.tradesPerDay ?? null,
    withdrawal: form.withdrawal,
    withdrawalRate: form.withdrawal === "DYNAMIC" ? numbers.withdrawalRate : explorationFields.withdrawalRate.initial,
    withdrawalAmount: form.withdrawal === "FIXED" ? numbers.withdrawalAmount : explorationFields.withdrawalAmount.initial,
  });
}

function readScenarios(key: string): SavedScenario[] {
  const raw = localStorage.getItem(key);
  if (!raw) return [];
  let parsed: unknown;
  try { parsed = JSON.parse(raw); } catch { return []; }
  if (!Array.isArray(parsed)) return [];
  return parsed.flatMap((item: unknown) => {
    if (!item || typeof item !== "object" || !("id" in item) || !("name" in item) || !("input" in item)) return [];
    if (typeof item.id !== "string" || typeof item.name !== "string") return [];
    const input = explorationSchema.safeParse(item.input);
    return input.success ? [{ id: item.id, name: item.name, input: input.data }] : [];
  });
}

export function ExplorationPanel({ initial, initialSeed, initialDate, userId, quote }: {
  initial: ExplorationInput;
  initialSeed: number;
  initialDate: string;
  userId: string;
  quote: JisdorQuote | null;
}) {
  const [form, setForm] = useState(() => toForm(initial));
  const [parameters, setParameters] = useState(initial);
  const [seed, setSeed] = useState(initialSeed);
  const [axis, setAxis] = useState<ExplorationAxis>("cycle");
  const [startDate, setStartDate] = useState(initialDate);
  const [dialog, setDialog] = useState<"path" | "save" | "scenarios" | null>(null);
  const [saved, setSaved] = useState<SavedScenario[]>([]);
  const [storageError, setStorageError] = useState("");
  const [notice, setNotice] = useState("");
  const storageKey = "horizon-journal:exploration:" + userId;
  const current = readForm(form);
  const { capital, target, trades, winRate: simulatedWinRate, winReturn, lossReturn, withdrawal, withdrawalRate,
    withdrawalAmount, fee } = useDeferredValue(parameters);
  const result = useMemo(() => simulateExploration({
    capital, target, trades, winRate: simulatedWinRate, winReturn, lossReturn, withdrawal, withdrawalRate, withdrawalAmount, fee,
  }, seed), [capital, target, trades, simulatedWinRate, winReturn, lossReturn, withdrawal, withdrawalRate, withdrawalAmount, fee, seed]);
  const chance = formatTarget(result.reachedCount * 100 / explorationPaths) + "%";
  const last = result.chart.at(-1)!;
  const chartPeak = Math.max(...result.chart.map(({ bounds, sample }) => Math.max(bounds[1], sample)));
  const chartTarget = Number(target);
  const targetOnScale = chartTarget <= chartPeak * 1.5;
  const winRate = parseSimulationNumber(form.winRate);
  const { tradesPerDay } = parameters;
  const duration = explorationTradeDay(trades, tradesPerDay);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      if (window.location.hash !== "#monte-carlo") return;
      try {
        const key = monteCarloEquityStorageKey(userId);
        const capital = parseMonteCarloEquity(sessionStorage.getItem(key));
        sessionStorage.removeItem(key);
        if (capital !== undefined) {
          setForm((previous) => ({ ...previous, capital: formatTarget(capital) }));
          setParameters((previous) => ({ ...previous, capital }));
        }
      } catch {
        // Keep the project amount if browser storage is unavailable.
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [userId]);

  function update(next: ExplorationForm) {
    setForm(next);
    const parsed = readForm(next);
    if (parsed.success) setParameters(parsed.data);
  }

  function openScenarios() {
    setStorageError("");
    try { setSaved(readScenarios(storageKey)); }
    catch { setStorageError("Skenario di browser tidak dapat dibuka."); }
    setDialog("scenarios");
  }

  function saveScenario(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const name = String(new FormData(event.currentTarget).get("name") ?? "").trim();
    if (!current.success || name.length < 2) {
      setStorageError("Masukkan nama skenario minimal dua karakter.");
      return;
    }
    try {
      const next = [{ id: crypto.randomUUID(), name, input: current.data }, ...readScenarios(storageKey)];
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
      setDialog(null);
      setNotice("Skenario " + name + " tersimpan di browser ini.");
    } catch {
      setStorageError("Skenario tidak dapat disimpan di browser ini.");
    }
  }

  function deleteScenario(id: string) {
    setStorageError("");
    try {
      const next = readScenarios(storageKey).filter((scenario) => scenario.id !== id);
      localStorage.setItem(storageKey, JSON.stringify(next));
      setSaved(next);
    } catch {
      setStorageError("Skenario tidak dapat dihapus di browser ini.");
    }
  }

  function field(name: ExplorationField) {
    const { label, min, max } = explorationFields[name];
    const id = "exploration-" + name;
    const invalid = !current.success && current.error.issues.some((issue) => issue.path[0] === name);
    const isTradeCount = name === "trades" || name === "tradesPerDay";
    const unit = isTradeCount ? "bilangan bulat" : "angka";
    const isUsd = groupedAmounts.has(name);
    const precision = isUsd ? " dengan maksimal dua desimal" : "";
    const amount = isUsd && !invalid ? normalizeNumericInput(form[name], true) : undefined;
    const estimate = amount === undefined ? null : formatFxEstimate(amount, "USD", quote)?.replace("≈ Rp", "≈ Rp ");
    const descriptionId = isTradeCount ? "exploration-trade-scale" : estimate ? `${id}-idr` : undefined;
    const error = name === "tradesPerDay" ? "Masukkan bilangan bulat positif."
      : `Masukkan ${unit} ${formatTarget(min)}–${formatTarget(max)}${precision}.`;
    return (
      <Field key={name} label={label} htmlFor={id}
        error={invalid ? error : undefined}>
        <Input id={id} name={name} type="text" inputMode={isTradeCount ? "numeric" : "decimal"}
          aria-invalid={invalid || undefined}
          aria-describedby={descriptionId}
          value={form[name]} onChange={(event) => update({ ...form, [name]: event.target.value })}
          onBlur={() => {
            const number = parseField(name, form[name]);
            if (number !== undefined) setForm((previous) => ({ ...previous, [name]: formatTarget(number) }));
          }} />
        {estimate ? <p id={descriptionId} className="tnum break-words text-[11px] text-faint">{estimate}</p> : null}
      </Field>
    );
  }

  return (
    <section id="monte-carlo" className="min-w-0 scroll-mt-20 space-y-4" aria-label="Eksplorasi Monte Carlo">
      <Card className="overflow-hidden bg-panel-2">
        <div className="grid min-w-0 gap-4 bg-[radial-gradient(ellipse_at_top_right,#163a39,transparent_68%)] p-4 sm:p-5 xl:grid-cols-[minmax(12rem,0.75fr)_minmax(0,2fr)] xl:items-center">
          <div className="flex flex-wrap items-start justify-between gap-3 xl:flex-col">
            <div aria-live="polite" aria-atomic="true">
              <h2 className="text-sm font-medium text-muted">Peluang menyentuh target</h2>
              <p className="tnum mt-1 text-4xl font-bold tracking-tight sm:text-5xl">{chance}</p>
              <p className="mt-1 text-xs text-muted">{result.reachedCount} dari {explorationPaths} jalur dalam {trades} trade.</p>
            </div>
            <div className="rounded-lg border border-primary/25 bg-primary/5 px-3 py-2">
              <p className="text-[11px] text-muted">Target saldo</p>
              <p className="tnum text-sm font-semibold">{formatExplorationBalance(chartTarget)}</p>
            </div>
          </div>
          <figure className="min-w-0">
            <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1">
              <span id="exploration-axis-label" className="text-xs text-muted">Sumbu grafik</span>
              <div role="group" aria-labelledby="exploration-axis-label" className="inline-flex rounded-lg border border-line bg-surface p-0.5">
                {axes.map(([value, label]) => (
                  <Button key={value} size="sm" variant="ghost" aria-pressed={axis === value}
                    className={axis === value ? "bg-primary/15 text-primary" : undefined}
                    onClick={() => setAxis(value)}>{label}</Button>
                ))}
              </div>
            </div>
            <ExplorationChart chart={result.chart} target={targetOnScale ? chartTarget : undefined}
              axis={axis} startDate={startDate || initialDate} tradesPerDay={tradesPerDay} />
            <figcaption className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-[11px] text-muted">
              <span className="inline-flex items-center gap-1.5"><i aria-hidden className="h-2 w-3 rounded-sm bg-primary/30" />Rentang P10–P90</span>
              <span className="inline-flex items-center gap-1.5"><i aria-hidden className="w-3 border-t-2 border-primary" />Jalur contoh</span>
              {targetOnScale ? (
                <span className="inline-flex items-center gap-1.5"><i aria-hidden className="w-3 border-t border-dashed border-muted" />Target</span>
              ) : <span>Target di atas skala grafik</span>}
            </figcaption>
          </figure>
        </div>
        <dl className="grid grid-cols-3 divide-x divide-line border-t border-line-soft px-2 py-3 sm:px-3">
          {[["Proyeksi saldo akhir P10", last.bounds[0]], ["Proyeksi saldo akhir median", result.median], ["Proyeksi saldo akhir P90", last.bounds[1]]].map(([label, value]) => (
            <div key={label} className="min-w-0 px-2 sm:px-3">
              <dt className="text-[11px] text-muted sm:text-xs">{label}</dt>
              <dd className="tnum mt-1 break-all text-sm font-semibold sm:text-xl">{formatExplorationBalance(Number(value))}</dd>
            </div>
          ))}
        </dl>
        <div className="flex flex-wrap items-center justify-between gap-x-2 border-t border-line-soft px-2 py-1">
          <Button variant="ghost" size="sm" onClick={() => setDialog("path")}>Lihat jalur win/loss <ArrowUpRight className="h-3.5 w-3.5" aria-hidden /></Button>
          <div className="flex flex-wrap items-center">
            <Button variant="ghost" size="sm" onClick={openScenarios}>Skenario</Button>
            <Button variant="ghost" size="sm" className="text-primary" disabled={!current.success}
              onClick={() => { setStorageError(""); setDialog("save"); }}>Simpan skenario</Button>
          </div>
        </div>
      </Card>
      <Card className="bg-panel-2 p-4 sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-lg font-semibold tracking-tight">Uji asumsi</h2>
          <Button variant="secondary" size="sm" disabled={!current.success} onClick={() => setSeed((previous) => (previous + 0x9e3779b9) >>> 0)}>
            <Shuffle className="h-3.5 w-3.5" aria-hidden /> Acak ulang
          </Button>
        </div>
        <p className="mt-1 text-xs text-muted">Laba dan rugi dihitung dari saldo sebelum setiap trade.</p>
        <div className="mt-4 grid grid-cols-2 items-start gap-3 md:grid-cols-4 xl:grid-cols-7">
          {primaryFields.map((name) => name === "trades" ? (
            <div key={name} className="col-span-2 grid grid-cols-2 items-start gap-x-3 gap-y-2">
              {field(name)}
              {field("tradesPerDay")}
              <p className="col-span-2 text-[11px] text-faint" id="exploration-trade-scale">
                Estimasi durasi {formatTarget(duration)} hari kalender.
                {axis === "cycle" ? ` 1 siklus = ${explorationTradesPerCycle} trade.` : null}
              </p>
              {axis === "date" ? (
                <Field label="Tanggal awal grafik" htmlFor="exploration-date" className="col-span-2">
                  <Input id="exploration-date" type="date" min="0001-01-01" max="9999-12-31" value={startDate}
                    onChange={(event) => { if (event.target.validity.valid) setStartDate(event.target.value); }}
                    onBlur={() => { if (!startDate) setStartDate(initialDate); }} />
                </Field>
              ) : null}
            </div>
          ) : name === "winRate" ? (
            <div key={name}>
              {field(name)}
              <input type="range" min="0" max="100" step="0.1" value={Math.min(100, Math.max(0, winRate ?? parameters.winRate))}
                aria-label="Geser peluang menang" className="mt-2 w-full accent-primary"
                onChange={(event) => update({ ...form, winRate: formatTarget(event.target.valueAsNumber) })} />
            </div>
          ) : field(name))}
        </div>
        <details className="group mt-4 border-t border-line-soft pt-3">
          <summary className="cursor-pointer text-sm font-medium text-muted">Penarikan &amp; biaya</summary>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Mode penarikan per trade" htmlFor="exploration-withdrawal">
              <Select id="exploration-withdrawal" value={form.withdrawal}
                onChange={(event) => update({ ...form, withdrawal: event.target.value as ExplorationInput["withdrawal"] })}>
                <option value="NONE">Tanpa penarikan</option>
                <option value="DYNAMIC">Persentase laba</option>
                <option value="FIXED">Nominal tetap</option>
              </Select>
            </Field>
            {form.withdrawal === "DYNAMIC" ? field("withdrawalRate") : null}
            {form.withdrawal === "FIXED" ? field("withdrawalAmount") : null}
            {field("fee")}
          </div>
        </details>
        {!current.success ? <p className="mt-3 text-xs text-warn" role="status">Grafik menampilkan hasil dari isian terakhir yang valid.</p> : null}
      </Card>
      <p className="text-xs text-muted">Simulasi ilustratif. P10–P90 menunjukkan kisaran tengah saldo pada tiap trade.</p>
      <p aria-live="polite" className="sr-only">{notice}</p>
      <Dialog open={dialog === "path"} onClose={() => setDialog(null)} title="Contoh jalur win/loss" wide>
        {dialog === "path" ? <SamplePath steps={result.sample} /> : null}
      </Dialog>
      <Dialog open={dialog === "save"} onClose={() => setDialog(null)} title="Simpan skenario">
        {dialog === "save" ? <form className="space-y-3" onSubmit={saveScenario}>
          <Field label="Nama skenario" htmlFor="exploration-scenario-name">
            <Input id="exploration-scenario-name" name="name" required minLength={2} maxLength={80} />
          </Field>
          <p className="text-xs text-muted">Asumsi skenario tersimpan di browser ini.</p>
          {storageError ? <p role="alert" className="text-xs text-loss">{storageError}</p> : null}
          <Button type="submit">Simpan</Button>
        </form> : null}
      </Dialog>
      <Dialog open={dialog === "scenarios"} onClose={() => setDialog(null)} title="Skenario Monte Carlo">
        {dialog === "scenarios" ? <div className="space-y-2">
          {storageError ? <p role="alert" className="text-xs text-loss">{storageError}</p> : null}
          {!saved.length && !storageError ? <p className="text-sm text-muted">Belum ada skenario di browser ini.</p> : null}
          <ul className="space-y-2">
            {saved.map(({ id, name, input }) => (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-line p-2">
                <div className="min-w-0">
                  <p className="break-words text-sm font-semibold">{name}</p>
                  <p className="text-xs text-muted">{input.trades} trade · {formatTarget(input.winRate)}% peluang menang</p>
                </div>
                <div className="flex gap-1">
                  <Button size="sm" variant="secondary" aria-label={"Gunakan " + name}
                    onClick={() => { update(toForm(input)); setDialog(null); }}>Gunakan</Button>
                  <Button size="sm" variant="ghost" aria-label={"Hapus " + name} onClick={() => deleteScenario(id)}>Hapus</Button>
                </div>
              </li>
            ))}
          </ul>
        </div> : null}
      </Dialog>
    </section>
  );
}

function SamplePath({ steps }: { steps: ExplorationTrade[] }) {
  const [offset, setOffset] = useState(0);
  const pageSize = 8;
  const wins = steps.filter(({ win }) => win).length;
  const visible = steps.slice(offset, offset + pageSize);
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted">{wins} win · {steps.length - wins} loss</p>
      <TableWrap>
        <Table>
          <THead><TR>{["Trade", "Hasil", "Saldo awal", "Laba/rugi bersih", "Ditarik", "Saldo akhir"].map((heading) => <TH key={heading}>{heading}</TH>)}</TR></THead>
          <TBody>
            {visible.map(({ trade, win, opening, profit, taken, closing }) => (
              <TR key={trade}>
                <TD>{trade}</TD><TD className={win ? "text-primary" : "text-loss"}>{win ? "Win" : "Loss"}</TD>
                {[opening, profit, taken, closing].map((value, index) => (
                  <TD key={index} className="tnum whitespace-nowrap">{formatExplorationBalance(value)}</TD>
                ))}
              </TR>
            ))}
          </TBody>
        </Table>
      </TableWrap>
      {steps.length > pageSize ? <div className="flex flex-wrap items-center justify-between gap-2">
        <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(offset - pageSize)}>Sebelumnya</Button>
        <span className="text-xs text-muted">Trade {offset + 1}–{Math.min(offset + pageSize, steps.length)} dari {steps.length}</span>
        <Button size="sm" variant="secondary" disabled={offset + pageSize >= steps.length} onClick={() => setOffset(offset + pageSize)}>Berikutnya</Button>
      </div> : null}
    </div>
  );
}
