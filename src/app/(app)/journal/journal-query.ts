import { addUTCDays, calendarInstant } from "@/lib/dates";

export const JOURNAL_PAGE_SIZES = [50, 100, 200] as const;
export type JournalPageSize = (typeof JOURNAL_PAGE_SIZES)[number];

export type JournalFilters = {
  status?: string;
  result?: string;
  strategyId?: string;
  accountId?: string;
  sort?: "asc" | "desc";
  dateFrom?: string;
  dateTo?: string;
};

function parseDate(value: string | undefined) {
  if (!value || !/^[1-9]\d{3}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value ? date : undefined;
}

export function journalDateRange(dateFrom?: string, dateTo?: string, timezone = "UTC") {
  const start = parseDate(dateFrom);
  const end = parseDate(dateTo);
  if ((dateFrom && !start) || (dateTo && !end)) {
    return { error: "Masukkan tanggal yang valid." };
  }
  if (start && end && start > end) {
    return { error: "Tanggal akhir harus sama atau setelah tanggal mulai." };
  }
  return {
    from: start ? calendarInstant(start, timezone) : undefined,
    to: end ? calendarInstant(addUTCDays(end, 1), timezone) : undefined,
  };
}

export function getJournalPageSize(value: string | string[] | undefined): JournalPageSize {
  return JOURNAL_PAGE_SIZES.find((size) => String(size) === value) ?? JOURNAL_PAGE_SIZES[0];
}

export function journalHref(filters: JournalFilters, page: number, pageSize: JournalPageSize) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  params.set("page", String(page));
  params.set("pageSize", String(pageSize));
  return `/journal?${params}`;
}
