"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PieChart } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

interface Bucket {
  id: string;
  kind: string;
  name: string;
  priority: number;
  targetPercent: string | null;
  allocated: string;
}

export function AllocationClient({ buckets }: { buckets: Bucket[] }) {
  const router = useRouter();
  const now = new Date();
  const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - ((now.getUTCDay() + 6) % 7)));
  const nextMonday = new Date(monday); nextMonday.setUTCDate(nextMonday.getUTCDate() + 7);
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const withPct = buckets.filter((b) => Number(b.targetPercent) > 0);
  const pctSum = withPct.reduce((s, b) => s + Number(b.targetPercent), 0);

  async function allocate() {
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/finance/allocations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          periodStart: monday.toISOString(),
          periodEnd: nextMonday.toISOString(),
          amount: Number(amount),
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Alokasi gagal");
        return;
      }
      setMsg(`Teralokasi ke ${json.data.length} bucket sesuai target persen.`);
      setAmount("");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="panel-gradient">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <PieChart className="h-4 w-4 text-primary" aria-hidden /> Alokasikan Profit Minggu Ini
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Periode sumber: <span className="tnum">{monday.toISOString().slice(0, 10)}</span> –{" "}
          <span className="tnum">{nextMonday.toISOString().slice(0, 10)}</span>. Jumlah maksimal =
          profit realisasi periode yang belum dialokasikan (divalidasi server, anti alokasi ganda).
        </p>
        {withPct.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {withPct.map((b) => (
              <span key={b.id} className="rounded-full border border-line bg-panel-2/60 px-2.5 py-1 text-[11px] text-muted">
                {b.name} <span className="tnum text-primary">{Number(b.targetPercent).toFixed(0)}%</span>
              </span>
            ))}
            <span className={`rounded-full border px-2.5 py-1 text-[11px] ${pctSum === 100 ? "border-primary/40 text-primary" : "border-loss/40 text-loss"}`}>
              Total: {pctSum.toFixed(0)}% {pctSum === 100 ? "✓" : " (harus 100%)"}
            </span>
          </div>
        ) : (
          <p className="text-xs text-warn">Belum ada bucket dengan target persen — atur targetPercent bucket (saat ini bucket default belum memilikinya; alokasi memerlukan konfigurasi target).</p>
        )}
        <div className="flex flex-wrap items-end gap-3">
          <Field label="Jumlah Profit (USD)" htmlFor="al-amt" className="w-44">
            <Input id="al-amt" type="number" min="0.01" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="100" />
          </Field>
          <Button onClick={allocate} disabled={loading || !amount || pctSum !== 100}>
            {loading ? "Mengalokasikan…" : "Alokasikan"}
          </Button>
        </div>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {msg ? <p className="text-xs text-primary" role="status">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
