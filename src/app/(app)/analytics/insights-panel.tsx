"use client";

import { Brain, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AI_JOURNAL_HISTORY_PATH, AI_JOURNAL_PROVIDER_TIMEOUT_MS, MIN_AI_JOURNAL_TRADES, type GeneratedAiJournalAnalysis } from "@/lib/ai-journal";
import type { AiJournalPdfInput } from "@/lib/validation/ai-journal-snapshot";
import { AnalysisActions } from "./ai-analysis-actions";
import { AnalysisReport } from "./ai-analysis-report";

export interface InsightDTO {
  id: string;
  severity: "positive" | "warning" | "neutral";
  title: string;
  detail: string;
  evidence: string;
}

function formatElapsed(ms: number) {
  const seconds = Math.floor(ms / 1000);
  return String(Math.floor(seconds / 60)).padStart(2, "0") + ":" + String(seconds % 60).padStart(2, "0");
}

function AnalysisProgress({ startedAt }: { startedAt: number }) {
  const [elapsed, setElapsed] = useState(0);
  useEffect(() => {
    const tick = window.setInterval(() => setElapsed(performance.now() - startedAt), 1000);
    return () => window.clearInterval(tick);
  }, [startedAt]);

  return (
    <div className="space-y-1 text-xs text-muted">
      <p role="status">Analisis transaksi sedang diproses.</p>
      <p>
        Waktu berjalan{" "}
        <span role="timer" aria-label="Waktu analisis berjalan" className="tnum font-semibold text-ink">
          {formatElapsed(elapsed)} / {formatElapsed(AI_JOURNAL_PROVIDER_TIMEOUT_MS)}
        </span>
      </p>
    </div>
  );
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
  const [report, setReport] = useState<Extract<AiJournalPdfInput, { source: "current" }> | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const [error, setError] = useState("");
  const pending = startedAt !== null;
  const enoughTrades = closedTrades >= MIN_AI_JOURNAL_TRADES;
  const canGenerate = aiAvailable && enoughTrades;

  async function generate() {
    setStartedAt(performance.now());
    setError("");
    try {
      const response = await fetch("/api/analytics/journal-insights", { method: "POST", cache: "no-store" });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Analisis AI gagal dibuat. Silakan coba lagi.");
        return;
      }
      const { reportId, receipt, ...analysis } = result.data as GeneratedAiJournalAnalysis;
      setReport({ source: "current", reportId, receipt, analysis });
    } catch {
      setError("Analisis AI gagal dibuat. Silakan coba lagi.");
    } finally {
      setStartedAt(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" aria-hidden /> Hasil Analisis AI
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Seluruh riwayat trade tertutup · {closedTrades} trade dengan P/L tercatat
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" disabled={!canGenerate || pending} onClick={generate}>
            {pending ? "Membuat analisis AI…" : error ? "Coba lagi" : "Buat analisis AI"}
          </Button>
          <Link href={AI_JOURNAL_HISTORY_PATH} className="text-xs font-medium text-primary hover:underline">
            Riwayat analisis
          </Link>
        </div>
        {!aiAvailable ? <p className="text-xs text-muted">Penyedia AI belum dikonfigurasi.</p> : null}
        {!enoughTrades ? (
          <p className="text-xs text-muted">Analisis AI membutuhkan minimal {MIN_AI_JOURNAL_TRADES} trade tertutup dengan P/L tercatat.</p>
        ) : null}
        {canGenerate ? (
          <p className="text-xs text-muted">Setiap permintaan mengirim statistik, pengaturan risiko, dan contoh transaksi berkode anonim ke penyedia AI.</p>
        ) : null}
        {startedAt !== null ? <AnalysisProgress startedAt={startedAt} /> : null}
        {error ? <p role="alert" className="text-xs text-loss">{error}</p> : null}
        {report?.analysis ? (
          <>
            <AnalysisActions key={report.reportId} input={report} />
            <AnalysisReport analysis={report.analysis} previous={pending || Boolean(error)} />
          </>
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
