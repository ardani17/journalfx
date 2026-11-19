"use client";

import { Brain, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export interface InsightDTO {
  id: string;
  severity: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
  evidence: string;
}

export function InsightsPanel({
  insights,
  coverage,
  aiAvailable,
}: {
  insights: InsightDTO[];
  coverage: { total: number; withJournal: number; complete: number };
  aiAvailable: boolean;
}) {
  const [findings, setFindings] = useState<{ finding: string; evidence: string }[]>([]);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function generate() {
    setPending(true);
    setError("");
    try {
      const response = await fetch("/api/analytics/journal-insights", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Insight AI gagal dibuat. Silakan coba lagi.");
        return;
      }
      setFindings(result.data);
    } catch {
      setError("Insight AI gagal dibuat. Silakan coba lagi.");
    } finally {
      setPending(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" aria-hidden /> AI Journal Insights (explainable)
          <Badge tone="neutral">Analisis retrospektif</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Cakupan data: {coverage.withJournal}/{coverage.total} trade ber-jurnal, {coverage.complete} lengkap.
        </p>
        {aiAvailable && coverage.withJournal >= 3 ? (
          <Button type="button" variant="secondary" size="sm" disabled={pending} onClick={generate}>
            {pending ? "Membuat insight AI…" : "Buat insight AI"}
          </Button>
        ) : null}
        {pending ? <p role="status" className="text-xs text-muted">Analisis jurnal sedang diproses.</p> : null}
        {error ? <p role="alert" className="text-xs text-loss">{error}</p> : null}
        {findings.length > 0 ? (
          <section aria-label="Hasil insight AI" className="space-y-2">
            <h3 className="text-sm font-semibold">Hasil insight AI</h3>
            <ul className="space-y-2">
              {findings.map((item, index) => (
                <li key={index} className="rounded-xl border border-line-soft p-3 text-sm">
                  <p>{item.finding}</p>
                  <p className="mt-1 text-xs text-muted">{item.evidence}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        {insights.length > 0 ? <h3 className="text-sm font-semibold">Insight berbasis aturan</h3> : null}
        {insights.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">
            Belum cukup data untuk insight (butuh minimal 3 trade ber-jurnal).
          </p>
        ) : (
          <ul className="space-y-2.5">
            {insights.map((i) => (
              <li key={i.id} className="rounded-xl border border-line-soft bg-panel-2/50 p-3">
                <p className="flex items-start gap-2 text-sm font-semibold">
                  {i.severity === "positive" ? (
                    <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
                  ) : i.severity === "warning" ? (
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warn" aria-hidden />
                  ) : (
                    <Info className="mt-0.5 h-4 w-4 shrink-0 text-info" aria-hidden />
                  )}
                  {i.title}
                </p>
                <p className="mt-1 pl-6 text-xs leading-relaxed text-muted">{i.detail}</p>
                <p className="mt-1 pl-6 text-[10px] text-faint">{i.evidence}</p>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
