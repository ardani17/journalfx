import Link from "next/link";
import { requireUser } from "@/server/auth";
import { dailyPnl } from "@/server/services/analytics";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtUSDdelta } from "@/lib/money";

import { cn } from "@/lib/utils";
import { EventsPanel } from "./events-panel";
import { listEvents } from "@/server/services/economic-events";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { addUTCDays, calendarDate, zonedPeriod } from "@/lib/dates";

export const metadata = { title: "Kalender Trading" };

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireUser();
  const { m } = await searchParams;
  const now = calendarDate(new Date(), user.timezone);
  const [yy, mm] = m && /^[1-9]\d{3}-(0[1-9]|1[0-2])$/.test(m)
    ? m.split("-").map(Number) as [number, number]
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const month = new Date(Date.UTC(yy, mm - 1, 15));
  const { start: from, end: to } = zonedPeriod("MONTHLY", month, user.timezone);
  const [days, events] = await Promise.all([
    dailyPnl(user.id, from, to),
    listEvents(user.id, { from, to }),
  ]);

  // calendar grid: Monday-first
  const firstDay = calendarDate(from, user.timezone);
  const lead = (firstDay.getUTCDay() + 6) % 7;
  const leadingDates = Array.from({ length: lead }, (_, offset) =>
    addUTCDays(firstDay, offset - lead).toISOString().slice(0, 10));

  const monthPnl = days.reduce((s, d) => s + d.pnl, 0);
  const monthTrades = days.reduce((s, d) => s + d.trades, 0);
  const best = days.reduce((b, d) => (d.pnl > b.pnl ? d : b), { date: "", pnl: -Infinity, trades: 0 });
  const worst = days.reduce((b, d) => (d.pnl < b.pnl ? d : b), { date: "", pnl: Infinity, trades: 0 });

  const prev = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, "0")}`;
  const next = mm === 12 ? `${yy + 1}-01` : `${yy}-${String(mm + 1).padStart(2, "0")}`;

  return (
    <PageShell>
      <PageHeader
        title="Kalender Trading"
        subtitle="P&L realisasi harian — klik tanggal untuk drill-down"
        actions={
          <div className="flex items-center gap-2">
            <Link href={`/calendar?m=${prev}`}><Button variant="secondary" size="icon" aria-label="Bulan sebelumnya"><ChevronLeft className="h-4 w-4" /></Button></Link>
            <span className="tnum min-w-36 text-center text-sm font-semibold">{MONTHS_ID[mm - 1]} {yy}</span>
            <Link href={`/calendar?m=${next}`}><Button variant="secondary" size="icon" aria-label="Bulan berikutnya"><ChevronRight className="h-4 w-4" /></Button></Link>
          </div>
        }
      />

      <div className="flex flex-wrap gap-2 text-xs">
        <Badge tone={monthPnl >= 0 ? "success" : "danger"}>Bulan ini: {fmtUSDdelta(monthPnl)}</Badge>
        <Badge tone="info">{monthTrades} trade</Badge>
        {best.pnl > -Infinity && best.pnl !== 0 ? <Badge tone="success">Terbaik: {fmtUSDdelta(best.pnl)} ({best.date.slice(8)})</Badge> : null}
        {worst.pnl < Infinity && worst.pnl !== 0 ? <Badge tone="danger">Terburuk: {fmtUSDdelta(worst.pnl)} ({worst.date.slice(8)})</Badge> : null}
      </div>

      <EventsPanel events={events.map((e) => ({ id: e.id, at: e.at.toISOString(), currency: e.currency, title: e.title, impact: e.impact }))} />

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-faint">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {leadingDates.map((date) => <div key={date} aria-hidden="true" />)}
            {days.map((c) => (
              <div
                key={c.date}
                className={cn(
                  "flex min-h-20 flex-col rounded-lg border p-2 text-left",
                  c.pnl > 0
                    ? "border-primary/30 bg-primary/8"
                    : c.pnl < 0
                      ? "border-loss/30 bg-loss/8"
                      : "border-line bg-panel-2/40",
                )}
              >
                {c ? (
                  <>
                    <span className="tnum text-[11px] text-faint">{Number(c.date.slice(8))}</span>
                    <span className={cn("tnum mt-1 text-xs font-bold", c.pnl > 0 ? "text-primary" : c.pnl < 0 ? "text-loss" : "text-faint")}>
                      {c.pnl !== 0 ? fmtUSDdelta(c.pnl) : "·"}
                    </span>
                    <span className="tnum mt-auto text-[10px] text-faint">{c.trades > 0 ? `${c.trades} trade` : ""}</span>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </PageShell>
  );
}
