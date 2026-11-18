"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/field";
import { Mt5ImportResult } from "@/components/journal/mt5-import-result";
import type { ImportReport } from "@/server/services/imports";

interface Props {
  accounts: { id: string; name: string }[];
  strategies: { id: string; name: string }[];
  active: { status?: string; result?: string; strategyId?: string; accountId?: string };
}

export function JournalToolbar({ accounts, strategies, active }: Props) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  function setParam(key: string, value: string) {
    const url = new URL(window.location.href);
    if (value) url.searchParams.set(key, value);
    else url.searchParams.delete(key);
    router.push(url.pathname + "?" + url.searchParams.toString());
  }

  async function doImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setReport(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih file Trade History MT5 (.xlsx)");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/trades/import", {
        method: "POST",
        body: fd,
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Impor gagal");
        return;
      }
      setReport(body.data);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter status"
          value={active.status ?? ""}
          onChange={(e) => setParam("status", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Status</option>
          <option value="OPEN">Open</option>
          <option value="PARTIAL">Partial</option>
          <option value="CLOSED">Closed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <Select
          aria-label="Filter setup"
          value={active.strategyId ?? ""}
          onChange={(e) => setParam("strategyId", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Setup</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter hasil"
          value={active.result ?? ""}
          onChange={(e) => setParam("result", e.target.value)}
          className="h-8 w-auto min-w-28 text-xs"
        >
          <option value="">Semua Hasil</option>
          <option value="win">Profit</option>
          <option value="loss">Loss</option>
          <option value="be">Break Even</option>
        </Select>
        <Select
          aria-label="Filter akun"
          value={active.accountId ?? ""}
          onChange={(e) => setParam("accountId", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" aria-hidden /> Impor
          </Button>
          <Link href="/journal/new">
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah Trade
            </Button>
          </Link>
        </div>
      </div>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Impor Riwayat MT5">
        <form onSubmit={doImport} className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            Unggah Trade History MT5 (.xlsx) untuk mencatat posisi, deposit, dan withdrawal. Entri yang sudah diimpor ke akun tujuan akan dilewati.
          </p>
          <Field label="Akun Tujuan" htmlFor="imp-account">
            <Select id="imp-account" name="accountId" required defaultValue={accounts[0]?.id ?? ""}>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="File XLSX" htmlFor="imp-file" hint="Maks 5 MB">
            <Input id="imp-file" name="file" type="file" accept=".xlsx" required />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          {report && <Mt5ImportResult report={report} />}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>Tutup</Button>
            <Button type="submit" disabled={loading}>{loading ? "Mengimpor…" : "Impor"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
