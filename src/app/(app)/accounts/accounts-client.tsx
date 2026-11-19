"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";
import { Field, Input, Select, Textarea } from "@/components/ui/field";

type EditableAccount = {
  id: string;
  name: string;
  broker: string | null;
  accountNumber: string | null;
  notes: string | null;
  isActive: boolean;
};

export function AccountsClient({ account }: { account?: EditableAccount }) {
  const router = useRouter();
  const formId = useId();
  const [dialog, setDialog] = useState<"form" | "delete" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [currency, setCurrency] = useState("USD");
  const endpoint = account ? `/api/accounts/${encodeURIComponent(account.id)}` : "/api/accounts";

  function openDialog(next: "form" | "delete") {
    setError(null);
    setCurrency("USD");
    setDialog(next);
  }

  async function save(method: "POST" | "PATCH" | "DELETE", data?: object) {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method,
        ...(data && { headers: { "content-type": "application/json" }, body: JSON.stringify(data) }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Gagal menyimpan perubahan akun");
        return;
      }
      setDialog(null);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    void save(account ? "PATCH" : "POST", {
      name: fd.get("name"),
      broker: fd.get("broker"),
      accountNumber: fd.get("accountNumber"),
      notes: fd.get("notes"),
      ...(!account && { currency, initialDeposit: fd.get("initialDeposit") || undefined }),
    });
  }

  const errorMessage = error ? <p className="text-xs text-loss" role="alert">{error}</p> : null;

  return (
    <>
      {account ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => openDialog("form")}>Edit</Button>
            <Button size="sm" variant="secondary" disabled={loading} onClick={() => save("PATCH", { isActive: !account.isActive })}>
              {account.isActive ? "Nonaktifkan" : "Aktifkan Kembali"}
            </Button>
            <Button size="sm" variant="danger" disabled={loading} onClick={() => openDialog("delete")}>Hapus</Button>
          </div>
          {!dialog && errorMessage}
        </div>
      ) : (
        <Button onClick={() => openDialog("form")}>
          <Plus className="h-4 w-4" aria-hidden /> Tambah Akun
        </Button>
      )}
      <Dialog open={dialog === "form"} onClose={() => setDialog(null)} title={account ? "Edit Akun Trading" : "Tambah Akun Trading"}>
        {dialog === "form" && (
        <form onSubmit={submit} className="space-y-3">
          <Field label="Nama Akun" htmlFor={`${formId}-name`}>
            <Input id={`${formId}-name`} name="name" required minLength={2} maxLength={60} defaultValue={account?.name} placeholder="cth. Akun Exness" />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Broker" htmlFor={`${formId}-broker`}>
              <Input id={`${formId}-broker`} name="broker" maxLength={60} defaultValue={account?.broker ?? ""} placeholder="Opsional" />
            </Field>
            <Field label="Nomor Akun" htmlFor={`${formId}-number`}>
              <Input id={`${formId}-number`} name="accountNumber" maxLength={40} defaultValue={account?.accountNumber ?? ""} placeholder="Opsional" />
            </Field>
          </div>
          {!account && (
            <>
              <Field label="Mata Uang" htmlFor={`${formId}-currency`}>
                <Select id={`${formId}-currency`} value={currency} onChange={(event) => setCurrency(event.target.value)}>
                  <option value="USD">USD</option>
                  <option value="USC">USC (US cent)</option>
                </Select>
              </Field>
              <Field label={`Deposit Awal (${currency})`} htmlFor={`${formId}-deposit`} hint="Tercatat sebagai transaksi DEPOSIT di ledger">
                <Input id={`${formId}-deposit`} name="initialDeposit" type="number" step="0.01" min="0" placeholder="0" />
              </Field>
            </>
          )}
          <Field label="Catatan" htmlFor={`${formId}-notes`}>
            <Textarea id={`${formId}-notes`} name="notes" rows={2} maxLength={500} defaultValue={account?.notes ?? ""} placeholder="Opsional" />
          </Field>
          {errorMessage}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="secondary" onClick={() => setDialog(null)}>Batal</Button>
            <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan"}</Button>
          </div>
        </form>
        )}
      </Dialog>
      {account && (
        <Dialog open={dialog === "delete"} onClose={() => setDialog(null)} title="Hapus Akun Trading">
          <div className="space-y-3">
            <p className="text-sm">Hapus akun <strong>{account.name}</strong> secara permanen?</p>
            <p className="text-xs text-muted">Hanya akun tanpa riwayat atau referensi yang dapat dihapus.</p>
            {dialog === "delete" && errorMessage}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setDialog(null)}>Batal</Button>
              <Button variant="danger" disabled={loading} onClick={() => save("DELETE")}>{loading ? "Menghapus…" : "Hapus Akun"}</Button>
            </div>
          </div>
        </Dialog>
      )}
    </>
  );
}
