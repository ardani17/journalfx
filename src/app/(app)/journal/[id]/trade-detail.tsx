"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import type { AttachmentKind, ExecutionKind, TradeDirection, TradeStatus } from "@prisma/client";
import { Camera, Check, Plus, Trash2, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { Tabs } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { D, fmtDecimal, fmtNum, fmtTradingDelta, fmtTradingMoney, fmtUSD } from "@/lib/money";
import { fmtDateTimeID } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { attachmentKindLabel, executionKindLabel, tradeDirectionLabel, tradingSessionLabel } from "@/lib/trading-labels";

interface Exec {
  id: string;
  kind: ExecutionKind;
  quantity: string;
  price: string;
  commission: number;
  swap: number;
  fees: number;
  realizedPnl: number | null;
  executedAt: string;
}

export interface TradeDTO {
  id: string;
  status: TradeStatus;
  direction: TradeDirection;
  timezone: string;
  symbol: string;
  currency: string;
  pricePrecision: number;
  requiresReportedPnl: boolean;
  lot: string;
  entryPrice: string;
  exitPrice: string | null;
  initialStopLoss: string | null;
  initialTakeProfit: string | null;
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
  attachments: { id: string; kind: AttachmentKind; fileName: string; createdAt: string }[];
}

const MISTAKE_LABELS = {
  "Entry dini": "Masuk terlalu cepat",
  "Terlambat entry": "Masuk terlambat",
  "SL digeser": "SL digeser",
  "Tanpa SL": "Tanpa SL",
  Overlot: "Ukuran lot berlebihan",
  "Cut profit dini": "Ambil laba terlalu cepat",
  "Hold terlalu lama": "Menahan posisi terlalu lama",
  "Balas dendam": "Balas dendam",
  FOMO: "FOMO",
  Impulsif: "Impulsif",
};

const POST_CHECK_LABELS = {
  "Sesuai plan": "Sesuai rencana",
  "SL disiplin": "Disiplin mengikuti SL",
  "Manajemen emosi baik": "Emosi terkendali",
  "Eksekusi sesuai checklist": "Eksekusi sesuai daftar periksa",
};

const emotionLabels: Record<string, string> = {
  calm: "Tenang", anxious: "Cemas", excited: "Bersemangat", fomo: "Takut tertinggal (FOMO)",
  angry: "Marah", bored: "Bosan", satisfied: "Puas", regret: "Menyesal", frustrated: "Frustrasi",
};
const emotionsWhileTrading = ["calm", "anxious", "excited", "fomo", "angry", "bored"];
const emotionsAfterTrading = ["calm", "anxious", "excited", "satisfied", "regret", "frustrated"];

function EmotionOptions({ options, value }: { options: string[]; value?: string | null }) {
  const available = value && !options.includes(value) ? [...options, value] : options;
  return (
    <>
      <option value="">Belum dicatat</option>
      {available.map((key) => <option key={key} value={key}>{Object.hasOwn(emotionLabels, key) ? emotionLabels[key] : "Pilihan tersimpan"}</option>)}
    </>
  );
}

export function TradeDetail({ trade }: { trade: TradeDTO }) {
  const [tab, setTab] = useState("ringkasan");

  const openQty = trade.executions.reduce((qty, e) =>
    e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY" ? qty.plus(e.quantity) : qty.minus(e.quantity), D(0));

  const { error, loading, addClose, cancelTrade, saveJournal, uploadScreenshot, deleteAttachment } = useTradeActions(trade, openQty);

  return (
    <>
      {error ? (
        <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p>
      ) : null}

      <Tabs
        items={[
          { value: "ringkasan", label: "Ringkasan" },
          { value: "eksekusi", label: `Eksekusi (${trade.executions.length})` },
          { value: "psikologi", label: "Psikologi dan Jurnal" },
          { value: "screenshot", label: `Lampiran (${trade.attachments.length})` },
        ]}
        value={tab}
        onChange={setTab}
      />

      {tab === "ringkasan" ? <TradeSummary trade={trade} openQty={openQty} loading={loading} addClose={addClose} cancelTrade={cancelTrade} /> : null}

      {tab === "eksekusi" ? <ExecutionTable trade={trade} /> : null}

      {tab === "psikologi" ? <JournalForm journal={trade.journal} loading={loading} saveJournal={saveJournal} /> : null}

      {tab === "screenshot" ? <TradeScreenshots attachments={trade.attachments} timezone={trade.timezone} uploadScreenshot={uploadScreenshot} deleteAttachment={deleteAttachment} /> : null}
    </>
  );
}

type TradeActions = ReturnType<typeof useTradeActions>;

function useTradeActions(trade: TradeDTO, openQty: ReturnType<typeof D>) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function addClose(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const qty = D(String(fd.get("quantity")));
      const kind = qty.eq(openQty) ? "CLOSE" : "PARTIAL_CLOSE";
      const executedAt = String(fd.get("executedAt") ?? "");
      const res = await fetch(`/api/trades/${trade.id}/executions`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          kind,
          quantity: qty.toString(),
          price: fd.get("price"),
          commission: fd.get("commission") || 0,
          swap: fd.get("swap") || 0,
          executedAt: executedAt ? new Date(executedAt).toISOString() : undefined,
          reportedNetPnl: trade.requiresReportedPnl ? fd.get("reportedNetPnl") : undefined,
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
    const reason = window.prompt("Alasan pembatalan transaksi:");
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
    const compliance = fd.get("compliant");
    const post = { ...trade.journal?.postChecklist };
    for (const key of Object.keys(POST_CHECK_LABELS)) post[key] = fd.get(`post_${key}`) === "on";
    const savedMistakes = trade.journal?.mistakes.filter((key) => !Object.hasOwn(MISTAKE_LABELS, key)) ?? [];
    const payload: Record<string, unknown> = {
      marketContext: fd.get("marketContext") || null,
      entryReason: fd.get("entryReason") || null,
      exitReason: fd.get("exitReason") || null,
      emotionBefore: fd.get("emotionBefore") || null,
      emotionDuring: fd.get("emotionDuring") || null,
      emotionAfter: fd.get("emotionAfter") || null,
      confidence: fd.get("confidence") || null,
      stressLevel: fd.get("stressLevel") || null,
      fomo: fd.get("fomo") === "on",
      revenge: fd.get("revenge") === "on",
      overtrading: fd.get("overtrading") === "on",
      compliant: compliance ? compliance === "true" : null,
      mistakes: [...savedMistakes, ...Object.keys(MISTAKE_LABELS).filter((key) => fd.get(`mistake_${key}`) === "on")],
      lessons: fd.get("lessons") || null,
      improvement: fd.get("improvement") || null,
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
      setError(body.error ?? "Tangkapan layar gagal diunggah.");
      return;
    }
    e.target.value = "";
    router.refresh();
  }

  async function deleteAttachment(id: string) {
    await fetch(`/api/attachments/${id}`, { method: "DELETE" });
    router.refresh();
  }

  return { error, loading, addClose, cancelTrade, saveJournal, uploadScreenshot, deleteAttachment };
}

function TradeSummary({ trade, openQty, loading, addClose, cancelTrade }: {
  trade: TradeDTO;
  openQty: ReturnType<typeof D>;
  loading: boolean;
  addClose: TradeActions["addClose"];
  cancelTrade: TradeActions["cancelTrade"];
}) {
  const canClose = openQty.gt(0) && trade.status !== "CANCELLED";
  const session = trade.session && (Object.hasOwn(tradingSessionLabel, trade.session) ? tradingSessionLabel[trade.session] : trade.session);
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Posisi</CardTitle></CardHeader>
        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
          <Row label="Instrumen" value={trade.symbol} />
          <Row label="Arah" value={tradeDirectionLabel[trade.direction]} />
          <Row label="Lot" value={fmtDecimal(trade.lot)} />
          <Row label="Jumlah Terbuka" value={fmtDecimal(openQty.gt(0) ? openQty : 0)} />
          <Row label="Pembukaan" value={fmtDecimal(trade.entryPrice, trade.pricePrecision)} />
          <Row label="Penutupan" value={trade.exitPrice !== null ? fmtDecimal(trade.exitPrice, trade.pricePrecision) : "—"} />
          <Row label="SL Awal" value={trade.initialStopLoss !== null ? fmtDecimal(trade.initialStopLoss, trade.pricePrecision) : "—"} />
          <Row label="TP Awal" value={trade.initialTakeProfit !== null ? fmtDecimal(trade.initialTakeProfit, trade.pricePrecision) : "—"} />
          <Row label="Sesi / Kerangka Waktu" value={[session, trade.timeframe].filter(Boolean).join(" / ") || "—"} />
          <Row label="Strategi" value={trade.strategy ?? "—"} />
        </CardContent>
      </Card>
      <TradeOutcome trade={trade} />

      {canClose ? (
        <Card className="lg:col-span-2">
          <CardHeader><CardTitle>Tutup Posisi (penuh / parsial)</CardTitle></CardHeader>
          <CardContent>
            <form onSubmit={addClose} className="flex flex-wrap items-end gap-3">
              <Field label={`Jumlah (maks ${fmtDecimal(openQty)})`} htmlFor="c-qty" className="w-32">
                <Input id="c-qty" name="quantity" type="number" step="0.00000001" min="0.00000001" max={openQty.toString()} required defaultValue={openQty.toString()} />
              </Field>
              <Field label="Harga Penutupan" htmlFor="c-price" className="w-36">
                <Input id="c-price" name="price" type="number" step="0.000001" min="0.000001" required />
              </Field>
              {trade.requiresReportedPnl && (
                <Field label={`P&L bersih broker (${trade.currency})`} htmlFor="c-net-pnl" hint="Termasuk komisi, swap, dan biaya">
                  <Input id="c-net-pnl" name="reportedNetPnl" type="number" step="0.01" required />
                </Field>
              )}
              <Field label={`Komisi (${trade.currency})`} htmlFor="c-comm" className="w-28">
                <Input id="c-comm" name="commission" type="number" step="0.01" min="0" defaultValue={0} />
              </Field>
              <Field label={`Swap (${trade.currency})`} htmlFor="c-swap" className="w-28">
                <Input id="c-swap" name="swap" type="number" step="0.01" defaultValue={0} />
              </Field>
              <Button type="submit" disabled={loading}>
                <Check className="h-4 w-4" aria-hidden /> {loading ? "Memproses…" : "Tutup Posisi"}
              </Button>
              <Button variant="danger" type="button" onClick={cancelTrade} disabled={loading}>
                <Undo2 className="h-4 w-4" aria-hidden /> Batalkan Transaksi
              </Button>
            </form>
            <p className="mt-2 text-[11px] text-faint">
              Penutupan sebagian mencatat laba atau rugi untuk bagian posisi yang ditutup.
            </p>
          </CardContent>
        </Card>
      ) : null}
    </div>
  );
}

function TradeOutcome({ trade }: { trade: TradeDTO }) {
  return (
    <Card>
      <CardHeader><CardTitle>Hasil & Risiko</CardTitle></CardHeader>
      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs">
        <Row label="Risiko Awal" value={trade.initialRisk !== null ? fmtUSD(trade.initialRisk) : "—"} />
        <Row label="R:R Rencana" value={trade.plannedRR !== null ? `1 : ${fmtNum(trade.plannedRR, 1)}` : "—"} />
        <Row label="R Aktual" value={trade.actualR !== null ? `${fmtNum(trade.actualR, 2)}R` : "—"} />
        <Row
          label="P&L Terealisasi"
          value={trade.realizedPnl !== null ? fmtTradingDelta(trade.realizedPnl, trade.currency) : "—"}
          tone={trade.realizedPnl !== null ? (trade.realizedPnl > 0 ? "pos" : trade.realizedPnl < 0 ? "neg" : undefined) : undefined}
        />
        <Row label="Komisi" value={fmtTradingMoney(trade.commission, trade.currency)} />
        <Row label="Swap" value={fmtTradingMoney(trade.swap, trade.currency)} />
        <Row label="Biaya" value={fmtTradingMoney(trade.fees, trade.currency)} />
        <Row label="Waktu Penutupan" value={trade.exitAt ? fmtDateTimeID(trade.exitAt, trade.timezone) : "—"} />
      </CardContent>
    </Card>
  );
}

function ExecutionTable({ trade }: { trade: TradeDTO }) {
  return (
    <TableWrap>
      <Table>
        <THead>
          <TR>
            <TH>Waktu</TH><TH>Jenis</TH><TH className="text-right">Jumlah</TH>
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
                <TD className="tnum text-xs">{fmtDateTimeID(e.executedAt, trade.timezone)}</TD>
                <TD>
                  <Badge tone={e.kind.includes("ENTRY") ? "info" : e.kind.includes("PARTIAL") ? "warn" : "success"}>
                    {executionKindLabel[e.kind]}
                  </Badge>
                </TD>
                <TD className="tnum text-right text-xs">{fmtDecimal(e.quantity)}</TD>
                <TD className="tnum text-right text-xs">{fmtDecimal(e.price, trade.pricePrecision)}</TD>
                <TD className="tnum text-right text-xs">{fmtTradingMoney(e.commission, trade.currency)}</TD>
                <TD className={cn("tnum text-right text-xs font-semibold", e.realizedPnl === null ? "text-faint" : e.realizedPnl >= 0 ? "text-primary" : "text-loss")}>
                  {e.realizedPnl === null ? "—" : fmtTradingDelta(e.realizedPnl, trade.currency)}
                </TD>
              </TR>
            ))
          )}
        </TBody>
      </Table>
    </TableWrap>
  );
}

