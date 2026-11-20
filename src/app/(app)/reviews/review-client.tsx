"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Lock, Save, Undo2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Textarea } from "@/components/ui/field";
import { reviewHref, type ReviewKind } from "@/lib/review-period";

export function ReviewClient({
  kind,
  reviewId,
  calendar,
  closed,
  initial,
}: {
  kind: ReviewKind;
  reviewId: string;
  calendar?: string;
  closed: boolean;
  initial: { performance: string; riskNotes: string; reflections: string; nextPlan: string };
}) {
  const router = useRouter();
  const [fields, setFields] = useState(initial);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function call(method: "PUT" | "POST", body: Record<string, string>, okMsg: string) {
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/reviews", {
        method,
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind, reviewId, ...body }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Operasi gagal");
        return;
      }
      if (body.action === "correct") {
        router.push(reviewHref(kind, { reviewId: json.data.id, calendar }));
      } else {
        setMsg(okMsg);
        router.refresh();
      }
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  const set = (k: keyof typeof fields) => (e: React.ChangeEvent<HTMLTextAreaElement>) =>
    setFields({ ...fields, [k]: e.target.value });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Catatan Review {closed ? "(immutable — gunakan koreksi)" : ""}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="grid gap-3 lg:grid-cols-2">
          <Field label="Performa" htmlFor="rv-perf"><Textarea id="rv-perf" rows={3} value={fields.performance} onChange={set("performance")} disabled={closed} /></Field>
          <Field label="Catatan Risiko" htmlFor="rv-risk"><Textarea id="rv-risk" rows={3} value={fields.riskNotes} onChange={set("riskNotes")} disabled={closed} /></Field>
          <Field label="Refleksi" htmlFor="rv-refl"><Textarea id="rv-refl" rows={3} value={fields.reflections} onChange={set("reflections")} disabled={closed} /></Field>
          <Field label="Rencana Berikutnya" htmlFor="rv-plan"><Textarea id="rv-plan" rows={3} value={fields.nextPlan} onChange={set("nextPlan")} disabled={closed} /></Field>
        </div>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {msg ? <p className="text-xs text-primary" role="status">{msg}</p> : null}
        <div className="flex justify-end gap-2">
          {closed ? (
            <Button variant="secondary" disabled={loading} onClick={() => call("POST", { action: "correct" }, "Revisi dibuat.")}>
              <Undo2 className="h-4 w-4" aria-hidden /> Buat Koreksi
            </Button>
          ) : (
            <>
              <Button variant="secondary" disabled={loading} onClick={() => call("PUT", fields, "Catatan tersimpan.")}>
                <Save className="h-4 w-4" aria-hidden /> Simpan Catatan
              </Button>
              <Button disabled={loading} onClick={() => call("POST", { action: "close" }, "Review ditutup dan snapshot tersimpan.")}>
                <Lock className="h-4 w-4" aria-hidden /> Tutup Periode
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
