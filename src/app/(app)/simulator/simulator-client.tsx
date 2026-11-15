"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { CalendarClock, Play, Repeat, Save, Trash2, TrendingUp } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { fmtNum, fmtUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface RunResult {
  cyclesCount: number;
  reached: boolean;
  targetNotReached: boolean;
  finalBalance: string;
  totalWd: string;
  totalProfit: string;
  series: { cycle: number; opening: number; closing: number; wd: number }[];
  firstCycles: {
    cycle: number;
    opening: string;
    profit: string;
    wd: string;
    closing: string;
  }[];
  lastCycle: { cycle: number; opening: string; profit: string; wd: string; closing: string } | null;
}

export function SimulatorClient({
  defaults,
  saved,
}: {
  defaults: {
    initialCapital: number;
    targetAmount: number;
    returnPerCycle: number;
    frequency: "DAILY" | "WEEKLY" | "MONTHLY";
    wdMode: "NONE" | "FIXED" | "DYNAMIC";
    wdRatio: number;
  };
  saved: { id: string; name: string; returnPerCycle: number; wdMode: string; wdRatio: number | null }[];
}) {
  const router = useRouter();
  const [form, setForm] = useState({
    name: "Rencana Utama",
    initialCapital: defaults.initialCapital,
    targetAmount: defaults.targetAmount,
    returnPerCycle: defaults.returnPerCycle,
    frequency: defaults.frequency,
    wdMode: defaults.wdMode,
    wdRatio: defaults.wdRatio,
    costPerCycle: 0,
  });
  const [result, setResult] = useState<RunResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const freqLabel = form.frequency === "WEEKLY" ? "minggu" : form.frequency === "MONTHLY" ? "bulan" : "hari";

  async function run() {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/simulator/run", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          initialCapital: form.initialCapital,
          targetAmount: form.targetAmount,
          returnPerCycle: form.returnPerCycle,
          frequency: form.frequency,
          wdMode: form.wdMode,
          wdRatio: form.wdMode === "DYNAMIC" ? form.wdRatio : undefined,
          costPerCycle: form.costPerCycle,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Simulasi gagal");
        return;
      }
      setResult(body.data);
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  async function save() {
    setError(null);
    const res = await fetch("/api/scenarios", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: form.name,
        initialCapital: form.initialCapital,
        targetAmount: form.targetAmount,
        returnPerCycle: form.returnPerCycle,
        frequency: form.frequency,
        wdMode: form.wdMode,
        wdRatio: form.wdMode === "DYNAMIC" ? form.wdRatio : undefined,
        costPerCycle: form.costPerCycle,
      }),
    });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Gagal menyimpan skenario");
      return;
    }
    router.refresh();
  }

  async function remove(id: string) {
    await fetch(`/api/scenarios/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const years = result ? result.cyclesCount / (form.frequency === "WEEKLY" ? 52 : form.frequency === "MONTHLY" ? 12 : 365) : null;

  return (
    <>
      {/* Parameter form */}
      <Card>
        <CardContent className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5">
          <Field label="Target (USD)" htmlFor="sim-target">
            <Input id="sim-target" type="number" min="1" value={form.targetAmount}
              onChange={(e) => setForm({ ...form, targetAmount: Number(e.target.value) })} />
          </Field>
          <Field label="Modal Awal (USD)" htmlFor="sim-capital">
            <Input id="sim-capital" type="number" min="1" value={form.initialCapital}
              onChange={(e) => setForm({ ...form, initialCapital: Number(e.target.value) })} />
          </Field>
          <Field label="Return / Siklus (%)" htmlFor="sim-return" hint="Ilustratif — bukan janji hasil">
            <Input id="sim-return" type="number" step="0.01" value={form.returnPerCycle}
              onChange={(e) => setForm({ ...form, returnPerCycle: Number(e.target.value) })} />
          </Field>
          <Field label="Frekuensi" htmlFor="sim-freq">
            <Select id="sim-freq" value={form.frequency}
              onChange={(e) => setForm({ ...form, frequency: e.target.value as typeof form.frequency })}>
              <option value="DAILY">Harian</option>
              <option value="WEEKLY">Mingguan</option>
              <option value="MONTHLY">Bulanan</option>
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
          {form.wdMode === "DYNAMIC" ? (
            <Field label="Cap WD (% dari profit)" htmlFor="sim-ratio">
              <Input id="sim-ratio" type="number" min="0" max="100" value={form.wdRatio}
                onChange={(e) => setForm({ ...form, wdRatio: Number(e.target.value) })} />
            </Field>
          ) : null}
          <Field label="Biaya / Siklus (USD)" htmlFor="sim-cost">
            <Input id="sim-cost" type="number" min="0" step="0.01" value={form.costPerCycle}
              onChange={(e) => setForm({ ...form, costPerCycle: Number(e.target.value) })} />
          </Field>
          <Field label="Nama Skenario" htmlFor="sim-name">
            <Input id="sim-name" value={form.name} maxLength={80}
              onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <div className="flex items-end gap-2 sm:col-span-2 lg:col-span-2">
            <Button onClick={run} disabled={loading}>
              <Play className="h-4 w-4" aria-hidden /> {loading ? "Menghitung…" : "Simulasikan"}
            </Button>
            <Button variant="purple" onClick={save}>
              <Save className="h-4 w-4" aria-hidden /> Simpan Skenario
            </Button>
          </div>
        </CardContent>
      </Card>

      {error ? <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p> : null}

      {result ? (
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
                      {result.reached
                        ? `± ${result.cyclesCount} ${freqLabel} (± ${years?.toFixed(1)} tahun)`
                        : `Target belum tercapai dalam ${result.cyclesCount} ${freqLabel}`}
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
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={result.series} margin={{ top: 10, right: 8, bottom: 0, left: 0 }}>
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
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Detail table */}
          <TableWrap>
            <Table>
              <THead>
                <TR><TH>Siklus</TH><TH className="text-right">Opening</TH><TH className="text-right">Profit</TH><TH className="text-right">WD</TH><TH className="text-right">Closing</TH></TR>
              </THead>
              <TBody>
                {result.firstCycles.length === 0 ? (
                  <EmptyRow colSpan={5}>Target sudah tercapai sejak awal — tidak ada siklus tambahan.</EmptyRow>
                ) : (
                  result.firstCycles.map((c) => (
                    <TR key={c.cycle}>
                      <TD className="tnum text-xs">{c.cycle}</TD>
                      <TD className="tnum text-right text-xs">{fmtUSD(c.opening)}</TD>
                      <TD className={cn("tnum text-right text-xs", Number(c.profit) >= 0 ? "text-primary" : "text-loss")}>{fmtUSD(c.profit)}</TD>
                      <TD className="tnum text-right text-xs">{fmtUSD(c.wd)}</TD>
                      <TD className="tnum text-right text-xs font-semibold">{fmtUSD(c.closing)}</TD>
                    </TR>
                  ))
                )}
                {result.lastCycle && result.cyclesCount > 12 ? (
                  <TR className="bg-primary/5">
                    <TD className="tnum text-xs font-bold">{result.lastCycle.cycle}</TD>
                    <TD className="tnum text-right text-xs">{fmtUSD(result.lastCycle.opening)}</TD>
                    <TD className="tnum text-right text-xs">{fmtUSD(result.lastCycle.profit)}</TD>
                    <TD className="tnum text-right text-xs">{fmtUSD(result.lastCycle.wd)}</TD>
                    <TD className="tnum text-right text-xs font-bold text-primary">{fmtUSD(result.lastCycle.closing)}</TD>
                  </TR>
                ) : null}
              </TBody>
            </Table>
          </TableWrap>
        </>
      ) : null}

      {/* Saved scenarios */}
      <div>
        <h2 className="mb-2 text-sm font-semibold">Skenario Tersimpan</h2>
        <TableWrap>
          <Table>
            <THead><TR><TH>Nama</TH><TH className="text-right">Return</TH><TH>Mode WD</TH><TH /></TR></THead>
            <TBody>
              {saved.length === 0 ? (
                <EmptyRow colSpan={3}>Belum ada skenario tersimpan.</EmptyRow>
              ) : (
                saved.map((s) => (
                  <TR key={s.id}>
                    <TD className="text-xs font-medium">{s.name}</TD>
                    <TD className="tnum text-right text-xs">{fmtNum(s.returnPerCycle, 2)}%</TD>
                    <TD className="text-xs text-muted">{s.wdMode === "DYNAMIC" ? `Dinamis ${s.wdRatio ?? "—"}%` : s.wdMode === "FIXED" ? "Tetap" : "Tanpa WD"}</TD>
                    <TD className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => remove(s.id)} aria-label={`Hapus ${s.name}`}>
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
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
