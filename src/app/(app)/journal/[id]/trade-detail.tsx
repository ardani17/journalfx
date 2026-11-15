"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Camera, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { fmtDateID } from "@/lib/dates";
import { cn } from "@/lib/utils";

interface Exec {
  id: string;
  kind: string;
  quantity: number;
  price: number;
  commission: number;
  swap: number;
  fees: number;
  realizedPnl: number | null;
  executedAt: string;
}

export interface TradeDTO {
  id: string;
  status: string;
  direction: "LONG" | "SHORT";
  symbol: string;
  pricePrecision: number;
  lot: number;
  entryPrice: number;
  exitPrice: number | null;
  initialStopLoss: number | null;
  initialTakeProfit: number | null;
  initialRisk: number | null;
  plannedRR: number | null;
  actualR: number | null;
  realizedPnl: number | null;
  commission: number;
  swap: number;
  fees: number;
  session: string | null;
  timeframe: string | null;
  strategy: string | null;
  entryAt: string;
  exitAt: string | null;
  executions: Exec[];
  journal: {
    marketContext: string | null;
    entryReason: string | null;
    exitReason: string | null;
    emotionBefore: string | null;
    emotionDuring: string | null;
    emotionAfter: string | null;
    confidence: number | null;
    stressLevel: number | null;
    fomo: boolean;
    revenge: boolean;
    overtrading: boolean;
    compliant: boolean | null;
    mistakes: string[];
    lessons: string | null;
    improvement: string | null;
    tags: string[];
    preChecklist: Record<string, boolean> | null;
    postChecklist: Record<string, boolean> | null;
  } | null;
  attachments: { id: string; kind: string; fileName: string; createdAt: string }[];
}

const MISTAKE_OPTIONS = [
  "Entry dini", "Terlambat entry", "SL digeser", "Tanpa SL", "Overlot",
  "Cut profit dini", "Hold terlalu lama", "Balas dendam", "FOMO", "Impulsif",
];

const POST_CHECKS = ["Sesuai plan", "SL disiplin", "Manajemen emosi baik", "Eksekusi sesuai checklist"];

