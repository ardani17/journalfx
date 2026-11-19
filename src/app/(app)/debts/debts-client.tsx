"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { Dialog, MutationForm } from "@/components/ui/misc";
import { fmtIDR } from "@/lib/money";
import { fmtCalendarDateID, fmtDateID } from "@/lib/dates";
import { isRecurringDebt, type DebtSchedule } from "@/lib/finance/debt";

interface DebtDTO {
  id: string;
  name: string;
  creditor: string | null;
  status: string;
  principalOriginal: string;
  principalRemaining: string;
  interestRate: string | null;
  installmentAmount: string | null;
  schedule: DebtSchedule;
  dueDate: string | null;
  dueDay: number | null;
  nextDueDate: string | null;
  overdue: boolean;
  projectionNote: string | null;
  lastPayments: { id: string; paidAt: string; totalAmount: string; principalPortion: string; interestPortion: string }[];
}

const scheduleLabels: Record<DebtSchedule, string> = {
  weekly: "Mingguan",
  monthly: "Bulanan",
  yearly: "Tahunan",
  one_time: "Pelunasan satu kali",
  flexible: "Tanpa jatuh tempo",
};

const interestFormatter = new Intl.NumberFormat("id-ID", { maximumFractionDigits: 4 });

function debtTermsFromForm(fd: FormData) {
  const schedule = fd.get("schedule") as DebtSchedule;
  const recurring = isRecurringDebt(schedule);
  const interestMode = fd.get("interestMode");
  return {
    repaymentMode: recurring ? "recurring" : schedule,
    installmentFreq: recurring ? schedule : undefined,
    installmentAmount: recurring ? fd.get("installmentAmount") || null : undefined,
    dueDate: fd.get("dueDate") || null,
    interestRate: interestMode === "known" ? fd.get("interestRate") : interestMode === "none" ? 0 : null,
  };
}

