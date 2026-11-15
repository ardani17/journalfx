"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

export function RiskSettingsForm({
  initial,
}: {
  initial: {
    riskPerTrade: number;
    dailyLossLimit: number;
    weeklyLossLimit: number;
    ddReview: number;
    maxOpenRisk: number;
    equityMode: "balance" | "equity";
  };
}) {
  const router = useRouter();
  const [msg, setMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = {
      riskPerTrade: fd.get("riskPerTrade"),
      dailyLossLimit: fd.get("dailyLossLimit"),
      weeklyLossLimit: fd.get("weeklyLossLimit"),
      ddReview: fd.get("ddReview"),
      maxOpenRisk: fd.get("maxOpenRisk"),
      equityMode: fd.get("equityMode"),
    };
    try {
      const res = await fetch("/api/risk/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      setMsg(res.ok && body.ok ? "Pengaturan risiko tersimpan." : (body.error ?? "Gagal menyimpan"));
      if (res.ok && body.ok) router.refresh();
    } catch {
      setMsg("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader><CardTitle>Pengaturan Batas Risiko</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={submit} className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Risiko / Trade (%)" htmlFor="rs-trade">
              <Input id="rs-trade" name="riskPerTrade" type="number" step="0.01" min="0.01" max="100" defaultValue={initial.riskPerTrade} required />
            </Field>
            <Field label="Batas Loss Harian (%)" htmlFor="rs-day">
              <Input id="rs-day" name="dailyLossLimit" type="number" step="0.01" min="0.01" max="100" defaultValue={initial.dailyLossLimit} required />
            </Field>
            <Field label="Batas Loss Mingguan (%)" htmlFor="rs-week">
              <Input id="rs-week" name="weeklyLossLimit" type="number" step="0.01" min="0.01" max="100" defaultValue={initial.weeklyLossLimit} required />
            </Field>
            <Field label="Ambang Review DD (%)" htmlFor="rs-dd">
              <Input id="rs-dd" name="ddReview" type="number" step="0.01" min="0.01" max="100" defaultValue={initial.ddReview} required />
            </Field>
            <Field label="Risiko Terbuka Maks (%)" htmlFor="rs-open">
              <Input id="rs-open" name="maxOpenRisk" type="number" step="0.01" min="0.01" max="100" defaultValue={initial.maxOpenRisk} required />
            </Field>
            <Field label="Dasar Perhitungan" htmlFor="rs-mode">
              <Select id="rs-mode" name="equityMode" defaultValue={initial.equityMode}>
                <option value="balance">Balance</option>
                <option value="equity">Equity</option>
              </Select>
            </Field>
          </div>
          {msg ? <p className="text-xs text-primary" role="status">{msg}</p> : null}
          <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Pengaturan"}</Button>
        </form>
      </CardContent>
    </Card>
  );
}
