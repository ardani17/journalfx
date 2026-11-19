"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CheckCircle2, Pencil, Wallet, XCircle } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Textarea, Select } from "@/components/ui/field";
import { Dialog, MutationForm } from "@/components/ui/misc";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { D, fmtIDR, fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { fmtDateID } from "@/lib/dates";
import { formatFxEstimate, parseConversionAmount, type JisdorQuote } from "@/lib/finance/exchange";
import { JisdorRateNote } from "@/components/finance/jisdor-rate-note";

interface Props {
  accounts: { id: string; name: string }[];
  rec: {
    eligible: string;
    recommended: string;
    profitOnlyCap: string;
    needsCap: string | null;
    cashCap: string;
    zeroReasons: string[];
    warnings: string[];
    caps: { byRatio: boolean; byNeeds: boolean; byCash: boolean; byPeriodProfit: boolean; byEligibility: boolean };
  };
  rule: { maxWdRatio: string; needsTargetIdr: string | null; reserveUsd: string };
  cumulativePnl: string;
  hwm: string;
  periodProfit: string;
  periodTaken: string;
  availableCash: string;
  latestFx: JisdorQuote | null;
  history: {
    id: string; status: string; amountUSD: string; fxRate: string | null;
    receivedAmount: string | null; fees: string | null; note: string | null;
    mt5DealId: string | null;
    createdAt: string; completedAt: string | null;
  }[];
}

export function WithdrawalsClient(props: Props) {
  const router = useRouter();
  const [ruleOpen, setRuleOpen] = useState(false);
  const [wdOpen, setWdOpen] = useState(false);
  const [amountUsd, setAmountUsd] = useState("");
  const [completeId, setCompleteId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function call(url: string, method: string, body?: unknown) {
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Operasi gagal");
        return null;
      }
      router.refresh();
      return json.data;
    } catch {
      setError("Tidak dapat menghubungi server");
      return null;
    } finally {
      setLoading(false);
    }
  }

  const rec = D(props.rec.recommended);
  const amount = parseConversionAmount(amountUsd);
  const previewIdr = amount && amount.gt(0) ? formatFxEstimate(amount, "USD", props.latestFx) : null;

  return (
    <>
      {/* Recommendation panel */}
      <div className="grid gap-3 lg:grid-cols-[34fr_66fr]">
        <Card className="border-primary/30 panel-gradient">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-primary">
              <Wallet className="h-4 w-4" aria-hidden /> Rekomendasi WD Minggu Ini
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="tnum text-3xl font-extrabold text-primary">{fmtUSD(rec)}</p>
            {props.latestFx ? <p className="tnum text-sm text-ink">{formatFxEstimate(rec, "USD", props.latestFx)}</p> : null}
            {props.rec.zeroReasons.length > 0 && rec.isZero() ? (
              <div className="rounded-lg border border-line bg-panel-2/60 p-2.5">
                {props.rec.zeroReasons.map((z) => (
                  <p key={z} className="text-[11px] leading-relaxed text-muted">• {z}</p>
                ))}
              </div>
            ) : null}
            {props.rec.warnings.map((w) => (
              <p key={w} className="rounded-lg border border-warn/30 bg-warn/10 px-2.5 py-1.5 text-[11px] text-warn">⚠ {w}</p>
            ))}
            <div className="flex gap-2">
              <Button onClick={() => { setError(null); setAmountUsd(rec.toFixed(2)); setWdOpen(true); }} disabled={loading || rec.lte(0)}>
                <Wallet className="h-4 w-4" aria-hidden /> Ajukan WD
              </Button>
              <Button variant="purple" onClick={() => { setError(null); setRuleOpen(true); }}>
                <Pencil className="h-4 w-4" aria-hidden /> Edit Aturan
              </Button>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Dasar Perhitungan</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-2 gap-x-6 gap-y-1 text-xs">
            <Row label="Laba Kumulatif (P&L trading)" value={fmtUSDdelta(props.cumulativePnl)} />
            <Row label="High-Water Mark" value={fmtUSD(props.hwm)} />
            <Row label="Profit Eligibel" value={fmtUSD(props.rec.eligible)} strong />
            <Row label={`Cap Rasio (${fmtNum(Number(props.rule.maxWdRatio), 0)}%)`} value={fmtUSD(props.rec.profitOnlyCap)} />
            <Row label="Cap Kebutuhan Mingguan" value={props.rec.needsCap !== null ? fmtUSD(props.rec.needsCap) : "— (kurs belum ada)"} />
            <Row label="Cap Kas di Atas Reserve" value={fmtUSD(props.rec.cashCap)} />
            <Row label="Profit Minggu Ini" value={fmtUSDdelta(props.periodProfit)} tone={Number(props.periodProfit) >= 0 ? "pos" : "neg"} />
            <Row label="Sudah Diambil Minggu Ini" value={fmtUSD(props.periodTaken)} />
            <Row label="Kas Tersedia" value={fmtUSD(props.availableCash)} />
            <div className="col-span-2 border-t border-line pt-2">
              <JisdorRateNote quote={props.latestFx} />
            </div>
          </CardContent>
        </Card>
      </div>

      {error ? <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">{error}</p> : null}
      {msg ? <p className="rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-xs text-primary" role="status">{msg}</p> : null}

      {/* History */}
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Dibuat</TH><TH>Status</TH><TH className="text-right">Amount USD</TH>
              <TH className="text-right">Kurs</TH><TH className="text-right">Diterima (IDR)</TH>
              <TH>Selesai</TH><TH />
            </TR>
          </THead>
          <TBody>
            {props.history.length === 0 ? (
              <EmptyRow colSpan={7}>Belum ada withdrawal tercatat.</EmptyRow>
            ) : (
              props.history.map((w) => (
                <TR key={w.id}>
                  <TD className="tnum text-xs">{fmtDateID(w.createdAt, "d MMM yyyy")}</TD>
                  <TD>
                    <Badge tone={w.status === "COMPLETED" ? "success" : w.status === "REQUESTED" ? "info" : w.status === "CANCELLED" ? "danger" : "warn"}>
                      {w.status}
                    </Badge>
                    {w.mt5DealId && <p className="mt-1 text-xs text-muted">MT5 · {w.note ?? w.mt5DealId}</p>}
                  </TD>
                  <TD className="tnum text-right text-xs font-semibold">{fmtUSD(w.amountUSD)}</TD>
                  <TD className="tnum text-right text-xs">{w.fxRate ? fmtNum(Number(w.fxRate), 0) : "—"}</TD>
                  <TD className="tnum text-right text-xs">{w.receivedAmount ? fmtIDR(w.receivedAmount) : "—"}</TD>
                  <TD className="tnum text-xs text-muted">{w.completedAt ? fmtDateID(w.completedAt, "d MMM yyyy") : "—"}</TD>
                  <TD className="text-right">
                    {w.status === "REQUESTED" || w.status === "RECOMMENDED" ? (
                      <span className="flex justify-end gap-1">
                        <Button variant="secondary" size="sm" onClick={() => { setError(null); setCompleteId(w.id); }}>
                          <CheckCircle2 className="h-3.5 w-3.5" aria-hidden /> Selesai
                        </Button>
                        <Button variant="danger" size="sm" onClick={() => call(`/api/withdrawals/${w.id}/cancel`, "POST")} aria-label="Batalkan">
                          <XCircle className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </span>
                    ) : null}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>
      <p className="text-[11px] leading-relaxed text-faint">
        Aturan: WD hanya dari profit eligibel — loss wajib dipulihkan dulu (HWM); profit periode
        harus positif; HWM naik setelah WD selesai sehingga eligibilitas tidak dipakai ulang. Unrealized
        P&L tidak dihitung. Kurs dan dana diterima dicatat sebagai snapshot historis.
      </p>

      {/* Rules dialog */}
      <Dialog open={ruleOpen} onClose={() => setRuleOpen(false)} title="Edit Aturan WD Dinamis">
        <MutationForm
          action={async (fd) => {
            const okDone = await call("/api/withdrawals/rules", "PUT", {
              maxWdRatio: fd.get("maxWdRatio"),
              needsTargetIdr: fd.get("needsTargetIdr") || null,
              reserveUsd: fd.get("reserveUsd"),
            });
            if (okDone) {
              setRuleOpen(false);
              setMsg("Aturan WD diperbarui (riwayat versi tetap tersimpan).");
            }
          }}
          className="space-y-3"
        >
          <Field label="Cap WD (% dari profit eligibel)" htmlFor="wr-ratio">
            <Input id="wr-ratio" name="maxWdRatio" type="number" min="1" max="100" step="0.5" defaultValue={Number(props.rule.maxWdRatio)} required />
          </Field>
          <Field label="Kebutuhan Bulanan (IDR)" htmlFor="wr-needs" hint="Dikonversi mingguan ×12/52 saat rekomendasi">
            <Input id="wr-needs" name="needsTargetIdr" type="number" min="0" step="1000" defaultValue={props.rule.needsTargetIdr ? Number(props.rule.needsTargetIdr) : ""} />
          </Field>
          <Field label="Reserve Kas (USD)" htmlFor="wr-reserve" hint="Balance minimum yang harus tersisa">
            <Input id="wr-reserve" name="reserveUsd" type="number" min="0" step="0.01" defaultValue={Number(props.rule.reserveUsd)} required />
          </Field>
          <WithdrawalError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setRuleOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan Aturan</Button>
          </div>
        </MutationForm>
      </Dialog>

      {/* Request dialog */}
      <Dialog open={wdOpen} onClose={() => setWdOpen(false)} title="Ajukan Withdrawal">
        <MutationForm
          action={async (fd) => {
            const done = await call("/api/withdrawals", "POST", {
              amountUsd: fd.get("amountUsd"),
              accountId: fd.get("accountId"),
              note: fd.get("note") || undefined,
            });
            if (done) {
              setWdOpen(false);
              setMsg("WD diajukan — lengkapi kurs & dana diterima saat eksekusi di broker selesai.");
            }
          }}
          className="space-y-3"
        >
          <Field label="Akun Sumber" htmlFor="wd-account">
            <Select id="wd-account" name="accountId" required>
              {props.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </Select>
          </Field>
          <Field label="Jumlah (USD)" htmlFor="wd-amt" hint={`Rekomendasi: ${fmtUSD(rec)}`}>
            <Input id="wd-amt" name="amountUsd" type="number" min="0.01" step="0.01" value={amountUsd} onChange={(event) => setAmountUsd(event.target.value)} required />
          </Field>
          <output htmlFor="wd-amt" className="tnum block text-xs text-muted">
            Estimasi pencairan: {previewIdr ?? "—"}
          </output>
          <Field label="Catatan" htmlFor="wd-note">
            <Textarea id="wd-note" name="note" rows={2} />
          </Field>
          <WithdrawalError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setWdOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Ajukan</Button>
          </div>
        </MutationForm>
      </Dialog>

      {/* Complete dialog */}
      <Dialog open={completeId !== null} onClose={() => setCompleteId(null)} title="Selesaikan WD — Rekonsiliasi">
        <MutationForm
          action={async (fd) => {
            if (!completeId) return;
            const done = await call(`/api/withdrawals/${completeId}/complete`, "POST", {
              fxRate: fd.get("fxRate"),
              receivedAmount: fd.get("receivedAmount"),
              fees: fd.get("fees") || undefined,
              note: fd.get("note") || undefined,
            });
            if (done) {
              setCompleteId(null);
              setMsg("WD selesai: ledger terposting, kurs tersimpan, dan pemasukan pribadi tercatat.");
            }
          }}
          className="space-y-3"
        >
          <p className="text-xs leading-relaxed text-muted">
            Catat kurs aktual, dana yang benar-benar diterima, dan biaya transfer. Snapshot kurs
            bersifat historis dan tidak dapat diubah.
          </p>
          <Field label="Kurs USDIDR" htmlFor="wc-fx">
            <Input id="wc-fx" name="fxRate" type="number" min="1" step="0.01" placeholder="15800" required />
          </Field>
          <Field label="Dana Diterima (IDR)" htmlFor="wc-recv">
            <Input id="wc-recv" name="receivedAmount" type="number" min="0" step="1000" required />
          </Field>
          <Field label="Biaya Transfer (IDR)" htmlFor="wc-fees">
            <Input id="wc-fees" name="fees" type="number" min="0" step="1000" />
          </Field>
          <Field label="Catatan" htmlFor="wc-note">
            <Textarea id="wc-note" name="note" rows={2} placeholder="no. referensi broker/bank" />
          </Field>
          <WithdrawalError error={error} />
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCompleteId(null)}>Batal</Button>
            <Button type="submit" disabled={loading}>Selesaikan</Button>
          </div>
        </MutationForm>
      </Dialog>
    </>
  );
}

function WithdrawalError({ error }: { error: string | null }) {
  return error ? <p className="text-xs text-loss" role="alert">{error}</p> : null;
}

function Row({ label, value, strong, tone }: { label: string; value: string; strong?: boolean; tone?: "pos" | "neg" }) {
  return (
    <div className="flex items-center justify-between border-b border-line-soft py-1.5">
      <span className="text-faint">{label}</span>
      <span className={`tnum ${strong ? "font-bold text-primary" : tone === "pos" ? "text-primary" : tone === "neg" ? "text-loss" : "font-medium text-ink"}`}>{value}</span>
    </div>
  );
}