function JournalForm({ journal: j, loading, saveJournal }: {
  journal: TradeDTO["journal"];
  loading: boolean;
  saveJournal: TradeActions["saveJournal"];
}) {
  return (
    <form onSubmit={saveJournal} className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader><CardTitle>Konteks dan Refleksi</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Field label="Konteks Pasar" htmlFor="j-ctx">
            <Textarea id="j-ctx" name="marketContext" rows={2} defaultValue={j?.marketContext ?? ""} />
          </Field>
          <Field label="Alasan Membuka Posisi" htmlFor="j-entry">
            <Textarea id="j-entry" name="entryReason" rows={2} defaultValue={j?.entryReason ?? ""} />
          </Field>
          <Field label="Alasan Menutup Posisi" htmlFor="j-exit">
            <Textarea id="j-exit" name="exitReason" rows={2} defaultValue={j?.exitReason ?? ""} />
          </Field>
          <Field label="Pelajaran" htmlFor="j-lessons">
            <Textarea id="j-lessons" name="lessons" rows={2} defaultValue={j?.lessons ?? ""} />
          </Field>
          <Field label="Perbaikan Berikutnya" htmlFor="j-improve">
            <Textarea id="j-improve" name="improvement" rows={2} defaultValue={j?.improvement ?? ""} />
          </Field>
          <Field label="Tag (pisahkan dengan koma)" htmlFor="j-tags">
            <Input id="j-tags" name="tags" defaultValue={(j?.tags ?? []).join(", ")} placeholder="breakout, sesi-london" />
          </Field>
        </CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Psikologi</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Emosi Sebelum" htmlFor="j-eb">
              <Select id="j-eb" name="emotionBefore" defaultValue={j?.emotionBefore ?? ""}>
                <EmotionOptions options={emotionsWhileTrading} value={j?.emotionBefore} />
              </Select>
            </Field>
            <Field label="Emosi Saat" htmlFor="j-ed">
              <Select id="j-ed" name="emotionDuring" defaultValue={j?.emotionDuring ?? ""}>
                <EmotionOptions options={emotionsWhileTrading} value={j?.emotionDuring} />
              </Select>
            </Field>
            <Field label="Emosi Setelah" htmlFor="j-ea">
              <Select id="j-ea" name="emotionAfter" defaultValue={j?.emotionAfter ?? ""}>
                <EmotionOptions options={emotionsAfterTrading} value={j?.emotionAfter} />
              </Select>
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Kepercayaan Diri (1–5)" htmlFor="j-conf">
              <Input id="j-conf" name="confidence" type="number" min="1" max="5" defaultValue={j?.confidence ?? ""} />
            </Field>
            <Field label="Stres (1–5)" htmlFor="j-stress">
              <Input id="j-stress" name="stressLevel" type="number" min="1" max="5" defaultValue={j?.stressLevel ?? ""} />
            </Field>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Check2 name="fomo" label="FOMO" def={j?.fomo} />
            <Check2 name="revenge" label="Transaksi balas dendam" def={j?.revenge} />
            <Check2 name="overtrading" label="Transaksi berlebihan" def={j?.overtrading} />
          </div>
          <Field label="Patuh pada rencana" htmlFor="j-compliant">
            <Select id="j-compliant" name="compliant" defaultValue={String(j?.compliant ?? "")}>
              <option value="">Belum dicatat</option>
              <option value="true">Ya</option>
              <option value="false">Tidak</option>
            </Select>
          </Field>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Kesalahan</p>
            <div className="flex flex-wrap gap-1.5">
              {Object.entries(MISTAKE_LABELS).map(([m, label]) => (
                <label key={m} className={cn(
                  "flex cursor-pointer items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px]",
                  j?.mistakes?.includes(m) ? "border-loss/50 bg-loss/10 text-loss" : "border-line text-muted hover:border-line",
                )}>
                  <input type="checkbox" name={`mistake_${m}`} defaultChecked={j?.mistakes?.includes(m)} className="h-3 w-3 accent-[#f87171]" />
                  {label}
                </label>
              ))}
            </div>
          </div>
          <div>
            <p className="mb-1.5 text-xs font-medium text-muted">Daftar Periksa Setelah Transaksi</p>
            <div className="space-y-1.5">
              {Object.entries(POST_CHECK_LABELS).map(([key, label]) => (
                <Check2 key={key} name={`post_${key}`} label={label} def={j?.postChecklist?.[key]} />
              ))}
            </div>
          </div>
          <div className="flex justify-end">
            <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Jurnal"}</Button>
          </div>
        </CardContent>
      </Card>
    </form>
  );
}

