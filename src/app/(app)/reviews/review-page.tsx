import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/lib/api";
import { collectFacts, resolveReview } from "@/server/services/reviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { D, fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { reviewPeriodLabel, type ReviewKind } from "@/lib/review-period";
import { reviewSelectorSchema } from "@/lib/validation/reviews";
import type { DisciplineResult } from "@/lib/finance/discipline";
import { ReviewClient } from "./review-client";

export type ReviewSearchParams = Promise<{
  date?: string | string[];
  reviewId?: string | string[];
  calendar?: string | string[];
}>;

type StoredFacts = {
  tradesCount: number;
  netPnl: string;
  wdActual: string;
  wdRecommended: string | null;
  compoundedAmount: string;
  discipline: DisciplineResult;
};

export async function ReviewPage({ kind, searchParams }: { kind: ReviewKind; searchParams: ReviewSearchParams }) {
  const user = await requireUser();
  const { date, reviewId, calendar } = await searchParams;
  const selection = reviewSelectorSchema.safeParse({ kind, date, reviewId });
  if (!selection.success) notFound();
  const { review, window, timezone } = await resolveReview(user.id, kind, selection.data).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  const closed = review.status === "CLOSED";
  const facts = closed && review.snapshot
    ? review.snapshot as unknown as StoredFacts
    : await collectFacts(user.id, window);
  const titles: Record<string, { t: string; s: string }> = {
    DAILY: { t: "Review Harian", s: "Tutup hari dengan evaluasi disiplin dan rencana besok" },
    WEEKLY: { t: "Review Mingguan", s: "Evaluasi minggu: WD, compounding, dan disiplin eksekusi" },
    MONTHLY: { t: "Review Bulanan", s: "Evaluasi bulanan: cakupan anggaran, hutang, dan milestone" },
  };

  return (
    <PageShell>
      <PageHeader
        title={titles[kind]!.t}
        subtitle={`${reviewPeriodLabel(window, timezone)} · ${titles[kind]!.s}`}
        actions={
          <Badge tone={closed ? "success" : "warn"}>{closed ? "Selesai" : "Draf"}</Badge>
        }
      />

      {/* Facts strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted">{closed ? "Transaksi / P&L saat ditutup" : "Transaksi / P&L Neto"}</p><p className="tnum text-lg font-bold">{facts.tradesCount} · <span className={D(facts.netPnl).gte(0) ? "text-primary" : "text-loss"}>{fmtUSDdelta(facts.netPnl)}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Penarikan Dana Aktual dan Rekomendasi</p><p className="tnum text-lg font-bold">{fmtUSD(facts.wdActual)} <span className="text-xs font-normal text-faint">/ {facts.wdRecommended === null ? "—" : fmtUSD(facts.wdRecommended)}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Jumlah Compounding</p><p className="tnum text-lg font-bold text-primary">{fmtUSD(facts.compoundedAmount)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Discipline Score</p><p className={`tnum text-lg font-bold ${facts.discipline.total !== null && facts.discipline.total >= 70 ? "text-primary" : "text-warn"}`}>{facts.discipline.total !== null ? fmtNum(facts.discipline.total, 1) : "N/A"}</p>
          {facts.discipline.missing.length > 0 ? <p className="mt-0.5 text-[10px] text-faint">Data kurang: {facts.discipline.missing.join(", ")}</p> : null}
        </CardContent></Card>
      </div>

      {/* Discipline breakdown */}
      <Card>
        <CardHeader><CardTitle>Breakdown Disiplin (bobot PRD)</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.discipline.components.map((c) => (
            <div key={c.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">{c.label} <span className="text-faint">({c.weightPct}%)</span></span>
                <span className="tnum text-ink">{c.score !== null ? `${c.score}` : "—"}</span>
              </div>
              <Progress value={c.score ?? 0} tone={c.score !== null && c.score < 50 ? "loss" : undefined} label={c.label} />
              <p className="mt-0.5 text-[10px] text-faint">{c.ratio ?? "belum ada data"}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {closed && review.snapshot ? (
        <Card className="border-primary/30">
          <CardHeader><CardTitle>Snapshot Saat Ditutup (immutable)</CardTitle></CardHeader>
          <CardContent>
            <pre className="tnum max-h-56 overflow-auto rounded-lg border border-line-soft bg-panel-2/60 p-3 text-[11px] leading-relaxed text-muted">
{JSON.stringify(review.snapshot, null, 2)}
            </pre>
          </CardContent>
        </Card>
      ) : null}

      <ReviewClient
        key={review.id}
        kind={kind}
        reviewId={review.id}
        calendar={typeof calendar === "string" ? calendar : undefined}
        closed={closed}
        initial={{
          performance: review.performance ?? "",
          riskNotes: review.riskNotes ?? "",
          reflections: review.reflections ?? "",
          nextPlan: review.nextPlan ?? "",
        }}
      />
    </PageShell>
  );
}
