"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Trash2, Wallet } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";
import { Dialog, MutationForm, Progress } from "@/components/ui/misc";
import { fmtIDR } from "@/lib/money";
import { cn } from "@/lib/utils";

interface Cat {
  id: string;
  name: string;
  plannedAmount: string;
  spent: string;
  isActive: boolean;
}

export function BudgetClient({ categories }: { categories: Cat[] }) {
  const router = useRouter();
  const [catOpen, setCatOpen] = useState(false);
  const [txOpen, setTxOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(url: string, method: string, close: () => void, body?: unknown, isForm = false) {
    setError(null);
    setLoading(true);
    try {
      const res = isForm
        ? await fetch(url, { method, body: body as FormData })
        : await fetch(url, {
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

  const totalPlanned = categories.filter((c) => c.isActive).reduce((s, c) => s + Number(c.plannedAmount), 0);

  return (
    <>
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Rincian Kebutuhan Bulanan</h2>
        <div className="flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setTxOpen(true)}>
            <Wallet className="h-3.5 w-3.5" aria-hidden /> Catat Pengeluaran/Pemasukan
          </Button>
          <Button size="sm" onClick={() => setCatOpen(true)}>
            <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah Kategori
          </Button>
        </div>
      </div>

      <Card>
        <CardContent className="p-0">
          <table className="w-full text-left text-sm">
            <thead className="border-b border-line bg-panel-2/60 text-[11px] uppercase tracking-wide text-faint">
              <tr><th className="px-4 py-2.5 font-medium">Kategori</th><th className="px-4 py-2.5 text-right font-medium">Terencana</th><th className="px-4 py-2.5 text-right font-medium">Terpakai</th><th className="px-4 py-2.5 font-medium">Progress</th><th /></tr>
            </thead>
            <tbody className="divide-y divide-line-soft">
              {categories.filter((c) => c.isActive).length === 0 ? (
                <tr><td colSpan={5} className="px-4 py-10 text-center text-sm text-faint">Belum ada kategori — tambahkan kebutuhan bulanan Anda.</td></tr>
              ) : (
                categories.filter((c) => c.isActive).map((c) => {
                  const pct = Number(c.plannedAmount) > 0 ? (Number(c.spent) / Number(c.plannedAmount)) * 100 : 0;
                  return (
                    <tr key={c.id} className="hover:bg-panel-2/40">
                      <td className="px-4 py-2.5 text-xs font-medium">{c.name}</td>
                      <td className="tnum px-4 py-2.5 text-right text-xs">{fmtIDR(c.plannedAmount)}</td>
                      <td className={cn("tnum px-4 py-2.5 text-right text-xs", Number(c.spent) > Number(c.plannedAmount) && "text-loss font-semibold")}>{fmtIDR(c.spent)}</td>
                      <td className="px-4 py-2.5">
                        <div className="flex items-center gap-2">
                          <Progress value={Math.min(pct, 100)} tone={pct > 100 ? "loss" : undefined} className="h-1.5 w-28" label={c.name} />
                          <span className="tnum text-[10px] text-faint">{pct.toFixed(0)}%</span>
                        </div>
                      </td>
                      <td className="px-2 py-2.5 text-right">
                        <Button variant="ghost" size="sm" aria-label={`Hapus ${c.name}`} onClick={() => submit(`/api/budget/categories?id=${c.id}`, "DELETE", () => router.refresh())}>
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        </Button>
                      </td>
                    </tr>
                  );
                })
              )}
              {categories.filter((c) => c.isActive).length > 0 ? (
                <tr className="bg-primary/5">
                  <td className="px-4 py-2.5 text-xs font-bold">Total</td>
                  <td className="tnum px-4 py-2.5 text-right text-xs font-bold text-primary">{fmtIDR(totalPlanned)}</td>
                  <td className="tnum px-4 py-2.5 text-right text-xs font-bold" colSpan={3}>
                    {fmtIDR(categories.filter((c) => c.isActive).reduce((s, c) => s + Number(c.spent), 0))}
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <Dialog open={catOpen} onClose={() => setCatOpen(false)} title="Tambah Kategori Kebutuhan">
        <MutationForm action={(fd) => {
          return submit("/api/budget/categories", "POST", () => setCatOpen(false), { name: fd.get("name"), plannedAmount: fd.get("plannedAmount") });
        }} className="space-y-3">
          <Field label="Nama Kategori" htmlFor="bc-name">
            <Input id="bc-name" name="name" required minLength={2} placeholder="cth. Kebutuhan HK/pangan" />
          </Field>
          <Field label="Nominal Bulanan (IDR)" htmlFor="bc-amt">
            <Input id="bc-amt" name="plannedAmount" type="number" min="0" step="1000" required />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setCatOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan</Button>
          </div>
        </MutationForm>
      </Dialog>

      <Dialog open={txOpen} onClose={() => setTxOpen(false)} title="Catat Pemasukan / Pengeluaran">
        <MutationForm action={(fd) => {
          return submit("/api/finance/transactions", "POST", () => setTxOpen(false), {
            kind: fd.get("kind"),
            amount: fd.get("amount"),
            description: fd.get("description") || undefined,
            categoryId: fd.get("categoryId") || undefined,
          });
        }} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Jenis" htmlFor="tx-kind">
              <Select id="tx-kind" name="kind" defaultValue="EXPENSE">
                <option value="EXPENSE">Pengeluaran</option>
                <option value="INCOME">Pemasukan</option>
              </Select>
            </Field>
            <Field label="Jumlah (IDR)" htmlFor="tx-amt">
              <Input id="tx-amt" name="amount" type="number" min="1" step="1000" required />
            </Field>
          </div>
          <Field label="Kategori" htmlFor="tx-cat">
            <Select id="tx-cat" name="categoryId" defaultValue="">
              <option value="">Tanpa kategori</option>
              {categories.filter((c) => c.isActive).map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Keterangan" htmlFor="tx-desc">
            <Input id="tx-desc" name="description" placeholder="cth. belanja mingguan" />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          <div className="flex justify-end gap-2">
            <Button variant="secondary" type="button" onClick={() => setTxOpen(false)}>Batal</Button>
            <Button type="submit" disabled={loading}>Simpan</Button>
          </div>
        </MutationForm>
      </Dialog>
    </>
  );
}
