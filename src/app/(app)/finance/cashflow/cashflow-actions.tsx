"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, MutationForm } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/field";

export function CashflowActions() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  return (
    <>
      <Button size="sm" onClick={() => { setError(null); setOpen(true); }}>
        <Plus className="h-3.5 w-3.5" aria-hidden /> Catat Transaksi
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Catat Transaksi Keuangan">
        <MutationForm
          action={async (fd) => {
            setError(null);
            setLoading(true);
            try {
              const res = await fetch("/api/finance/transactions", {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                  kind: fd.get("kind"),
                  amount: fd.get("amount"),
                  description: fd.get("description") || undefined,
                }),
              });
              const json = await res.json();
              if (!res.ok || !json.ok) {
                setError(json.error ?? "Gagal menyimpan");
                return;
              }
              setOpen(false);
              router.refresh();
            } catch {
              setError("Tidak dapat menghubungi server");
            } finally {
              setLoading(false);
            }
          }}
          className="space-y-3"
        >
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis" htmlFor="cf-kind">
              <Select id="cf-kind" name="kind" defaultValue="EXPENSE">
                <option value="EXPENSE">Pengeluaran</option>
                <option value="INCOME">Pemasukan</option>
              </Select>
            </Field>
            <Field label="Jumlah (IDR)" htmlFor="cf-amt">
              <Input id="cf-amt" name="amount" type="number" min="1" step="1000" required />
            </Field>
          </div>
          <Field label="Keterangan" htmlFor="cf-desc">
            <Input id="cf-desc" name="description" placeholder="cth. bayar listrik" />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan</Button>
          </div>
        </MutationForm>
      </Dialog>
    </>
  );
}
