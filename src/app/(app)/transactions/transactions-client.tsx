"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ArrowDownLeft, ArrowUpRight, Plus, Repeat, SlidersHorizontal, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import {
  EmptyRow,
  Table,
  TableWrap,
  TBody,
  TD,
  THead,
  TH,
  TR,
} from "@/components/ui/table";
import { fmtUSD } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Row {
  id: string;
  accountId: string;
  accountName: string;
  type: string;
  amount: number;
  occurredAt: string;
  note: string | null;
  reversalOfId: string | null;
}

const TYPE_LABELS: Record<string, string> = {
  DEPOSIT: "Deposit",
  WITHDRAWAL: "Withdrawal",
  REALIZED_PNL: "P&L Realisasi",
  ADJUSTMENT: "Adjustment",
  FEE: "Fee",
  REVERSAL: "Pembatalan",
};

export function TransactionsClient({
  accounts,
  rows,
  total,
  activeType,
  activeAccountId,
}: {
  accounts: { id: string; name: string }[];
  rows: Row[];
  total: number;
  activeType: string;
  activeAccountId: string;
}) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [reverseId, setReverseId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function create(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/transactions", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: fd.get("accountId"),
          type: fd.get("type"),
          amount: fd.get("amount"),
          occurredAt: fd.get("occurredAt") || undefined,
          note: fd.get("note") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menyimpan");
        return;
      }
      setCreateOpen(false);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  async function reverse(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!reverseId) return;
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch(`/api/transactions/${reverseId}/reverse`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ reason: fd.get("reason") }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal membatalkan");
        return;
      }
      setReverseId(null);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  return (
    <>
      {/* Filter toolbar */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="flex items-center gap-1.5 text-xs text-faint">
          <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden /> Filter
        </span>
        <Select
          aria-label="Filter akun"
          value={activeAccountId}
          onChange={(e) => setParam("accountId", e.target.value)}
          className="h-8 w-auto min-w-36 text-xs"
        >
          <option value="">Semua Akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter tipe"
          value={activeType}
          onChange={(e) => setParam("type", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Tipe</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </Select>
        <span className="ml-auto tnum text-xs text-faint">{total} transaksi</span>
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Catat Transaksi
        </Button>
      </div>

      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH>Waktu</TH>
              <TH>Akun</TH>
              <TH>Tipe</TH>
              <TH className="text-right">Jumlah</TH>
              <TH>Catatan</TH>
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <EmptyRow colSpan={6}>Belum ada transaksi. Catat deposit pertama Anda.</EmptyRow>
            ) : (
              rows.map((r) => (
                <TR key={r.id}>
                  <TD className="tnum whitespace-nowrap text-xs text-muted">
                    {new Date(r.occurredAt).toLocaleString("id-ID", {
                      dateStyle: "medium",
                      timeStyle: "short",
                      timeZone: "Asia/Jakarta",
                    })}
                  </TD>
                  <TD className="text-xs">{r.accountName}</TD>
                  <TD>
                    <TypeBadge type={r.type} />
                  </TD>
                  <TD
                    className={cn(
                      "tnum text-right font-semibold",
                      r.amount >= 0 ? "text-primary" : "text-loss",
                    )}
                  >
                    {r.amount >= 0 ? "+" : ""}
                    {fmtUSD(r.amount)}
                  </TD>
                  <TD className="max-w-64 truncate text-xs text-muted">{r.note ?? "—"}</TD>
                  <TD className="text-right">
                    {r.type !== "REVERSAL" && !r.reversalOfId ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setReverseId(r.id)}
                        aria-label="Batalkan transaksi"
                      >
                        <Undo2 className="h-3.5 w-3.5" aria-hidden />
                      </Button>
                    ) : null}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>

      {/* Create dialog */}
      <Dialog open={createOpen} onClose={() => setCreateOpen(false)} title="Catat Transaksi Manual">
        <form onSubmit={create} className="space-y-3">
          <Field label="Akun" htmlFor="tx-account">
            <Select id="tx-account" name="accountId" required defaultValue={accounts[0]?.id ?? ""}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Tipe" htmlFor="tx-type">
              <Select id="tx-type" name="type" required defaultValue="DEPOSIT">
                <option value="DEPOSIT">Deposit</option>
                <option value="WITHDRAWAL">Withdrawal</option>
                <option value="ADJUSTMENT">Adjustment</option>
              </Select>
            </Field>
            <Field label="Jumlah (USD)" htmlFor="tx-amount">
              <Input id="tx-amount" name="amount" type="number" step="0.01" min="0.01" required />
            </Field>
          </div>
          <Field label="Waktu" htmlFor="tx-date" hint="Kosongkan untuk waktu sekarang">
            <Input id="tx-date" name="occurredAt" type="datetime-local" />
          </Field>
          <Field label="Catatan" htmlFor="tx-note">
            <Textarea id="tx-note" name="note" rows={2} placeholder="Wajib untuk adjustment" />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Dialog>

      {/* Reverse dialog */}
      <Dialog open={reverseId !== null} onClose={() => setReverseId(null)} title="Batalkan Transaksi">
        <form onSubmit={reverse} className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            Pembatalan menambah baris <strong>REVERSAL</strong> di ledger — transaksi asli tidak
            pernah diubah, agar jejak audit tetap utuh.
          </p>
          <Field label="Alasan" htmlFor="rv-reason">
            <Textarea id="rv-reason" name="reason" rows={2} required minLength={3} />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setReverseId(null)}>Batal</Button>
            <Button variant="danger" type="submit" disabled={loading}>
              <Repeat className="h-3.5 w-3.5" aria-hidden /> {loading ? "Memproses…" : "Batalkan"}
            </Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}

function TypeBadge({ type }: { type: string }) {
  switch (type) {
    case "DEPOSIT":
      return <Badge tone="info"><ArrowDownLeft className="h-3 w-3" /> Deposit</Badge>;
    case "WITHDRAWAL":
      return <Badge tone="warn"><ArrowUpRight className="h-3 w-3" /> Withdrawal</Badge>;
    case "REALIZED_PNL":
      return <Badge tone="success">P&L</Badge>;
    case "ADJUSTMENT":
      return <Badge tone="neutral">Adj</Badge>;
    case "FEE":
      return <Badge tone="neutral">Fee</Badge>;
    case "REVERSAL":
      return <Badge tone="danger">Pembatalan</Badge>;
    default:
      return <Badge>{type}</Badge>;
  }
}
