"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { NewStrategyDialog, type StrategyOption } from "@/components/journal/new-strategy-dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";

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
  accounts: { id: string; name: string; currency: string }[];
  strategies: StrategyOption[];
  instruments: { id: string; symbol: string }[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [accountId, setAccountId] = useState("");
  const [instrumentOptions, setInstrumentOptions] = useState(instruments);
  const [instrumentId, setInstrumentId] = useState(instruments.find((item) => item.symbol === "XAUUSD")?.id ?? instruments[0]?.id ?? "");
  const [symbolOpen, setSymbolOpen] = useState(false);
  const [symbol, setSymbol] = useState("");
  const [symbolError, setSymbolError] = useState<string | null>(null);
  const [registering, setRegistering] = useState(false);
  const [strategyOptions, setStrategyOptions] = useState(strategies);
  const [strategyId, setStrategyId] = useState("");
  const [strategyOpen, setStrategyOpen] = useState(false);
  const account = accounts.find((item) => item.id === accountId) ?? accounts[0];

  async function addSymbol(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!symbol.trim()) {
      setSymbolError("Kode simbol wajib diisi");
      return;
    }

    setSymbolError(null);
    setRegistering(true);
    try {
      const response = await fetch("/api/instruments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ symbol }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setSymbolError(body.error ?? "Gagal menambah simbol");
        return;
      }
      const instrument: (typeof instruments)[number] = body.data;
      setInstrumentOptions((options) => [
        ...options.filter((item) => item.symbol !== instrument.symbol), instrument,
      ].sort((a, b) => a.symbol.localeCompare(b.symbol)));
      setInstrumentId(instrument.id);
      setSymbolOpen(false);
    } catch {
      setSymbolError("Tidak dapat menghubungi server");
    } finally {
      setRegistering(false);
    }
  }

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
        setError(body.error ?? "Gagal menyimpan transaksi");
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
    <>
      <form onSubmit={submit} className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Detail Posisi</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Akun" htmlFor="t-account">
                <Select id="t-account" name="accountId" required value={account?.id ?? ""} onChange={(event) => setAccountId(event.target.value)}>
                  {accounts.length === 0 && <option value="">Belum ada akun trading aktif</option>}
                  {accounts.map((a) => (
                    <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
                  ))}
                </Select>
                <Link
                  href="/accounts"
                  className="inline-flex h-8 items-center self-start rounded-lg px-3 text-xs text-primary transition-colors hover:bg-panel-2 hover:text-ink focus-visible:outline-2 focus-visible:outline-primary"
                >
                  Tambah akun
                </Link>
              </Field>
              <Field label="Instrumen" htmlFor="t-instrument">
                <Select id="t-instrument" name="instrumentId" required value={instrumentId} onChange={(event) => setInstrumentId(event.target.value)}>
                  {instrumentOptions.length === 0 ? <option value="">Daftar kosong</option> : null}
                  {instrumentOptions.map((item) => (
                    <option key={item.id} value={item.id}>{item.symbol}</option>
                  ))}
                </Select>
                <Button type="button" variant="ghost" size="sm" className="self-start text-primary" disabled={registering || loading} onClick={() => {
                  setSymbol("");
                  setSymbolError(null);
                  setSymbolOpen(true);
                }}>
                  Tambah simbol
                </Button>
              </Field>
            </div>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Arah" htmlFor="t-direction">
                <Select id="t-direction" name="direction" required defaultValue="LONG">
                  <option value="LONG">Beli</option>
                  <option value="SHORT">Jual</option>
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
              <Field label="Harga Pembukaan" htmlFor="t-entry">
                <Input id="t-entry" name="entryPrice" type="number" step="0.000001" min="0.000001" required placeholder="2025.40" />
              </Field>
              <Field label="Waktu Pembukaan" htmlFor="t-entryat" hint="Kosongkan = sekarang">
                <Input id="t-entryat" name="entryAt" type="datetime-local" />
              </Field>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Field label="SL Awal" htmlFor="t-sl">
                <Input id="t-sl" name="initialStopLoss" type="number" step="0.000001" min="0.000001" placeholder="2020.00" />
              </Field>
              <Field label="TP Awal" htmlFor="t-tp">
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
              <Field label="Kerangka Waktu" htmlFor="t-tf">
                <Input id="t-tf" name="timeframe" placeholder="M15 / H1" maxLength={10} />
              </Field>
              <Field label={`Komisi (${account?.currency ?? "USD"})`} htmlFor="t-comm">
                <Input id="t-comm" name="commission" type="number" step="0.01" min="0" defaultValue={0} />
              </Field>
            </div>
            <Field label="Strategi" htmlFor="t-strategy">
              <Select id="t-strategy" name="strategyId" value={strategyId} onChange={(event) => setStrategyId(event.target.value)}>
                <option value="">Tanpa strategi</option>
                {strategyOptions.map((s) => (
                  <option key={s.id} value={s.id}>{s.name}</option>
                ))}
              </Select>
              <Button type="button" variant="ghost" size="sm" className="self-start text-primary" aria-haspopup="dialog" disabled={loading} onClick={() => setStrategyOpen(true)}>
                Tambah strategi
              </Button>
            </Field>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-4">
          <Card>
            <CardHeader>
              <CardTitle>Konteks & Alasan Membuka Posisi</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <Field label="Konteks Pasar" htmlFor="t-context">
                <Textarea id="t-context" name="marketContext" rows={2} placeholder="Kondisi harga, berita, dan pola grafik…" />
              </Field>
              <Field label="Alasan Membuka Posisi" htmlFor="t-reason">
                <Textarea id="t-reason" name="entryReason" rows={2} placeholder="Kenapa posisi ini diambil?" />
              </Field>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Daftar Periksa Sebelum Transaksi</CardTitle>
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
            <Button type="submit" disabled={loading || accounts.length === 0}>{loading ? "Menyimpan…" : "Simpan Transaksi"}</Button>
          </div>
        </div>
      </form>
      <Dialog open={symbolOpen} onClose={() => setSymbolOpen(false)} title="Tambah simbol">
        <form onSubmit={addSymbol} className="space-y-3">
          <Field label="Kode simbol" htmlFor="t-symbol">
            <Input
              id="t-symbol"
              value={symbol}
              onChange={(event) => { setSymbol(event.target.value); setSymbolError(null); }}
              maxLength={64}
              placeholder="EURUSD"
              autoComplete="off"
              autoFocus
              aria-required="true"
              aria-invalid={Boolean(symbolError)}
              aria-describedby={symbolError ? "t-symbol-error" : undefined}
            />
            {symbolError ? <p id="t-symbol-error" className="text-xs text-loss" role="alert">{symbolError}</p> : null}
          </Field>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setSymbolOpen(false)}>Batal</Button>
            <Button type="submit" disabled={registering}>{registering ? "Menyimpan…" : "Simpan simbol"}</Button>
          </div>
        </form>
      </Dialog>
      {strategyOpen && (
        <NewStrategyDialog
          onClose={() => setStrategyOpen(false)}
          onCreated={(strategy) => {
            setStrategyOptions((options) => [...options, strategy]);
            setStrategyId(strategy.id);
          }}
        />
      )}
    </>
  );
}
