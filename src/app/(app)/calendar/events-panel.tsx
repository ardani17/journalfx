"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { CalendarClock, Plus, Trash2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input, Select } from "@/components/ui/field";
import { fmtDateID } from "@/lib/dates";

interface Ev {
  id: string;
  at: string;
  currency: string;
  title: string;
  impact: string;
}

export function EventsPanel({ events }: { events: Ev[] }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function add(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const raw = String(fd.get("at") ?? ""); // datetime-local
    try {
      const res = await fetch("/api/economic-events", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          at: new Date(raw).toISOString(),
          currency: fd.get("currency"),
          title: fd.get("title"),
          impact: fd.get("impact"),
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
  }

  async function remove(id: string) {
    await fetch(`/api/economic-events?id=${id}`, { method: "DELETE" });
    router.refresh();
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <CalendarClock className="h-4 w-4 text-primary" aria-hidden /> Kalender Ekonomi (manual)
          <Badge tone="neutral">{events.length} event</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Catat berita penting (NFP, FOMC, CPI…) secara manual. Event dalam ±2 jam dari waktu entry
          trade ditampilkan sebagai konteks di detail jurnal — membantu evaluasi keputusan trading
          saat news, bukan sinyal untuk masuk/keluar pasar.
        </p>
        {events.length === 0 ? (
          <p className="py-4 text-center text-xs text-faint">Belum ada event ekonomi tercatat.</p>
        ) : (
          <ul className="space-y-1.5">
            {events.slice(0, 8).map((ev) => (
              <li key={ev.id} className="flex items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2 text-xs">
                <Badge tone={ev.impact === "high" ? "danger" : ev.impact === "medium" ? "warn" : "neutral"}>{ev.currency}</Badge>
                <span className="tnum shrink-0 text-faint">{fmtDateID(ev.at, "d MMM HH:mm")}</span>
                <span className="min-w-0 flex-1 truncate">{ev.title}</span>
                <button onClick={() => remove(ev.id)} aria-label={`Hapus ${ev.title}`} className="text-faint hover:text-loss">
                  <Trash2 className="h-3.5 w-3.5" aria-hidden />
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button size="sm" variant="secondary" onClick={() => setOpen(true)}>
          <Plus className="h-3.5 w-3.5" aria-hidden /> Tambah Event
        </Button>

        {open ? (
          <form onSubmit={add} className="space-y-3 rounded-xl border border-line p-3">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Waktu" htmlFor="ev-at">
                <Input id="ev-at" name="at" type="datetime-local" required />
              </Field>
              <Field label="Mata Uang" htmlFor="ev-cur">
                <Select id="ev-cur" name="currency" defaultValue="USD">
                  <option value="USD">USD</option>
                  <option value="EUR">EUR</option>
                  <option value="GBP">GBP</option>
                  <option value="JPY">JPY</option>
                  <option value="CNY">CNY</option>
                  <option value="IDR">IDR</option>
                </Select>
              </Field>
            </div>
            <Field label="Judul" htmlFor="ev-title">
              <Input id="ev-title" name="title" required minLength={2} placeholder="cth. NFP, FOMC Rate Decision" />
            </Field>
            <Field label="Dampak" htmlFor="ev-impact">
              <Select id="ev-impact" name="impact" defaultValue="medium">
                <option value="low">Rendah</option>
                <option value="medium">Sedang</option>
                <option value="high">Tinggi</option>
              </Select>
            </Field>
            {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
            <div className="flex justify-end gap-2">
              <Button variant="secondary" type="button" onClick={() => setOpen(false)}>Batal</Button>
              <Button type="submit" disabled={loading}>Simpan</Button>
            </div>
          </form>
        ) : null}
      </CardContent>
    </Card>
  );
}
