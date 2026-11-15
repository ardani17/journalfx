"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";
import { Field, Input, Textarea } from "@/components/ui/field";

export function AccountsClient() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    try {
      const res = await fetch("/api/accounts", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          name: fd.get("name"),
          broker: fd.get("broker") || undefined,
          accountNumber: fd.get("accountNumber") || undefined,
          notes: fd.get("notes") || undefined,
          initialDeposit: fd.get("initialDeposit") || undefined,
        }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menambah akun");
        return;
      }
      setOpen(false);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus className="h-4 w-4" aria-hidden /> Tambah Akun
      </Button>
      <Dialog open={open} onClose={() => setOpen(false)} title="Tambah Akun Trading">
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nama Akun" htmlFor="acc-name">
            <Input id="acc-name" name="name" required minLength={2} placeholder="cth. Akun Exness" />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Broker" htmlFor="acc-broker">
              <Input id="acc-broker" name="broker" placeholder="Opsional" />
            </Field>
            <Field label="Nomor Akun" htmlFor="acc-num">
              <Input id="acc-num" name="accountNumber" placeholder="Opsional" />
            </Field>
          </div>
          <Field
            label="Deposit Awal (USD)"
            htmlFor="acc-deposit"
            hint="Tercatat sebagai transaksi DEPOSIT di ledger"
          >
            <Input id="acc-deposit" name="initialDeposit" type="number" step="0.01" min="0" placeholder="0" />
          </Field>
          <Field label="Catatan" htmlFor="acc-notes">
            <Textarea id="acc-notes" name="notes" rows={2} placeholder="Opsional" />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