export function TradeDetail({ trade }: { trade: TradeDTO }) {
  const router = useRouter();
  const [tab, setTab] = useState("ringkasan");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const openQty =
    trade.executions
      .filter((e) => e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY")
      .reduce((s, e) => s + e.quantity, 0) -
    trade.executions
      .filter((e) => e.kind === "CLOSE" || e.kind === "PARTIAL_CLOSE")
      .reduce((s, e) => s + e.quantity, 0);
  const canClose = openQty > 0.0000001 && trade.status !== "CANCELLED";

  async function addClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const qty = Number(fd.get("quantity"));
    const kind = qty >= openQty - 1e-9 ? "CLOSE" : "PARTIAL_CLOSE";
    try {
      const res = await fetch(`/api/trades/${trade.id}/executions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          quantity: qty,
          price: fd.get("price"),
          commission: fd.get("commission") || 0,
          swap: fd.get("swap") || 0,
          executedAt: fd.get("executedAt") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menutup posisi");
        return;
      }
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  async function cancelTrade() {
    const reason = window.prompt("Alasan pembatalan trade:");
    if (!reason || reason.trim().length < 3) return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(`/api/trades/${trade.id}`, {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal membatalkan");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function saveJournal(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const post: Record<string, boolean> = {};
    for (const c of POST_CHECKS) post[c] = fd.get(`post_${c}`) === "on";
    const payload: Record<string, unknown> = {
      marketContext: fd.get("marketContext") || undefined,
      entryReason: fd.get("entryReason") || undefined,
      exitReason: fd.get("exitReason") || undefined,
      emotionBefore: fd.get("emotionBefore") || undefined,
      emotionDuring: fd.get("emotionDuring") || undefined,
      emotionAfter: fd.get("emotionAfter") || undefined,
      confidence: fd.get("confidence") || undefined,
      stressLevel: fd.get("stressLevel") || undefined,
      fomo: fd.get("fomo") === "on",
      revenge: fd.get("revenge") === "on",
      overtrading: fd.get("overtrading") === "on",
      compliant: fd.get("compliant") === null ? undefined : fd.get("compliant") === "on",
      mistakes: MISTAKE_OPTIONS.filter((m) => fd.get(`mistake_${m}`) === "on"),
      lessons: fd.get("lessons") || undefined,
      improvement: fd.get("improvement") || undefined,
      tags: String(fd.get("tags") ?? "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean),
      postChecklist: post,
    };
    try {
      const res = await fetch(`/api/trades/${trade.id}/journal`, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menyimpan jurnal");
        return;
      }
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function uploadScreenshot(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const kind = (e.target.dataset.kind ?? "ENTRY") as "BEFORE" | "ENTRY" | "DURING" | "EXIT";
    setError(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("kind", kind);
    const res = await fetch(`/api/trades/${trade.id}/attachments`, { method: "POST", body: fd });
    const body = await res.json();
    if (!res.ok || !body.ok) {
      setError(body.error ?? "Upload gagal");
      return;
    }
    e.target.value = "";
    router.refresh();
  }

  async function deleteAttachment(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  const j = trade.journal;

  return (
    <>
      {error ? (
        <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>
      ) : null}

      <Tabs
        items={[
          { value: "ringkasan", label: "Ringkasan" },
          { value: "eksekusi", label: `Eksekusi (${trade.executions.length})` },
          { value: "psikologi", label: "Psikologi & Jurnal" },
          { value: "screenshot", label: `Screenshot (${trade.attachments.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "ringkasan" && (
        <div className="grid gap-3 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Posisi</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Row label="Instrumen" value={trade.symbol} />
              <Row label="Arah" value={trade.direction === "LONG" ? "Buy" : "Sell"} />
              <Row label="Lot" value={fmtNum(trade.lot, 2)} />
              <Row label="Qty Terbuka" value={fmtNum(Math.max(openQty, 0), 2)} />
              <Row label="Entry" value={fmtNum(trade.entryPrice, trade.pricePrecision)} />
              <Row label="Exit" value={trade.exitPrice !== null ? fmtNum(trade.exitPrice, trade.pricePrecision) : "—"} />
              <Row label="SL Awal" value={trade.initialStopLoss !== null ? fmtNum(trade.initialStopLoss, trade.pricePrecision) : "—"} />
              <Row label="TP Awal" value={trade.initialTakeProfit !== null ? fmtNum(trade.initialTakeProfit, trade.pricePrecision) : "—"} />
              <Row label="Sesi / TF" value={[trade.session, trade.timeframe].filter(Boolean).join(" / ") || "—"} />
              <Row label="Strategi" value={trade.strategy ?? "—"} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Hasil & Risiko</CardTitle></CardHeader>
            <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
              <Row label="Risiko Awal" value={trade.initialRisk !== null ? fmtUSD(trade.initialRisk) : "—"} />
              <Row label="Planned R:R" value={trade.plannedRR !== null ? `1 : ${fmtNum(trade.plannedRR, 1)}` : "—"} />
              <Row label="Actual R" value={trade.actualR !== null ? `${fmtNum(trade.actualR, 2)}R` : "—"} />
              <Row
                label="P/L Realisasi"
                value={trade.realizedPnl !== null ? fmtUSDdelta(trade.realizedPnl) : "—"}
                tone={trade.realizedPnl !== null ? (trade.realizedPnl > 0 ? "pos" : trade.realizedPnl < 0 ? "neg" : undefined) : undefined}
              />
              <Row label="Komisi" value={fmtUSD(trade.commission)} />
              <Row label="Swap" value={fmtUSD(trade.swap)} />
              <Row label="Fee" value={fmtUSD(trade.fees)} />
              <Row label="Waktu Exit" value={trade.exitAt ? fmtDateID(trade.exitAt, "d MMM, HH:mm") : "—"} />
            </CardContent>
          </Card>

          {canClose ? (
            <Card className="lg:col-span-2">
              <CardHeader><CardTitle>Tutup Posisi (penuh / parsial)</CardTitle></CardHeader>
              <CardContent>
                <form onSubmit={addClose} className="flex flex-wrap items-end gap-3">
                  <Field label={`Quantity (maks ${fmtNum(openQty, 2)})`} htmlFor="c-qty" className="w-32">
                    <Input id="c-qty" name="quantity" type="number" step="0.01" min="0.01" max={openQty} required defaultValue={openQty.toFixed(2)} />
                  </Field>
                  <Field label="Harga Close" htmlFor="c-price" className="w-36">
                    <Input id="c-price" name="price" type="number" step="0.00001" min="0" required />
                  </Field>
                  <Field label="Komisi" htmlFor="c-comm" className="w-28">
                    <Input id="c-comm" name="commission" type="number" step="0.01" min="0" defaultValue={0} />
                  </Field>
                  <Field label="Swap" htmlFor="c-swap" className="w-28">
                    <Input id="c-swap" name="swap" type="number" step="0.01" min="0" defaultValue={0} />
                  </Field>
                  <Button type="submit" disabled={loading}>
                    <Check className="h-4 w-4" aria-hidden /> {loading ? "Memproses…" : "Tutup Posisi"}
                  </Button>
                  <Button variant="danger" type="button" onClick={cancelTrade} disabled={loading}>
                    <Undo2 className="h-4 w-4" aria-hidden /> Batalkan Trade
                  </Button>
                </form>
                <p className="mt-2 text-[11px] text-faint">
                  Tutup parsial otomatis mengenali P&L porsi tertutup saja dan mempostingnya ke ledger.
                </p>
              </CardContent>
            </Card>
          ) : null}
        </div>
      )}

      {tab === "eksekusi" && (
        <TableWrap>
          <Table>
            <THead>
              <TR>
                <TH>Waktu</TH><TH>Jenis</TH><TH className="text-right">Qty</TH>
                <TH className="text-right">Harga</TH><TH className="text-right">Komisi</TH>
                <TH className="text-right">P/L</TH>
              </TR>
            </THead>
            <TBody>
              {trade.executions.length === 0 ? (
                <EmptyRow colSpan={6}>Belum ada eksekusi</EmptyRow>
              ) : (
                trade.executions.map((e) => (
                  <TR key={e.id}>
                    <TD className="tnum text-xs">{fmtDateID(e.executedAt, "d MMM yyyy, HH:mm")}</TD>
                    <TD>
                      <Badge tone={e.kind.includes("ENTRY") ? "info" : e.kind.includes("PARTIAL") ? "warn" : "success"}>
                        {e.kind.replace("_", " ")}
                      </Badge>
                    </TD>
                    <TD className="tnum text-right text-xs">{fmtNum(e.quantity, 2)}</TD>
                    <TD className="tnum text-right text-xs">{fmtNum(e.price, trade.pricePrecision)}</TD>
                    <TD className="tnum text-right text-xs">{fmtUSD(e.commission)}</TD>
                    <TD className={cn("tnum text-right text-xs font-semibold", e.realizedPnl === null ? "text-faint" : e.realizedPnl >= 0 ? "text-primary" : "text-loss")}>
                      {e.realizedPnl === null ? "—" : fmtUSDdelta(e.realizedPnl)}
                    </TD>
                  </TR>
                ))
              )}
            </TBody>
          </Table>
        </TableWrap>
      )}

      {tab === "psikologi" && (
        <form onSubmit={saveJournal} className="grid gap-4 lg:grid-cols-2">
          <Card>
            <CardHeader><CardTitle>Konteks & Refleksi</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <Field label="Konteks Market" htmlFor="j-ctx">
                <Textarea id="j-ctx" name="marketContext" rows={2} defaultValue={j?.marketContext ?? ""} />
              </Field>
              <Field label="Alasan Entry" htmlFor="j-entry">
                <Textarea id="j-entry" name="entryReason" rows={2} defaultValue={j?.entryReason ?? ""} />
              </Field>
              <Field label="Alasan Exit" htmlFor="j-exit">
                <Textarea id="j-exit" name="exitReason" rows={2} defaultValue={j?.exitReason ?? ""} />
              </Field>
              <Field label="Pelajaran" htmlFor="j-lessons">
                <Textarea id="j-lessons" name="lessons" rows={2} defaultValue={j?.lessons ?? ""} />
              </Field>
              <Field label="Perbaikan Berikutnya" htmlFor="j-improve">
                <Textarea id="j-improve" name="improvement" rows={2} defaultValue={j?.improvement ?? ""} />
              </Field>
              <Field label="Tags (pisahkan koma)" htmlFor="j-tags">
                <Input id="j-tags" name="tags" defaultValue={(j?.tags ?? []).join(", ")} placeholder="breakout, sesi-london" />
              </Field>
            </CardContent>
          </Card>
          <Card>
            <CardHeader><CardTitle>Psikologi</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <div className="grid grid-cols-3 gap-3">
                <Field label="Emosi Sebelum" htmlFor="j-eb">
                  <Select id="j-eb" name="emotionBefore" defaultValue={j?.emotionBefore ?? ""}>
                    <option value="">—</option>
                    {["calm", "anxious", "excited", "fomo", "angry", "bored"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Emosi Saat" htmlFor="j-ed">
                  <Select id="j-ed" name="emotionDuring" defaultValue={j?.emotionDuring ?? ""}>
                    <option value="">—</option>
                    {["calm", "anxious", "excited", "fomo", "angry", "bored"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
                <Field label="Emosi Setelah" htmlFor="j-ea">
                  <Select id="j-ea" name="emotionAfter" defaultValue={j?.emotionAfter ?? ""}>
                    <option value="">—</option>
                    {["calm", "anxious", "excited", "satisfied", "regret", "frustrated"].map((x) => (
                      <option key={x} value={x}>{x}</option>
                    ))}
                  </Select>
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Confidence (1-5)" htmlFor="j-conf">
                  <Input id="j-conf" name="confidence" type="number" min="1" max="5" defaultValue={j?.confidence ?? ""} />
                </Field>
                <Field label="Stress (1-5)" htmlFor="j-stress">
                  <Input id="j-stress" name="stressLevel" type="number" min="1" max="5" defaultValue={j?.stressLevel ?? ""} />
                </Field>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <Check2 name="fomo" label="FOMO" def={j?.fomo} />
                <Check2 name="revenge" label="Revenge Trading" def={j?.revenge} />
                <Check2 name="overtrading" label="Overtrading" def={j?.overtrading} />
                <Check2 name="compliant" label="Patuh Plan" def={j?.compliant ?? undefined} />
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Kesalahan</p>
                <div className="flex flex-wrap gap-1.5">
                  {MISTAKE_OPTIONS.map((m) => (
                    <label key={m} className={cn(
                      "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                      j?.mistakes?.includes(m) ? "border-loss/50 bg-loss/10 text-loss" : "border-line text-muted hover:border-line",
                    )}>
                      <input type="checkbox" name={`mistake_${m}`} defaultChecked={j?.mistakes?.includes(m)} className="h-3 w-3 accent-[#f87171]" />
                      {m}
                    </label>
                  ))}
                </div>
              </div>
              <div>
                <p className="mb-1.5 text-xs font-medium text-muted">Checklist Post-Trade</p>
                <div className="space-y-1.5">
                  {POST_CHECKS.map((c) => (
                    <Check2 key={c} name={`post_${c}`} label={c} def={j?.postChecklist?.[c]} />
                  ))}
                </div>
              </div>
              <div className="flex justify-end">
                <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Jurnal"}</Button>
              </div>
            </CardContent>
          </Card>
        </form>
      )}

      {tab === "screenshot" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Camera className="h-4 w-4" aria-hidden /> Chart Screenshots (privat, hanya Anda)
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["BEFORE", "ENTRY", "DURING", "EXIT"] as const).map((k) => (
                <label key={k} className="cursor-pointer">
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-kind={k} onChange={uploadScreenshot} />
                  <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-panel-2 px-3 text-xs text-muted border border-line hover:border-primary/50 hover:text-primary">
                    <Plus className="h-3.5 w-3.5" aria-hidden /> {k}
                  </span>
                </label>
              ))}
            </div>
            {trade.attachments.length === 0 ? (
              <p className="py-8 text-center text-xs text-faint">
                Belum ada screenshot. Unggah chart sebelum/entry/saat/exit untuk dokumentasi visual.
              </p>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {trade.attachments.map((a) => (
                  <figure key={a.id} className="overflow-hidden rounded-xl border border-line">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={`/api/attachments/${a.id}`} alt={`Screenshot ${a.kind} — ${a.fileName}`} className="aspect-video w-full object-cover" loading="lazy" />
                    <figcaption className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-muted">
                      <span>{a.kind} · {fmtDateID(a.createdAt, "d MMM HH:mm")}</span>
                      <button onClick={() => deleteAttachment(a.id)} aria-label={`Hapus ${a.kind}`} className="text-faint hover:text-loss">
                        <Trash2 className="h-3.5 w-3.5" aria-hidden />
                      </button>
                    </figcaption>
                  </figure>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between gap-2 border-b border-line-soft py-1.5">
      <span className="text-faint">{label}</span>
      <span className={cn("tnum font-medium", tone === "pos" ? "text-primary" : tone === "neg" ? "text-loss" : "text-ink")}>{value}</span>
    </div>
  );
}

function Check2({ name, label, def }: { name: string; label: string; def?: boolean | null }) {
  return (
    <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2 text-xs text-muted hover:border-line">
      <input type="checkbox" name={name} defaultChecked={def === true} className="h-4 w-4 accent-[#22e69a]" />
      {label}
    </label>
  );
}
