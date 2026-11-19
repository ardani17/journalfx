"use client";

import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input, Select } from "@/components/ui/field";
import { getJournalPageSize, JOURNAL_PAGE_SIZES, type JournalPageSize } from "../journal/journal-query";

export function CyclePagination({ label, count, children }: {
  label: string;
  count: number;
  children: (firstIndex: number, endIndex: number) => ReactNode;
}) {
  const [size, setSize] = useState<JournalPageSize>(50);
  const [anchor, setAnchor] = useState(0);
  const last = Math.max(0, Math.ceil(count / size) - 1);
  const page = Math.min(last, Math.floor(anchor / size));
  const start = page * size;
  const end = Math.min(start + size, count);
  return (
    <section aria-label={label} className="space-y-2">
      {children(start, end)}
      {count > 0 ? (
        <nav aria-label={`Paginasi ${label}`} className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-muted" aria-live="polite">Siklus {start + 1}–{end} dari {count}</span>
          <Select aria-label="Siklus per halaman" className="h-8 w-auto text-xs" value={size}
            onChange={(event) => { setSize(getJournalPageSize(event.target.value)); setAnchor(start); }}>
            {JOURNAL_PAGE_SIZES.map((value) => <option key={value} value={value}>{value} per halaman</option>)}
          </Select>
          <Button variant="secondary" size="sm" disabled={page === 0} onClick={() => setAnchor(start - size)}>Sebelumnya</Button>
          <Button variant="secondary" size="sm" disabled={page === last} onClick={() => setAnchor(start + size)}>Berikutnya</Button>
          <form className="flex items-center gap-2" onSubmit={(event) => {
            event.preventDefault();
            const cycle = Number(new FormData(event.currentTarget).get("cycle"));
            if (Number.isInteger(cycle) && cycle >= 1 && cycle <= count) setAnchor(cycle - 1);
          }}>
            <Input className="h-8 w-24" name="cycle" type="number" min={1} max={count} required aria-label="Nomor siklus" />
            <Button variant="secondary" type="submit" size="sm">Ke siklus</Button>
          </form>
        </nav>
      ) : null}
    </section>
  );
}
