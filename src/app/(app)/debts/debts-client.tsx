"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";
import { fmtIDR } from "@/lib/money";
import { fmtDateID } from "@/lib/dates";

interface DebtDTO {
  id: string;
  name: string;
  creditor: string | null;
  status: string;
  principalOriginal: string;
  principalRemaining: string;
  interestRate: string | null;
  installmentAmount: string | null;
  installmentFreq: string | null;
  projectionNote: string;
  projectionPeriods: number | null;
  lastPayments: { id: string; paidAt: string; totalAmount: string; principalPortion: string; interestPortion: string }[];
}

export function DebtsClient({ debts }: { debts: DebtDTO[] }) {
  const router = useRouter();
  const [addOpen, setAddOpen] = useState(false);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(url: string, method: string, close: () => void, body?: unknown) {
    setError(null);
    setLoading(true);
    try {
      const res = await fetch(url, {
        method,
        headers: body ? { "content-type": "application/json" } : undefined,
        body: body ? JSON.stringify(body) : undefined,
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Gagal menyimpan");
        return;
      }
      close();
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Rencana Pelunasan</h2>
        <Button size="sm" onClick={() => setAddOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah Hutang
        </Button>
      </div>

      {debts.length === 0 ? (
        <Card>
          <CardContent className="py-10 text-center text-sm text-faint">
            Belum ada hutang tercatat. Catat hutang untuk melacak pelunasan dari profit trading.
          </CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 lg:grid-cols-2">
          {debts.map((d) => {
            const pct = Number(d.principalOriginal) > 0 ? ((Number(d.principalOriginal) - Number(d.principalRemaining)) / Number(d.principalOriginal)) * 100 : 0;
            return (
              <Card key={d.id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>{d.name}{d.creditor ? <span className="ml-1.5 text-xs font-normal text-faint">· {d.creditor}</span> : null}</span>
                    <Badge tone={d.status === "PAID" ? "success" : "danger"}>{d.status === "PAID" ? "LUNAS" : "AKTIF"}</Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-xs">
                  <div className="grid grid-cols-3 gap-2">
                    <div><p className="text-[10px] text-faint">Pokok Awal</p><p className="tnum font-semibold">{fmtIDR(d.principalOriginal)}</p></div>
                    <div><p className="text-[10px] text-faint">Sisa Pokok</p><p className="tnum font-semibold text-loss">{fmtIDR(d.principalRemaining)}</p></div>
                    <div>
                      <p className="text-[10px] text-faint">Bunga / Cicilan</p>
                      <p className="tnum font-semibold">
                        {d.interestRate ? `${Number(d.interestRate).toFixed(1)}%/th` : "?"}
                        {" / "}
                        {d.installmentAmount ? fmtIDR(d.installmentAmount) : "?"}
                      </p>
                    </div>
                  </div>
                  <p className="rounded-lg border border-line-soft bg-panel-2/50 px-2.5 py-1.5 text-[11px] text-muted">
                    Proyeksi: {d.projectionNote}
                  </p>
                  {d.lastPayments.length > 0 ? (
                    <div>
                      <p className="mb-1 text-[10px] uppercase tracking-wide text-faint">Pembayaran Terakhir</p>
                      {d.lastPayments.slice(0, 3).map((p) => (
                        <p key={p.id} className="tnum text-[11px] text-muted">
                          {fmtDateID(p.paidAt, "d MMM")} — {fmtIDR(p.totalAmount)}
                          <span className="text-faint"> (pokok {fmtIDR(p.principalPortion)}, bunga {fmtIDR(p.interestPortion)})</span>
                        </p>
                      ))}
                    </div>
                  ) : null}
                  <div className="flex justify-end pt-1">
                    <Button size="sm" disabled={d.status === "PAID"} onClick={() => setPayFor(d.id)}>
                      <Plus className="h-3.5 w-3.5" aria-hidden /> Catat Pembayaran
                    </Button>
                  </div>
                  <div className="text-right">
                    <span className="tnum text-[10px] text-faint">{pct.toFixed(1)}% lunas</span>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={addOpen} onClose={() => setAddOpen(false)} title="Tambah Hutang">
        <form onSubmit={(e) => {
          e.preventDefault();
          const fd = new FormData(e.currentTarget);
          submit("/api/debts", "POST", () => setAddOpen(false), {
            name: fd.get("name"),
            creditor: fd.get("creditor") || undefined,
            principalOriginal: fd.get("principalOriginal"),
            interestRate: fd.get("interestRate") || undefined,
            installmentAmount: fd.get("installmentAmount") || undefined,
            installmentFreq: fd.get("installmentFreq") || undefined,
          });
        }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Nama" htmlFor="d-name"><Input id="d-name" name="name" required minLength={2} placeholder="cth. KUR Bank B" /></Field>
            <Field label="Kreditor" htmlFor="d-creditor"><Input id="d-creditor" name="creditor" placeholder="Opsional" /></Field>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Pokok (IDR)" htmlFor="d-principal"><Input id="d-principal" name="principalOriginal" type="number" min="1" step="1000" required /></Field>
            <Field label="Bunga %/th" htmlFor="d-rate" hint="? jika belum tahu"><Input id="d-rate" name="interestRate" type="number" min="0" step="0.1" /></Field>
            <Field label="Cicilan (IDR)" htmlFor="d-inst"><Input id="d-inst" name="installmentAmount" type="number" min="0" step="1000" /></Field>
          </div>
          <Field label="Frekuensi Cicilan" htmlFor="d-freq">
            <Select id="d-freq" name="installmentFreq" defaultValue="monthly">
              <option value="monthly">Bulanan</option>
              <option value="weekly">Mingguan</option>
            </Select>
          </Field>
          <p className="text-[10px] text-faint">Bunga/cicilan yang belum diketahui menandai proyeksi belum lengkap (aturan PRD).</p>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setAddOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan</Button>
          </div>
        </form>
      </Dialog>

      <Dialog open={payFor !== null} onClose={() => setPayFor(null)} title="Catat Pembayaran Hutang">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (!payFor) return;
          const fd = new FormData(e.currentTarget);
          submit(`/api/debts/${payFor}/payments`, "POST", () => setPayFor(null), {
            totalAmount: fd.get("totalAmount"),
            interestPortion: fd.get("interestPortion") || 0,
            feePortion: fd.get("feePortion") || 0,
            note: fd.get("note") || undefined,
          });
        }} className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            Total pembayaran dipilah: bunga + biaya dicatat sebagai beban; <strong>hanya sisanya
            mengurangi pokok</strong> (PRD: bayar 1.000.000 dengan bunga 200.000 → pokok berkurang 800.000).
          </p>
          <Field label="Total Pembayaran (IDR)" htmlFor="p-total"><Input id="p-total" name="totalAmount" type="number" min="1" step="1000" required /></Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Porsi Bunga (IDR)" htmlFor="p-int"><Input id="p-int" name="interestPortion" type="number" min="0" step="1000" defaultValue={0} /></Field>
            <Field label="Porsi Biaya (IDR)" htmlFor="p-fee"><Input id="p-fee" name="feePortion" type="number" min="0" step="1000" defaultValue={0} /></Field>
          </div>
          <Field label="Catatan" htmlFor="p-note"><Input id="p-note" name="note" /></Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setPayFor(null)}>Batal</Button>
            <Button type="submit" disabled={loading}>Bayar</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
