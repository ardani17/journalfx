"use client";

import { Brain, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MIN_AI_JOURNAL_TRADES, type AiJournalAnalysis } from "@/lib/ai-journal";

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
  closedTrades,
  aiAvailable,
}: {
  insights: InsightDTO[];
  coverage: { total: number; withJournal: number; complete: number };
  closedTrades: number;
  aiAvailable: boolean;
}) {
  const [analysis, setAnalysis] = useState<AiJournalAnalysis | null>(null);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const enoughTrades = closedTrades >= MIN_AI_JOURNAL_TRADES;
  const canGenerate = aiAvailable && enoughTrades;

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
      setAnalysis(result.data);
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
          <Brain className="h-4 w-4 text-primary" aria-hidden /> AI Journal Insights
          <Badge tone="neutral">Analisis retrospektif</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Seluruh riwayat trade tertutup · {closedTrades} trade dengan P/L tercatat
        </p>
        <Button type="button" variant="secondary" size="sm" disabled={!canGenerate || pending} onClick={generate}>
          {pending ? "Membuat insight AI…" : error ? "Coba lagi" : "Buat insight AI"}
        </Button>
        {!aiAvailable ? <p className="text-xs text-muted">Penyedia AI belum dikonfigurasi.</p> : null}
        {!enoughTrades ? (
          <p className="text-xs text-muted">Analisis AI membutuhkan minimal {MIN_AI_JOURNAL_TRADES} trade tertutup dengan P/L tercatat.</p>
        ) : null}
        {canGenerate ? (
          <p className="text-xs text-muted">Saat Anda meminta analisis, ringkasan statistik trade dikirim ke penyedia AI.</p>
        ) : null}
        {pending ? <p role="status" className="text-xs text-muted">Analisis trade sedang diproses.</p> : null}
        {error ? <p role="alert" className="text-xs text-loss">{error}</p> : null}
        {analysis ? (
          <section aria-label="Hasil insight AI" className="space-y-2">
            <h3 className="text-sm font-semibold">{pending || error ? "Hasil insight AI terakhir" : "Hasil insight AI"}</h3>
            <p className="text-xs text-muted">
              {analysis.coverage.closedTrades} trade dianalisis · {analysis.coverage.disciplineTrades} dengan data kepatuhan atau FOMO
            </p>
            <ul className="space-y-2">
              {analysis.findings.map((item) => (
                <li key={item.id} className="space-y-1.5 rounded-xl border border-line-soft p-3 text-sm">
                  <p className="font-medium">{item.finding}</p>
                  <ul className="space-y-1 text-xs text-muted">
                    {item.evidence.map((line, index) => <li key={index}>{line}</li>)}
                  </ul>
                  <p className="text-xs">{item.reviewAction}</p>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
        <h3 className="text-sm font-semibold">Insight berbasis aturan</h3>
        <p className="text-xs text-muted">{coverage.withJournal}/{coverage.total} trade memiliki jurnal terisi · {coverage.complete} lengkap</p>
        {insights.length === 0 ? (
          <p className="py-6 text-center text-xs text-faint">
            Insight berbasis aturan belum tersedia untuk data ini.
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
