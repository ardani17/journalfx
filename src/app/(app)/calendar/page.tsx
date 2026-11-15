import Link from "next/link";
import { requireUser } from "@/server/auth";
import { dailyPnl } from "@/server/services/analytics";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { fmtUSDdelta } from "@/lib/money";

import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export const metadata = { title: "Kalender Trading" };

const MONTHS_ID = ["Januari","Februari","Maret","April","Mei","Juni","Juli","Agustus","September","Oktober","November","Desember"];

export default async function CalendarPage({
  searchParams,
}: {
  searchParams: Promise<{ m?: string }>;
}) {
  const user = await requireUser();
  const { m } = await searchParams;
  const now = new Date();
  const [yy, mm] = m && /^\d{4}-\d{2}$/.test(m)
    ? m.split("-").map(Number) as [number, number]
    : [now.getUTCFullYear(), now.getUTCMonth() + 1];

  const from = new Date(Date.UTC(yy, mm - 1, 1));
  const to = new Date(Date.UTC(yy, mm, 1));
  const days = await dailyPnl(user.id, from, to);

  // calendar grid: Monday-first
  const lead = (from.getUTCDay() + 6) % 7;
  const cells: ({ date: string; pnl: number; trades: number; day: number } | null)[] = [];
  for (let i = 0; i < lead; i++) cells.push(null);
  for (const d of days) cells.push({ ...d, day: Number(d.date.slice(8)) });

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

      <Card>
        <CardContent className="p-3">
          <div className="mb-2 grid grid-cols-7 gap-1.5 text-center text-[10px] font-semibold uppercase tracking-wide text-faint">
            {["Sen", "Sel", "Rab", "Kam", "Jum", "Sab", "Min"].map((d) => <div key={d}>{d}</div>)}
          </div>
          <div className="grid grid-cols-7 gap-1.5">
            {cells.map((c, i) => (
              <div
                key={i}
                className={cn(
                  "flex min-h-20 flex-col rounded-lg border p-2 text-left",
                  c === null
                    ? "border-transparent"
                    : c.pnl > 0
                      ? "border-primary/30 bg-primary/8"
                      : c.pnl < 0
                        ? "border-loss/30 bg-loss/8"
                        : "border-line bg-panel-2/40",
                )}
              >
                {c ? (
                  <>
                    <span className="tnum text-[11px] text-faint">{c.day}</span>
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