function TradeScreenshots({ attachments, timezone, uploadScreenshot, deleteAttachment }: {
  attachments: TradeDTO["attachments"];
  timezone: string;
  uploadScreenshot: TradeActions["uploadScreenshot"];
  deleteAttachment: TradeActions["deleteAttachment"];
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Camera className="h-4 w-4" aria-hidden /> Tangkapan Layar Grafik
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {(["BEFORE", "ENTRY", "DURING", "EXIT"] as const).map((k) => (
            <label key={k} className="cursor-pointer">
              <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" data-kind={k} onChange={uploadScreenshot} />
              <span className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-panel-2 px-3 text-xs text-muted border border-line hover:border-primary/50 hover:text-primary">
                <Plus className="h-3.5 w-3.5" aria-hidden /> {attachmentKindLabel[k]}
              </span>
            </label>
          ))}
        </div>
        {attachments.length === 0 ? (
          <p className="py-8 text-center text-xs text-faint">
            Belum ada tangkapan layar. Unggah gambar grafik untuk mendokumentasikan transaksi.
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {attachments.map((a) => (
              <figure key={a.id} className="overflow-hidden rounded-xl border border-line">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/attachments/${a.id}`} alt={`${attachmentKindLabel[a.kind]} · ${a.fileName}`} className="aspect-video w-full object-cover" loading="lazy" />
                <figcaption className="flex items-center justify-between px-2.5 py-1.5 text-[11px] text-muted">
                  <span>{attachmentKindLabel[a.kind]} · {fmtDateTimeID(a.createdAt, timezone)}</span>
                  <button onClick={() => deleteAttachment(a.id)} aria-label={`Hapus lampiran ${attachmentKindLabel[a.kind]}`} className="text-faint hover:text-loss">
                    <Trash2 className="h-3.5 w-3.5" aria-hidden />
                  </button>
                </figcaption>
              </figure>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
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
