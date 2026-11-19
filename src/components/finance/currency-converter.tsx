"use client";

import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input, Select } from "@/components/ui/field";
import { formatFxEstimate, parseConversionAmount, type ConversionCurrency, type JisdorQuote } from "@/lib/finance/exchange";
import { JisdorRateNote } from "./jisdor-rate-note";

export function CurrencyConverter({ quote }: { quote: JisdorQuote | null }) {
  const [from, setFrom] = useState<ConversionCurrency>("USD");
  const [amount, setAmount] = useState("");
  const value = parseConversionAmount(amount);
  const estimate = value === null ? null : formatFxEstimate(value, from, quote);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Konversi USD–IDR</CardTitle>
        <JisdorRateNote quote={quote} />
      </CardHeader>
      <CardContent className="grid gap-3 sm:grid-cols-3 sm:items-start">
        <Field label="Arah konversi" htmlFor="fx-direction">
          <Select id="fx-direction" value={from} onChange={(event) => setFrom(event.target.value === "IDR" ? "IDR" : "USD")} disabled={!quote}>
            <option value="USD">USD ke IDR</option>
            <option value="IDR">IDR ke USD</option>
          </Select>
        </Field>
        <Field
          label={`Nominal ${from}`}
          htmlFor="fx-amount"
          error={quote && amount.trim() && value === null ? "Masukkan angka tanpa pemisah ribuan, dengan maksimal dua desimal." : undefined}
        >
          <Input
            id="fx-amount"
            inputMode="decimal"
            autoComplete="off"
            maxLength={20}
            value={amount}
            onChange={(event) => setAmount(event.target.value)}
            disabled={!quote}
          />
        </Field>
        <div className="flex min-w-0 flex-col gap-1.5">
          <span className="text-xs font-medium text-muted">Hasil estimasi</span>
          <output aria-label="Hasil estimasi" htmlFor="fx-direction fx-amount" className="tnum flex min-h-10 items-center break-all text-lg font-bold text-primary">
            {estimate ?? "—"}
          </output>
        </div>
      </CardContent>
    </Card>
  );
}
