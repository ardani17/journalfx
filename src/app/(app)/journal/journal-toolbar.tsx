"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { tradeStatusLabel } from "@/lib/trading-labels";
import { Plus, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/misc";
import { Field, Input, Select } from "@/components/ui/field";
import { Mt5ImportResult } from "@/components/journal/mt5-import-result";
import type { ImportReport } from "@/server/services/imports";
import { getJournalPageSize, journalDateRange, journalHref, JOURNAL_PAGE_SIZES, type JournalFilters, type JournalPageSize } from "./journal-query";

interface Props {
  accounts: { id: string; name: string; currency: string; isActive: boolean }[];
  strategies: { id: string; name: string }[];
  active: JournalFilters;
  pageSize: JournalPageSize;
  dateError?: string;
}

function DateRangeForm({ active, pageSize, dateError }: Pick<Props, "active" | "pageSize" | "dateError">) {
  const router = useRouter();
  const [error, setError] = useState(dateError);

  function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const dateFrom = String(data.get("dateFrom") ?? "");
    const dateTo = String(data.get("dateTo") ?? "");
    const range = journalDateRange(dateFrom, dateTo);
    setError(range.error);
    if (!range.error) router.push(journalHref({ ...active, dateFrom, dateTo }, 1, pageSize));
  }

  return (
    <form onSubmit={apply} aria-label="Filter rentang tanggal">
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Tanggal mulai" htmlFor="journal-date-from">
          <Input id="journal-date-from" name="dateFrom" type="date" defaultValue={active.dateFrom} />
        </Field>
        <Field label="Tanggal akhir" htmlFor="journal-date-to">
          <Input id="journal-date-to" name="dateTo" type="date" defaultValue={active.dateTo} />
        </Field>
        <Button type="submit" size="sm" variant="secondary">Terapkan</Button>
        <Button type="button" size="sm" variant="ghost" onClick={(event) => {
          const form = event.currentTarget.form;
          if (form) {
            for (const input of form.querySelectorAll("input[type=date]")) (input as HTMLInputElement).value = "";
          }
          setError(undefined);
          router.push(journalHref({ ...active, dateFrom: undefined, dateTo: undefined }, 1, pageSize));
        }}>Hapus rentang</Button>
      </div>
      {error ? <p className="mt-1 text-xs text-loss" role="alert">{error}</p> : null}
    </form>
  );
}

export function JournalToolbar({ accounts, strategies, active, pageSize, dateError }: Props) {
  const router = useRouter();
  const [importOpen, setImportOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);
  const importAccounts = accounts.filter((account) => account.isActive);

  function setFilter(key: keyof JournalFilters, value: string) {
    router.push(journalHref({ ...active, [key]: value }, 1, pageSize));
  }

  async function doImport(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setReport(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih berkas riwayat transaksi MT5 (.xlsx).");
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
      <DateRangeForm key={JSON.stringify([active.dateFrom, active.dateTo, dateError])} active={active} pageSize={pageSize} dateError={dateError} />
      <div className="flex flex-wrap items-center gap-2">
        <Select
          aria-label="Filter status"
          value={active.status ?? ""}
          onChange={(e) => setFilter("status", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Status</option>
          {(["OPEN", "PARTIAL", "CLOSED", "CANCELLED"] as const).map((value) => (
            <option key={value} value={value}>{tradeStatusLabel[value]}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter strategi"
          value={active.strategyId ?? ""}
          onChange={(e) => setFilter("strategyId", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua strategi</option>
          {strategies.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </Select>
        <Select
          aria-label="Filter hasil"
          value={active.result ?? ""}
          onChange={(e) => setFilter("result", e.target.value)}
          className="h-8 w-auto min-w-28 text-xs"
        >
          <option value="">Semua Hasil</option>
          <option value="win">Untung</option>
          <option value="loss">Rugi</option>
          <option value="be">Impas</option>
        </Select>
        <Select
          aria-label="Filter akun"
          value={active.accountId ?? ""}
          onChange={(e) => setFilter("accountId", e.target.value)}
          className="h-8 w-auto min-w-32 text-xs"
        >
          <option value="">Semua Akun</option>
          {accounts.map((a) => (
            <option key={a.id} value={a.id}>{a.name}</option>
          ))}
        </Select>
        <Select
          aria-label="Urutan tanggal"
          value={active.sort ?? "desc"}
          onChange={(e) => setFilter("sort", e.target.value)}
          className="h-8 w-auto text-xs"
        >
          <option value="desc">Terbaru dulu</option>
          <option value="asc">Terlama dulu</option>
        </Select>
        <Select
          aria-label="Transaksi per halaman"
          value={pageSize}
          onChange={(e) => router.push(journalHref(active, 1, getJournalPageSize(e.target.value)))}
          className="h-8 w-auto text-xs"
        >
          {JOURNAL_PAGE_SIZES.map((size) => (
            <option key={size} value={size}>{size} per halaman</option>
          ))}
        </Select>

        <div className="ml-auto flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
            <Upload className="h-3.5 w-3.5" aria-hidden /> Impor
          </Button>
          <Link href="/journal/new">
            <Button size="sm">
              <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah Transaksi
            </Button>
          </Link>
        </div>
      </div>

      <Dialog open={importOpen} onClose={() => setImportOpen(false)} title="Impor Riwayat MT5">
        <form onSubmit={doImport} className="space-y-3">
          <p className="text-xs leading-relaxed text-muted">
            Unggah laporan riwayat transaksi MT5 (.xlsx) untuk mencatat posisi, setoran, dan penarikan. Entri yang sudah diimpor ke akun tujuan akan dilewati.
          </p>
          <Field label="Akun Tujuan" htmlFor="imp-account">
            <Select id="imp-account" name="accountId" required defaultValue={importAccounts[0]?.id ?? ""}>
              {importAccounts.length === 0 && <option value="">Belum ada akun trading aktif</option>}
              {importAccounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </Select>
          </Field>
          <Field label="Berkas XLSX" htmlFor="imp-file" hint="Maks 5 MB">
            <Input id="imp-file" name="file" type="file" accept=".xlsx" required />
          </Field>
          {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
          {report && <Mt5ImportResult report={report} />}
          <div className="flex justify-end gap-2 pt-1">
            <Button type="button" variant="secondary" onClick={() => setImportOpen(false)}>Tutup</Button>
            <Button type="submit" disabled={loading || importAccounts.length === 0}>{loading ? "Mengimpor…" : "Impor"}</Button>
          </div>
        </form>
      </Dialog>
    </>
  );
}
