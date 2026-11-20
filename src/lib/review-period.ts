import { calendarDate, calendarDayStart, fmtCalendarDateID, zonedPeriod } from "@/lib/dates";

export const reviewKinds = ["DAILY", "WEEKLY", "MONTHLY"] as const;
export type ReviewKind = (typeof reviewKinds)[number];
export type ReviewWindow = { start: Date; end: Date };

export const reviewKindLabel: Record<ReviewKind, string> = {
  DAILY: "Harian",
  WEEKLY: "Mingguan",
  MONTHLY: "Bulanan",
};

export function localDateKey(instant: Date, timezone: string) {
  return calendarDate(instant, timezone).toISOString().slice(0, 10);
}

export function reviewPeriodForDate(kind: ReviewKind, date: string, timezone: string): ReviewWindow {
  const instant = calendarDayStart(new Date(`${date}T00:00:00.000Z`), timezone);
  return zonedPeriod(kind, instant, timezone);
}

export function reviewPeriodLabel(window: ReviewWindow, timezone: string) {
  const first = localDateKey(window.start, timezone);
  const last = localDateKey(new Date(window.end.getTime() - 1), timezone);
  return first === last ? fmtCalendarDateID(first) : `${fmtCalendarDateID(first)} – ${fmtCalendarDateID(last)}`;
}

export function reviewHref(kind: ReviewKind, params: { date?: string; reviewId?: string; calendar?: string } = {}) {
  const query = new URLSearchParams();
  if (params.date) query.set("date", params.date);
  if (params.reviewId) query.set("reviewId", params.reviewId);
  if (params.calendar) query.set("calendar", params.calendar);
  return `/reviews/${kind.toLowerCase()}${query.size ? `?${query}` : ""}`;
}

export function calendarHref(date?: string) {
  return date ? `/calendar?m=${date.slice(0, 7)}&date=${date}#day-${date}` : "/calendar";
}

export function dailyPnlLabel(amount: number, hasActivity: boolean) {
  if (!hasActivity) return "Tanpa transaksi";
  if (amount === 0) return "Impas";
  return amount > 0 ? "Untung" : "Rugi";
}
