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

export { addDays, subDays, differenceInCalendarDays, startOfWeek, endOfWeek, startOfMonth, endOfMonth, format };
