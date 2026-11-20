"use client";

import Link from "next/link";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { JisdorRateNote } from "@/components/finance/jisdor-rate-note";
import { estimateTradingCapital, monteCarloEquityStorageKey, parseCapitalInput, parseMonteCarloEquity } from "@/lib/finance/trading-capital";
import type { JisdorQuote } from "@/lib/finance/exchange";
import { D, fmtIDR, fmtUSD } from "@/lib/money";
import { formatLocalizedNumber } from "@/lib/number-input";

const assumptions = [
  { key: "target", label: "Target dana bulanan (IDR)" },
  { key: "return", label: "Imbal hasil bersih per bulan (%)" },
  { key: "share", label: "Porsi laba untuk kebutuhan (%)" },
] as const;

export function TradingCapitalEstimate({ userId, planned, quote }: { userId: string; planned: string; quote: JisdorQuote | null }) {
  const [draft, setDraft] = useState({ target: null as string | null, return: "", share: "" });
  const [transferFailed, setTransferFailed] = useState(false);
  const form = { ...draft, target: draft.target ?? (D(planned).gt(0) ? formatLocalizedNumber(planned) : "") };
  const target = parseCapitalInput(form.target);
  const monthlyReturn = parseCapitalInput(form.return);
  const share = parseCapitalInput(form.share);
  const estimate = target && monthlyReturn && share ? estimateTradingCapital(target, monthlyReturn, share, quote) : null;
  const malformed = assumptions.some(({ key }) => form[key].trim() && parseCapitalInput(form[key]) === null);
  const usdValue = estimate?.status === "estimated" ? estimate.usd?.toFixed(2) : undefined;
  const canTransfer = usdValue !== undefined && parseMonteCarloEquity(usdValue) !== undefined;

  return (
    <Card>
      <CardHeader><CardTitle>Estimasi Modal Trading</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-3 md:grid-cols-3">
          {assumptions.map(({ key, label }) => (
            <Field key={key} label={label} htmlFor={`capital-${key}`}>
              <Input id={`capital-${key}`} type="text" inputMode="decimal" maxLength={32} value={form[key]}
                onChange={(event) => {
                  const value = event.target.value;
                  setDraft((current) => ({ ...current, [key]: value }));
                }}
                onBlur={() => {
                  const value = parseCapitalInput(form[key]);
                  if (value && draft[key] !== null) setDraft((current) => ({ ...current, [key]: formatLocalizedNumber(value) }));
                }} />
            </Field>
          ))}
        </div>
        <div aria-live="polite" className="space-y-2">
          {malformed || estimate?.status === "invalid" ? (
            <p className="text-xs text-loss">Masukkan target positif, imbal hasil berbentuk angka, dan porsi laba antara 0% dan 100%.</p>
          ) : estimate?.status === "no-funding" ? (
            <p className="text-sm text-warn">Skenario ini tidak menghasilkan pendanaan bulanan dari laba.</p>
          ) : estimate?.status === "estimated" && target && monthlyReturn && share ? (
            <>
              <p className="text-xs text-muted">
                {fmtIDR(target)} ÷ ({formatLocalizedNumber(monthlyReturn)}% × {formatLocalizedNumber(share)}%)
              </p>
              <p className="text-xs text-muted">Estimasi berdasarkan asumsi</p>
              <p className="tnum text-xl font-semibold">{fmtIDR(estimate.idr)}{estimate.usd ? ` · ≈ ${fmtUSD(estimate.usd)}` : ""}</p>
              <JisdorRateNote quote={quote} />
              {canTransfer ? (
                <Link href="/simulator#monte-carlo" onNavigate={(event) => {
                  try {
                    sessionStorage.setItem(monteCarloEquityStorageKey(userId), usdValue);
                  } catch {
                    event.preventDefault();
                    setTransferFailed(true);
                  }
                }} className="inline-flex h-10 items-center rounded-lg border border-line px-3 text-sm font-medium text-primary hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
                  Uji di Monte Carlo
                </Link>
              ) : (
                <p className="text-xs text-muted">{estimate.usd
                  ? "Estimasi USD di luar rentang modal awal Monte Carlo."
                  : "Kurs USD diperlukan untuk mengisi modal awal Monte Carlo."}</p>
              )}
              {transferFailed ? <p role="alert" className="text-xs text-loss">Peramban tidak dapat meneruskan nominal. Buka Simulator dan isi modal awal secara manual.</p> : null}
            </>
          ) : <p className="text-xs text-muted">Isi ketiga nilai. Gunakan imbal hasil setelah biaya trading.</p>}
        </div>
        <p className="text-xs text-muted">Penurunan saldo dan laba bulanan di bawah asumsi dapat membuat target kebutuhan tidak tercapai.</p>
      </CardContent>
    </Card>
  );
}
