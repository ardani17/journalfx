import { requireUser } from "@/server/auth";
import { collectFacts, getOrCreateReview } from "@/server/services/reviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { ReviewClient } from "./review-client";

export async function ReviewPage({ kind }: { kind: "DAILY" | "WEEKLY" | "MONTHLY" }) {
  const user = await requireUser();
  const [review, facts] = await Promise.all([
    getOrCreateReview(user.id, kind),
    collectFacts(user.id, kind),
  ]);
  const titles: Record<string, { t: string; s: string }> = {
    DAILY: { t: "Review Harian", s: "Tutup hari dengan evaluasi disiplin dan rencana besok" },
    WEEKLY: { t: "Review Mingguan", s: "Evaluasi minggu: WD, compounding, dan disiplin eksekusi" },
    MONTHLY: { t: "Review Bulanan", s: "Evaluasi bulanan: cakupan anggaran, hutang, dan milestone" },
  };
  const closed = review.status === "CLOSED";

  return (
    <PageShell>
      <PageHeader
        title={titles[kind]!.t}
        subtitle={titles[kind]!.s}
        actions={
          <Badge tone={closed ? "success" : "warn"}>{closed ? "DITUTUP (immutable)" : "TERBUKA"}</Badge>
        }
      />

      {/* Facts strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Trade / P&L Net</p><p className="tnum text-lg font-bold">{facts.tradesCount} · <span className={facts.netPnl.gte(0) ? "text-primary" : "text-loss"}>{fmtUSDdelta(facts.netPnl)}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">WD Aktual vs Rekomendasi</p><p className="tnum text-lg font-bold">{fmtUSD(facts.wdActual)} <span className="text-xs font-normal text-faint">/ {fmtUSD(facts.wdRecommended)}</span></p></CardContent></Card>
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
        kind={kind}
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
