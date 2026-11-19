"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

const PRE_CHECKS = [
  "Sesuai rencana trading",
  "SL sudah ditentukan",
  "R:R minimal 1:2",
  "Tidak trading berita penting",
  "Kondisi psikologi stabil",
];

export function NewTradeForm({
  accounts,
  strategies,
  instruments,
}: {
  accounts: { id: string; name: string }[];
  strategies: { id: string; name: string }[];
  instruments: { id: string; symbol: string; pricePrecision: number }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const preChecklist: Record<string, boolean> = {};
    for (const c of PRE_CHECKS) preChecklist[c] = fd.get(`pre_${c}`) === "on";
    try {
      const entryAt = String(fd.get("entryAt") ?? "");
      const res = await fetch("/api/trades", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: fd.get("accountId"),
          instrumentId: fd.get("instrumentId"),
          direction: fd.get("direction"),
          lot: fd.get("lot"),
          entryPrice: fd.get("entryPrice"),
          entryAt: (entryAt ? new Date(entryAt) : new Date()).toISOString(),
          initialStopLoss: fd.get("initialStopLoss") || undefined,
          initialTakeProfit: fd.get("initialTakeProfit") || undefined,
          strategyId: fd.get("strategyId") || undefined,
          session: fd.get("session") || undefined,
          timeframe: fd.get("timeframe") || undefined,
          ticket: fd.get("ticket") || undefined,
          commission: fd.get("commission") || 0,
          marketContext: fd.get("marketContext") || undefined,
          entryReason: fd.get("entryReason") || undefined,
          preChecklist,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menyimpan trade");
        return;
      }
      router.push(`/journal/${body.data.id}`);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Detail Posisi</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Akun" htmlFor="t-account">
              <Select id="t-account" name="accountId" required defaultValue={accounts[0]?.id ?? ""}>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </Select>
            </Field>
            <Field label="Instrumen" htmlFor="t-instrument">
              <Select id="t-instrument" name="instrumentId" required defaultValue={instruments.find((i) => i.symbol === "XAUUSD")?.id ?? instruments[0]?.id}>
                {instruments.map((i) => (
                  <option key={i.id} value={i.id}>{i.symbol}</option>
                ))}
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Arah" htmlFor="t-direction">
              <Select id="t-direction" name="direction" required defaultValue="LONG">
                <option value="LONG">Buy (Long)</option>
                <option value="SHORT">Sell (Short)</option>
              </Select>
            </Field>
            <Field label="Lot" htmlFor="t-lot">
              <Input id="t-lot" name="lot" type="number" step="0.00000001" min="0.00000001" required placeholder="0.10" />
            </Field>
            <Field label="Ticket (ops.)" htmlFor="t-ticket">
              <Input id="t-ticket" name="ticket" placeholder="100123" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Harga Entry" htmlFor="t-entry">
              <Input id="t-entry" name="entryPrice" type="number" step="0.000001" min="0.000001" required placeholder="2025.40" />
            </Field>
            <Field label="Waktu Entry" htmlFor="t-entryat" hint="Kosongkan = sekarang">
              <Input id="t-entryat" name="entryAt" type="datetime-local" />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Stop Loss Awal" htmlFor="t-sl">
              <Input id="t-sl" name="initialStopLoss" type="number" step="0.000001" min="0.000001" placeholder="2020.00" />
            </Field>
            <Field label="Take Profit Awal" htmlFor="t-tp">
              <Input id="t-tp" name="initialTakeProfit" type="number" step="0.000001" min="0.000001" placeholder="2045.00" />
            </Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Sesi" htmlFor="t-session">
              <Select id="t-session" name="session" defaultValue="">
                <option value="">—</option>
                <option value="asian">Asia</option>
                <option value="london">London</option>
                <option value="newyork">New York</option>
              </Select>
            </Field>
            <Field label="Timeframe" htmlFor="t-tf">
              <Input id="t-tf" name="timeframe" placeholder="M15 / H1" maxLength={10} />
            </Field>
            <Field label="Komisi (USD)" htmlFor="t-comm">
              <Input id="t-comm" name="commission" type="number" step="0.01" min="0" defaultValue={0} />
            </Field>
          </div>
          <Field label="Strategi / Setup" htmlFor="t-strategy">
            <Select id="t-strategy" name="strategyId" defaultValue="">
              <option value="">Tanpa strategi</option>
              {strategies.map((s) => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </Select>
          </Field>
        </CardContent>
      </Card>

      <div className="flex flex-col gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Konteks & Alasan Entry</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Field label="Konteks Market" htmlFor="t-context">
              <Textarea id="t-context" name="marketContext" rows={2} placeholder="Kondisi harga, news, struktur chart…" />
            </Field>
            <Field label="Alasan Entry" htmlFor="t-reason">
              <Textarea id="t-reason" name="entryReason" rows={2} placeholder="Kenapa posisi ini diambil?" />
            </Field>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Checklist Pra-Trade</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            {PRE_CHECKS.map((c) => (
              <label key={c} className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2 text-xs text-muted hover:border-line">
                <input type="checkbox" name={`pre_${c}`} className="h-4 w-4 accent-[#22e69a]" />
                {c}
              </label>
            ))}
          </CardContent>
        </Card>

        {error ? (
          <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>
        ) : null}
        <div className="flex justify-end gap-2">
          <Button variant="secondary" type="button" onClick={() => router.back()}>Batal</Button>
          <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Trade"}</Button>
        </div>
      </div>
    </form>
  );
}
