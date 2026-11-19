import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  startOfMonth,
  startOfWeek,
  subDays,
} from "date-fns";

/** All storage is UTC; formatting uses the user's timezone (default Asia/Jakarta). */
export const DEFAULT_TZ = "Asia/Jakarta";

export function isValidTimezone(timezone: string): boolean {
  try { new Intl.DateTimeFormat("en", { timeZone: timezone }).format(); return true; }
  catch { return false; }
}

/** Calendar wall time represented in UTC fields; never use as a stored instant. */
export function calendarDate(at: Date, timezone = DEFAULT_TZ): Date {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit", hourCycle: "h23" }).formatToParts(at);
  const n = (kind: string) => Number(parts.find((p) => p.type === kind)?.value ?? 0);
  return new Date(Date.UTC(n("year"), n("month") - 1, n("day"), n("hour"), n("minute"), n("second")));
}

function calendarInstant(wall: Date, timezone: string): Date {
  let instant = wall;
  for (let i = 0; i < 3; i++) {
    const offset = calendarDate(instant, timezone).getTime() - Math.floor(instant.getTime() / 1000) * 1000;
    instant = new Date(wall.getTime() - offset);
  }
  return instant;
}

export function zonedPeriod(kind: "DAILY" | "WEEKLY" | "MONTHLY", at = new Date(), timezone = DEFAULT_TZ) {
  const wall = calendarDate(at, timezone);
  const window = kind === "WEEKLY" ? utcWeek(wall) : kind === "MONTHLY" ? utcMonth(wall)
    : { start: startOfUTCDay(wall), end: addUTCDays(startOfUTCDay(wall), 1) };
  return { start: calendarInstant(window.start, timezone), end: calendarInstant(window.end, timezone) };
}

export function utcNow(): Date {
  return new Date();
}

export function startOfUTCDay(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

export function addUTCDays(d: Date, days: number): Date {
  const c = new Date(d);
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}

/** Week window (Mon–Sun) in UTC around a date */
export function utcWeek(d: Date): { start: Date; end: Date } {
  const day = d.getUTCDay(); // 0=Sun
  const diffToMon = (day + 6) % 7;
  const start = addUTCDays(startOfUTCDay(d), -diffToMon);
  return { start, end: addUTCDays(start, 7) };
}

export function utcMonth(d: Date): { start: Date; end: Date } {
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const end = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
  return { start, end };
}

export function fmtDate(d: Date | string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  return format(date, pattern);
}

export function fmtDateID(d: Date | string | null | undefined, pattern = "d MMM yyyy"): string {
  if (!d) return "—";
  const date = typeof d === "string" ? new Date(d) : d;
  const months = [
    "Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des",
  ];
  return format(date, pattern).replace(
    /\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g,
    (m) => {
      const idx = ["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"].indexOf(m);
      return idx >= 0 ? (months[idx] ?? m) : m;
    },
  );
}

const calendarDateFormatterID = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: "UTC" });

export function fmtCalendarDateID(date: string): string {
  return calendarDateFormatterID.format(new Date(date));
}

export { addDays, subDays, differenceInCalendarDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format };
