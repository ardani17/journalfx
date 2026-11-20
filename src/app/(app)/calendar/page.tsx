import Link from "next/link";
import { requireUser } from "@/server/auth";
import { dailyPnl } from "@/server/services/analytics";
import { dailyReviewStatuses } from "@/server/services/reviews";
import { CalendarReviewTabs } from "@/components/layout/calendar-review-tabs";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { D, fmtUSDdelta } from "@/lib/money";

import { cn } from "@/lib/utils";
import { EventsPanel } from "./events-panel";
import { listEvents } from "@/server/services/economic-events";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addUTCDays, calendarDate, fmtCalendarDateID, zonedPeriod } from "@/lib/dates";
import { dailyPnlLabel, localDateKey, reviewHref } from "@/lib/review-period";
import { reviewSelectorSchema } from "@/lib/validation/reviews";

export const metadata = { title: "Kalender Trading" };

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string; date?: string }>;
}) {
  const user = await requireUser();
  const { m, date } = await searchParams;
  const selectedDate = reviewSelectorSchema.shape.date.safeParse(date).data;
  const monthKey = selectedDate?.slice(0, 7) ?? m;
  const now = calendarDate(new Date(), user.timezone);
  const today = localDateKey(new Date(), user.timezone);
  const [yy, mm] = monthKey && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(monthKey)
    ? monthKey.split("-").map(Number) as [number, number]
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const month = new Date(Date.UTC(yy, mm - 1, 15));
  const { start: from, end: to } = zonedPeriod("MONTHLY", month, user.timezone);
  const [days, events, reviewStatuses] = await Promise.all([
    dailyPnl(user.id, from, to),
    listEvents(user.id, { from, to }),
    dailyReviewStatuses(user.id, { start: from, end: to }, user.timezone),
  ]);

  // calendar grid: Monday-first
  const firstDay = calendarDate(from, user.timezone);
  const lead = (firstDay.getUTCDay() + 6) % 7;
  const leadingDates = Array.from({ length: lead }, (_, offset) =>
    addUTCDays(firstDay, offset - lead).toISOString().slice(0, 10));

  const monthPnl = days.reduce((sum, day) => sum.plus(day.pnl), D(0));
  const monthTrades = days.reduce((s, d) => s + d.trades, 0);
  const best = days.reduce((b, d) => (d.pnl > b.pnl ? d : b), { date: "", pnl: -Infinity, trades: 0 });
  const worst = days.reduce((b, d) => (d.pnl < b.pnl ? d : b), { date: "", pnl: Infinity, trades: 0 });

  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;

  return (
    <PageShell>
      <PageHeader
        title="Kalender Trading"
        subtitle="Lihat P&L neto dan status review setiap hari."
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?m=${prev}`}><Button variant="secondary" size="icon" aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></Button></Link>
            <span className="tnum min-w-36 text-center text-sm font-semibold">{MONTHS_ID[mm - 1]} {yy}</span>
            <Link href={`/calendar?m=${next}`}><Button variant="secondary" size="icon" aria-label="Bulan berikutnya"><ChevronRight className="h-4 w-4" /></Button></Link>
          </div>
        }
      />

      <CalendarReviewTabs active="calendar" date={selectedDate} />
      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={monthPnl.gte(0) ? "success" : "danger"}>P&L Bulanan {fmtUSDdelta(monthPnl)}</Badge>
        <Badge tone="info">{monthTrades} trade</Badge>
        {best.pnl > -Infinity && best.pnl !== 0 ? <Badge tone="success">Terbaik: {fmtUSDdelta(best.pnl)} ({best.date.slice(8)})</Badge> : null}
        {worst.pnl < Infinity && worst.pnl !== 0 ? <Badge tone="danger">Terburuk: {fmtUSDdelta(worst.pnl)} ({worst.date.slice(8)})</Badge> : null}
      </div>

      <EventsPanel events={events.map((e) => ({ id: e.id, at: e.at.toISOString(), currency: e.currency, title: e.title, impact: e.impact }))} />

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 hidden grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-faint md:grid">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3 md:grid-cols-7">
            {leadingDates.map((date) => <div className="hidden md:block" key={date} aria-hidden="true" />)}
            {days.map((day) => {
              const status = reviewStatuses.get(day.date);
              const dateLabel = fmtCalendarDateID(day.date);
              const statusLabel = status === "CLOSED" ? "Selesai" : status === "OPEN" ? "Draf" : "Belum direview";
              const pnlLabel = dailyPnlLabel(day.pnl, day.hasActivity);
              const className = cn(
                "flex min-h-24 scroll-mt-20 flex-col rounded-lg border p-2 text-left focus-visible:outline-2 focus-visible:outline-primary",
                day.pnl > 0 ? "border-primary/30 bg-primary/8" : day.pnl < 0 ? "border-loss/30 bg-loss/8" : "border-line bg-panel-2/40",
                day.date === selectedDate && "ring-2 ring-primary",
              );
              const content = (
                <>
                  <span className="tnum text-[11px] font-semibold">{dateLabel}</span>
                  <span className={cn("tnum mt-1 text-xs font-bold", day.pnl > 0 ? "text-primary" : day.pnl < 0 ? "text-loss" : "text-muted")}>
                    {day.hasActivity ? fmtUSDdelta(day.pnl) : pnlLabel}
                  </span>
                  {day.hasActivity ? <span className="text-[10px] text-faint">{pnlLabel}</span> : null}
                  {day.hasActivity || status ? <span className="mt-auto pt-1 text-[10px] font-medium text-muted">{statusLabel}</span> : null}
                </>
              );
              const id = `day-${day.date}`;
              return day.date <= today ? (
                <Link key={day.date} id={id} prefetch={false} aria-label={`${dateLabel}, ${pnlLabel}, ${statusLabel}`}
                  className={cn(className, "hover:border-primary/70")} href={reviewHref("DAILY", { date: day.date, calendar: day.date })}>
                  {content}
                </Link>
              ) : <div key={day.date} id={id} className={className}>{content}</div>;
            })}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
