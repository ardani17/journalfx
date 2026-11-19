export const JOURNAL_PAGE_SIZES = [50, 100, 200] as const;
export type JournalPageSize = (typeof JOURNAL_PAGE_SIZES)[number];

export type JournalFilters = {
  status?: string;
  result?: string;
  strategyId?: string;
  accountId?: string;
  sort?: "asc" | "desc";
};

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
