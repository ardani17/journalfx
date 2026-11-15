"use client";

import { useState } from "react";
import { Calculator, CheckCircle2, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { fmtNum, fmtUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface InstrumentOpt {
  symbol: string;
  contractSize: number;
  lotStep: number;
  lotMin: number;
  lotMax: number;
  pricePrecision: number;
}

interface CalcResult {
  riskAmount: string;
  slDistance: string;
  rawLots: string;
  lots: string;
  actualRisk: string;
  valid: boolean;
  reasons: string[];
  warnings: string[];
}

export function CalculatorClient({
  balance,
  defaultRiskPct,
  instruments,
}: {
  balance: number;
  defaultRiskPct: number;
  instruments: InstrumentOpt[];
}) {
  const [form, setForm] = useState({
    symbol: instruments.find((i) => i.symbol === "XAUUSD")?.symbol ?? instruments[0]?.symbol ?? "XAUUSD",
    balance,
    riskPct: defaultRiskPct,
    entry: "",
    stopLoss: "",
    costPerLot: 0,
  });
  const [result, setResult] = useState<CalcResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function calc(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/risk/position-size", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          symbol: form.symbol,
          balance: form.balance,
          riskPct: form.riskPct,
          entry: form.entry,
          stopLoss: form.stopLoss,
          costPerLot: form.costPerLot || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Perhitungan gagal");
        return;
      }
      setResult(body.data);
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  const inst = instruments.find((i) => i.symbol === form.symbol);

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Parameter</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={calc} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Instrumen" htmlFor="c-symbol">
                <Select id="c-symbol" value={form.symbol} onChange={(e) => setForm({ ...form, symbol: e.target.value })}>
                  {instruments.map((i) => (
                    <option key={i.symbol} value={i.symbol}>{i.symbol}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Balance (USD)" htmlFor="c-balance">
                <Input id="c-balance" type="number" step="0.01" min="1" value={form.balance}
                  onChange={(e) => setForm({ ...form, balance: Number(e.target.value) })} required />
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Risiko (%)" htmlFor="c-risk">
                <Input id="c-risk" type="number" step="0.01" min="0.01" max="100" value={form.riskPct}
                  onChange={(e) => setForm({ ...form, riskPct: Number(e.target.value) })} required />
              </Field>
              <Field label="Harga Entry" htmlFor="c-entry">
                <Input id="c-entry" type="number" step={inst ? Math.pow(10, -inst.pricePrecision) : "0.01"} min="0"
                  value={form.entry} onChange={(e) => setForm({ ...form, entry: e.target.value })} placeholder="2025.40" required />
              </Field>
              <Field label="Stop Loss" htmlFor="c-sl">
                <Input id="c-sl" type="number" step="0.01" min="0" value={form.stopLoss}
                  onChange={(e) => setForm({ ...form, stopLoss: e.target.value })} placeholder="2020.40" required />
              </Field>
            </div>
            <Field label="Biaya / Lot (USD)" htmlFor="c-cost" hint="Komisi + fee round-turn per 1 lot">
              <Input id="c-cost" type="number" step="0.01" min="0" value={form.costPerLot}
                onChange={(e) => setForm({ ...form, costPerLot: Number(e.target.value) })} />
            </Field>
            <Button type="submit" disabled={loading}>
              <Calculator className="h-4 w-4" aria-hidden /> {loading ? "Menghitung…" : "Hitung Lot"}
            </Button>
          </form>
        </CardContent>
      </Card>

      <Card className={cn(result && !result.valid && "border-loss/40", result && result.valid && "border-primary/40")}>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Hasil
            {result ? (
              result.valid ? (
                <Badge tone="success"><CheckCircle2 className="h-3 w-3" /> Valid</Badge>
              ) : (
                <Badge tone="danger"><XCircle className="h-3 w-3" /> Ditolak</Badge>
              )
            ) : null}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {!result ? (
            <p className="py-8 text-center text-xs text-faint">Isi parameter lalu hitung.</p>
          ) : (
            <>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Box label="Risiko Diizinkan" value={fmtUSD(result.riskAmount)} />
                <Box label="Jarak SL" value={fmtNum(Number(result.slDistance), inst?.pricePrecision ?? 2)} />
                <Box label="Lot (broker step)" value={fmtNum(Number(result.lots), 2)} strong />
                <Box label="Risiko Aktual" value={fmtUSD(result.actualRisk)} />
              </div>
              {result.reasons.length > 0 ? (
                <div className="rounded-lg border border-loss/30 bg-loss/10 p-2.5" role="alert">
                  {result.reasons.map((r) => (
                    <p key={r} className="text-xs font-medium text-loss">{r}</p>
                  ))}
                </div>
              ) : null}
              {result.warnings.length > 0 ? (
                <div className="rounded-lg border border-warn/30 bg-warn/10 p-2.5">
                  {result.warnings.map((w) => (
                    <p key={w} className="text-xs text-warn">⚠ {w}</p>
                  ))}
                </div>
              ) : null}
              <p className="text-[10px] leading-relaxed text-faint">
                Perhitungan hanya rekomendasi — tidak ada order yang dikirim ke broker. Validasi tick
                value, margin, dan kesegaran equity bersifat peringatan.
              </p>
            </>
          )}
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        </CardContent>
      </Card>
    </div>
  );
}

function Box({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2">
      <p className="text-[10px] text-faint">{label}</p>
      <p className={cn("tnum", strong ? "text-base font-bold text-primary" : "text-sm font-semibold text-ink")}>{value}</p>
    </div>
  );
}
