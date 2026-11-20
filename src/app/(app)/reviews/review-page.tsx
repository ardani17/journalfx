import Link from "next/link";
import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { ApiError } from "@/lib/api";
import { collectFacts, resolveReview } from "@/server/services/reviews";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/misc";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { D, fmtNum, fmtUSD, fmtUSDdelta } from "@/lib/money";
import { calendarHref, dailyPnlLabel, localDateKey, reviewHref, reviewPeriodLabel, type ReviewKind } from "@/lib/review-period";
import { reviewSelectorSchema } from "@/lib/validation/reviews";
import type { DisciplineResult } from "@/lib/finance/discipline";
import { dailyPnl } from "@/server/services/analytics";
import { fmtCalendarDateID, fmtDateTimeID } from "@/lib/dates";
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
  winRate: number | null;
  balance: string;
  budgetCoveragePct: number | null;
};
const labelID = (label: string) => label === "Setup" ? "Strategi" : label === "Stop Loss" ? "SL" : label;

export async function ReviewPage({ kind, searchParams }: { kind: ReviewKind; searchParams: ReviewSearchParams }) {
  const user = await requireUser();
  const { date, reviewId, calendar } = await searchParams;
  const selection = reviewSelectorSchema.safeParse({ kind, date, reviewId });
  if (!selection.success) notFound();
  const { review, window, timezone, date: selectedDate } = await resolveReview(user.id, kind, selection.data).catch((error: unknown) => {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) notFound();
    throw error;
  });
  const closed = review?.status === "CLOSED";
  const calendarDate = reviewSelectorSchema.shape.date.safeParse(calendar).data;
  const historical = window.end <= new Date();
  const unavailable = historical ? "Data historis tidak tersedia" : "—";
  const today = localDateKey(new Date(), timezone);
  const [facts, days] = await Promise.all([
    closed && review.snapshot ? review.snapshot as unknown as StoredFacts : collectFacts(user.id, window),
    kind !== "DAILY" ? dailyPnl(user.id, window.start, window.end) : [],
  ]);
  const titles: Record<string, { t: string; s: string }> = {
    DAILY: { t: "Review Harian", s: "Tutup hari dengan evaluasi disiplin dan rencana besok" },
    WEEKLY: { t: "Review Mingguan", s: "Evaluasi penarikan dana, pemajemukan, dan disiplin eksekusi" },
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
      <nav aria-label="Kembali dari review" className="flex flex-wrap gap-4 text-sm">
        <Link href={calendarHref(calendarDate ?? localDateKey(window.start, timezone))} className="text-primary hover:underline">
          Kembali ke Kalender
        </Link>
        <Link href={calendarDate ? `/reports?calendar=${calendarDate}` : "/reports"} className="text-primary hover:underline">
          Review Periodik
        </Link>
      </nav>

      {/* Facts strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card><CardContent className="p-4"><p className="text-xs text-muted">{closed ? "Transaksi / P&L saat ditutup" : "Transaksi / P&L Neto"}</p><p className="tnum text-lg font-bold">{facts.tradesCount} · <span className={D(facts.netPnl).gte(0) ? "text-primary" : "text-loss"}>{fmtUSDdelta(facts.netPnl)}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Penarikan Dana Aktual dan Rekomendasi</p><p className="tnum text-lg font-bold">{fmtUSD(facts.wdActual)} <span className="text-xs font-normal text-faint">/ {facts.wdRecommended === null ? unavailable : fmtUSD(facts.wdRecommended)}</span></p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Laba Ditahan</p><p className="tnum text-lg font-bold text-primary">{fmtUSD(facts.compoundedAmount)}</p></CardContent></Card>
        <Card><CardContent className="p-4"><p className="text-xs text-muted">Skor Disiplin</p><p className={`tnum text-lg font-bold ${facts.discipline.total !== null && facts.discipline.total >= 70 ? "text-primary" : "text-warn"}`}>{facts.discipline.total !== null ? fmtNum(facts.discipline.total, 1) : "N/A"}</p>
          {facts.discipline.missing.length > 0 ? <p className="mt-0.5 text-[10px] text-faint">Data kurang: {facts.discipline.missing.map(labelID).join(", ")}</p> : null}
        </CardContent></Card>
      </div>

      {days.length ? (
        <Card>
          <CardHeader><CardTitle>P&L Neto Harian</CardTitle></CardHeader>
          <CardContent>
            {closed ? <p className="mb-3 text-xs text-muted">Rincian ini memakai data ledger terkini.</p> : null}
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {days.map((day) => {
                const label = fmtCalendarDateID(day.date);
                return (
                  <li key={day.date} className="flex items-center justify-between gap-2 rounded-lg border border-line px-3 py-2 text-xs">
                    {day.date <= today ? (
                      <Link href={reviewHref("DAILY", { date: day.date, calendar: day.date })} prefetch={false} className="font-medium text-primary hover:underline">{label}</Link>
                    ) : <span>{label}</span>}
                    <span className="tnum text-right">
                      {dailyPnlLabel(day.pnl, day.hasActivity, day.hasRealizedPnl)}
                      {day.hasRealizedPnl ? ` · ${fmtUSDdelta(day.pnl)}` : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      ) : null}

      {/* Discipline breakdown */}
      <Card>
        <CardHeader><CardTitle>Rincian Disiplin</CardTitle></CardHeader>
        <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {facts.discipline.components.map((c) => (
            <div key={c.key}>
              <div className="mb-1 flex items-center justify-between text-xs">
                <span className="text-muted">{labelID(c.label)} <span className="text-faint">({fmtNum(c.weightPct, 0)}%)</span></span>
                <span className="tnum text-ink">{c.score !== null ? fmtNum(c.score, 1) : "—"}</span>
              </div>
              <Progress value={c.score ?? 0} tone={c.score !== null && c.score < 50 ? "loss" : undefined} label={labelID(c.label)} />
              <p className="mt-0.5 text-[10px] text-faint">{c.ratio ?? (historical && c.key === "risk" ? unavailable : "belum ada data")}</p>
            </div>
          ))}
        </CardContent>
      </Card>

      {closed && review.snapshot ? (
        <Card className="border-primary/30">
          <CardHeader><CardTitle>Ringkasan Saat Ditutup</CardTitle></CardHeader>
          <CardContent>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 lg:grid-cols-4">
              <div><dt className="text-xs text-muted">Waktu penutupan</dt><dd>{review.closedAt ? fmtDateTimeID(review.closedAt, timezone) : "—"}</dd></div>
              <div><dt className="text-xs text-muted">Saldo</dt><dd>{fmtUSD(facts.balance)}</dd></div>
              <div><dt className="text-xs text-muted">Tingkat kemenangan</dt><dd>{facts.winRate === null ? "—" : `${fmtNum(facts.winRate, 1)}%`}</dd></div>
              <div><dt className="text-xs text-muted">Cakupan anggaran</dt><dd>{facts.budgetCoveragePct === null ? unavailable : `${fmtNum(facts.budgetCoveragePct, 1)}%`}</dd></div>
            </dl>
          </CardContent>
        </Card>
      ) : null}

      <ReviewClient
        key={selection.data.reviewId ?? selectedDate}
        kind={kind}
        reviewId={review?.id}
        date={selectedDate}
        calendar={calendarDate}
        closed={closed}
        initial={{
          performance: review?.performance ?? "",
          riskNotes: review?.riskNotes ?? "",
          reflections: review?.reflections ?? "",
          nextPlan: review?.nextPlan ?? "",
        }}
      />
    </PageShell>
  );
}