function DebtTermsFields({ debt }: { debt?: DebtDTO }) {
  const [schedule, setSchedule] = useState<DebtSchedule | "">(debt?.schedule ?? "");

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <Field label="Jadwal Pembayaran" htmlFor="d-schedule">
        <Select id="d-schedule" name="schedule" value={schedule} onChange={(e) => setSchedule(e.target.value as DebtSchedule)} required>
          <option value="" disabled>Pilih jadwal</option>
          {Object.entries(scheduleLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
      </Field>
      {schedule && isRecurringDebt(schedule) ? (
        <Field label="Cicilan per Periode (IDR)" htmlFor="d-inst" hint="Kosongkan jika belum diketahui.">
          <Input id="d-inst" name="installmentAmount" type="number" min="0.01" step="0.01"
            defaultValue={debt?.installmentAmount === "0" ? "" : debt?.installmentAmount ?? ""} />
        </Field>
      ) : null}
      {schedule === "one_time" || schedule === "yearly" ? (
        <Field key={schedule} label={schedule === "yearly" ? "Tanggal Cicilan Pertama" : "Tanggal Jatuh Tempo"}
          htmlFor="d-due" hint={schedule === "yearly" ? "Opsional, untuk pengingat tahunan." : undefined}>
          <Input id="d-due" name="dueDate" type="date" defaultValue={debt?.schedule === schedule ? debt.dueDate ?? "" : ""}
            required={schedule === "one_time"} />
        </Field>
      ) : null}
      <DebtInterestFields interestRate={debt?.interestRate} />
    </div>
  );
}

function DebtInterestFields({ interestRate }: { interestRate?: string | null }) {
  const [interestMode, setInterestMode] = useState(
    interestRate == null ? "unknown" : Number(interestRate) === 0 ? "none" : "known",
  );

  return (
    <>
      <Field label="Bunga" htmlFor="d-interest-mode">
        <Select id="d-interest-mode" name="interestMode" value={interestMode} onChange={(e) => setInterestMode(e.target.value)}>
          <option value="unknown">Belum diketahui</option>
          <option value="none">Tanpa bunga</option>
          <option value="known">Ada bunga</option>
        </Select>
      </Field>
      {interestMode === "known" ? (
        <Field label="Bunga per Tahun (%)" htmlFor="d-rate">
          <Input id="d-rate" name="interestRate" type="number" min="0.0001" max="1000" step="0.0001"
            defaultValue={Number(interestRate) > 0 ? interestRate ?? "" : ""} required />
        </Field>
      ) : null}
    </>
  );
}

export function DebtsClient({ debts }: { debts: DebtDTO[] }) {
  const router = useRouter();
  const [debtForm, setDebtForm] = useState<{ kind: "add" } | { kind: "edit"; id: string } | null>(null);
  const [payFor, setPayFor] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const debtToEdit = debtForm?.kind === "edit" ? debts.find((debt) => debt.id === debtForm.id) : undefined;
  const paymentDebt = debts.find((debt) => debt.id === payFor);

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
        <Button size="sm" disabled={loading} onClick={() => { setError(null); setDebtForm({ kind: "add" }); }}>
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
            const recurring = isRecurringDebt(d.schedule);
            const interest = d.interestRate === null ? "Belum diketahui"
              : Number(d.interestRate) === 0 ? "Tanpa bunga" : `${interestFormatter.format(Number(d.interestRate))}% per tahun`;
            return (
              <Card key={d.id} id={`debt-${d.id}`}>
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
                      <p className="text-[10px] text-faint">Bunga</p>
                      <p className="tnum font-semibold">{interest}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border border-line-soft bg-panel-2/50 px-2.5 py-1.5 text-[11px] text-muted">
                    <p>
                      <span className="font-semibold text-ink">{scheduleLabels[d.schedule]}</span>
                      {recurring ? ` · ${Number(d.installmentAmount) > 0 ? fmtIDR(d.installmentAmount) : "Nominal cicilan belum diketahui"}` : null}
                    </p>
                    {d.nextDueDate ? (
                      <p className={d.overdue ? "font-semibold text-loss" : undefined}>
                        {d.overdue ? "Lewat jatuh tempo · " : d.schedule === "yearly" && d.status === "PAID" ? "Cicilan pertama · " : "Jatuh tempo · "}
                        {fmtCalendarDateID(d.nextDueDate)}
                      </p>
                    ) : recurring && d.dueDay ? <p>Jatuh tempo tanggal {d.dueDay} setiap bulan</p> : null}
                    {d.projectionNote ? <p>{d.projectionNote}</p> : null}
                  </div>
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
                  <div className="flex flex-wrap justify-end gap-2 pt-1">
                    <Button size="sm" variant="secondary" disabled={loading}
                      onClick={() => { setError(null); setDebtForm({ kind: "edit", id: d.id }); }}>
                      Edit Ketentuan
                    </Button>
                    <Button size="sm" disabled={loading || d.status === "PAID"} onClick={() => { setError(null); setPayFor(d.id); }}>
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

      <Dialog open={debtForm !== null} onClose={() => setDebtForm(null)} title={debtToEdit ? "Edit Ketentuan Hutang" : "Tambah Hutang"}>
        {debtForm ? <MutationForm key={debtToEdit?.id ?? "add"} action={(fd) => {
          const terms = debtTermsFromForm(fd);
          if (debtToEdit) {
            return submit(`/api/debts/${debtToEdit.id}`, "PATCH", () => setDebtForm(null), terms);
          } else {
            return submit("/api/debts", "POST", () => setDebtForm(null), {
              ...terms,
              name: fd.get("name"),
              creditor: fd.get("creditor") || undefined,
              principalOriginal: fd.get("principalOriginal"),
            });
          }
        }} className="space-y-3">
          {debtToEdit ? <p className="text-sm font-medium">{debtToEdit.name}</p> : <>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Nama" htmlFor="d-name"><Input id="d-name" name="name" required minLength={2} maxLength={80} placeholder="Mis. Pinjaman dari teman" /></Field>
              <Field label="Kreditor" htmlFor="d-creditor"><Input id="d-creditor" name="creditor" maxLength={80} placeholder="Opsional" /></Field>
            </div>
            <Field label="Pokok (IDR)" htmlFor="d-principal"><Input id="d-principal" name="principalOriginal" type="number" min="0.01" step="0.01" required /></Field>
          </>}
          <DebtTermsFields debt={debtToEdit} />
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setDebtForm(null)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan</Button>
          </div>
        </MutationForm> : null}
      </Dialog>

      <Dialog open={paymentDebt !== undefined} onClose={() => setPayFor(null)} title="Catat Pembayaran Hutang">
        {paymentDebt ? <MutationForm key={paymentDebt.id} action={(fd) => {
          return submit(`/api/debts/${paymentDebt.id}/payments`, "POST", () => setPayFor(null), {
            totalAmount: fd.get("totalAmount"),
            interestPortion: fd.get("interestPortion") || 0,
            feePortion: fd.get("feePortion") || 0,
            note: fd.get("note") || undefined,
          });
        }} className="space-y-3">
          <p className="text-xs text-muted">Sisa pokok {fmtIDR(paymentDebt.principalRemaining)}</p>
          <Field label="Total Pembayaran (IDR)" htmlFor="p-total"><Input id="p-total" name="totalAmount" type="number" min="0.01" step="0.01" required /></Field>
          <div className="grid gap-3 sm:grid-cols-2">
            {paymentDebt.interestRate === null || Number(paymentDebt.interestRate) !== 0 ? (
              <Field label="Porsi Bunga (IDR)" htmlFor="p-int"><Input id="p-int" name="interestPortion" type="number" min="0" step="0.01" defaultValue={0} /></Field>
            ) : null}
            <Field label="Porsi Biaya (IDR)" htmlFor="p-fee"><Input id="p-fee" name="feePortion" type="number" min="0" step="0.01" defaultValue={0} /></Field>
            <Field label="Catatan" htmlFor="p-note"><Input id="p-note" name="note" maxLength={300} /></Field>
          </div>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setPayFor(null)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan Pembayaran</Button>
          </div>
        </MutationForm> : null}
      </Dialog>
    </>
  );
}
