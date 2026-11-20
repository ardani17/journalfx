"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { reviewHref, reviewKindLabel, reviewKinds, reviewPeriodForDate, reviewPeriodLabel, type ReviewKind } from "@/lib/review-period";

export function PeriodPicker({ today, timezone }: { today: string; timezone: string }) {
  const router = useRouter();
  const [kind, setKind] = useState<ReviewKind>("WEEKLY");
  const [date, setDate] = useState(today);
  const isMonthly = kind === "MONTHLY";
  const selected = isMonthly ? date.slice(0, 7) + "-01" : date;
  const valid = /^\d{4}-\d{2}-\d{2}$/.test(selected) && selected <= today;
  const range = valid ? reviewPeriodLabel(reviewPeriodForDate(kind, selected, timezone), timezone) : null;

  return (
    <Card>
      <CardContent className="grid gap-3 p-4 sm:grid-cols-3 sm:items-end">
        <Field label="Jenis review" htmlFor="review-kind">
          <Select id="review-kind" value={kind} onChange={(event) => setKind(event.target.value as ReviewKind)}>
            {reviewKinds.map((value) => <option key={value} value={value}>{reviewKindLabel[value]}</option>)}
          </Select>
        </Field>
        <Field label={isMonthly ? "Bulan" : "Tanggal"} htmlFor="review-date">
          <Input id="review-date" type={isMonthly ? "month" : "date"}
            max={isMonthly ? today.slice(0, 7) : today} value={isMonthly ? date.slice(0, 7) : date}
            onChange={(event) => setDate(isMonthly && event.target.value ? event.target.value + "-01" : event.target.value)} />
        </Field>
        <div className="space-y-2">
          <p aria-live="polite" className="text-xs text-muted">{range ?? "Pilih tanggal hari ini atau tanggal lampau."}</p>
          <Button disabled={!range} onClick={() => router.push(reviewHref(kind, { date: selected }))}>Buka Review</Button>
        </div>
      </CardContent>
    </Card>
  );
}
