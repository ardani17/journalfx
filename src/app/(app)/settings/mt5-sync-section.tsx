"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { RefreshCw, Upload } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Select } from "@/components/ui/field";
import { fmtDateID } from "@/lib/dates";
import { Mt5ImportResult } from "@/components/journal/mt5-import-result";
import type { ImportReport } from "@/server/services/imports";

export function Mt5SyncSection({
  accounts,
  status,
}: {
  accounts: { id: string; name: string }[];
  status: { lastSyncAt: string | null; lastSyncResult: string | null; stale: boolean; staleHours: number | null };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImportReport | null>(null);
  const [loading, setLoading] = useState(false);

  async function sync(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setResult(null);
    const fd = new FormData(e.currentTarget);
    const file = fd.get("file");
    if (!(file instanceof File) || file.size === 0) {
      setError("Pilih file Trade History MT5 (.xlsx)");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch("/api/integrations/mt5/sync", { method: "POST", body: fd });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Sync gagal");
        return;
      }
      setResult(json.data);
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" aria-hidden /> Sinkronisasi MT5 (read-only)
          {status.stale ? (
            <Badge tone="warn">{status.lastSyncAt ? `Data ${status.staleHours} jam lalu` : "Belum pernah sync"}</Badge>
          ) : (
            <Badge tone="success">Segar</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Unggah Trade History MT5 (.xlsx) untuk mencatat posisi, deposit, dan withdrawal. Entri yang sudah diimpor ke akun tujuan akan dilewati.
        </p>
        {status.lastSyncAt ? (
          <p className="tnum text-[11px] text-faint">
            Sync terakhir: {fmtDateID(status.lastSyncAt, "d MMM yyyy, HH:mm")}
            {status.lastSyncResult ? ` — ${status.lastSyncResult}` : ""}
          </p>
        ) : null}
        <form onSubmit={sync} className="flex flex-wrap items-end gap-3">
          <Field label="Akun" htmlFor="m5-account" className="min-w-40">
            <Select id="m5-account" name="accountId" defaultValue={accounts[0]?.id ?? ""} required>
              {accounts.length === 0 && <option value="">Belum ada akun trading aktif</option>}
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="File XLSX" htmlFor="m5-file" className="min-w-52" hint="Maks 5 MB">
            <input
              id="m5-file"
              name="file"
              type="file"
              accept=".xlsx"
              required
              className="w-full rounded-lg border border-line bg-panel-2 px-3 py-2 text-xs text-muted file:mr-3 file:rounded-md file:border-0 file:bg-indigo-soft/20 file:px-2.5 file:py-1 file:text-xs file:text-indigo-soft"
            />
          </Field>
          <Button type="submit" disabled={loading || accounts.length === 0}>
            <Upload className="h-4 w-4" aria-hidden /> {loading ? "Menyinkronkan…" : "Sinkronkan"}
          </Button>
        </form>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {result && <Mt5ImportResult report={result} />}
      </CardContent>
    </Card>
  );
}
