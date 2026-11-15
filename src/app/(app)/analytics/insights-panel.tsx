"use client";

import { Brain, CheckCircle2, AlertTriangle, Info } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

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
}: {
  insights: InsightDTO[];
  coverage: { total: number; withJournal: number; complete: number };
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Brain className="h-4 w-4 text-primary" aria-hidden /> AI Journal Insights (explainable)
          <Badge tone="neutral">rule-based · bukan prediksi</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Setiap insight dihasilkan dari data jurnal Anda sendiri, dengan bukti dan ukuran sampel
          yang eksplisit — bukan model black-box dan bukan sinyal trading.
          Cakupan data: {coverage.withJournal}/{coverage.total} trade ber-jurnal, {coverage.complete} lengkap.
        </p>
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
