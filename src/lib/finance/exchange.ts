import { D, Decimal, fmtIDR, fmtUSD, tradingAmountToUsd } from "@/lib/money";

export const JISDOR_PAGE_URL = "https://www.bi.go.id/id/statistik/informasi-kurs/jisdor/default.aspx";

export interface JisdorQuote {
  rate: string;
  at: string;
  source: "bi-jisdor";
  status: "latest" | "cached";
}

export type ConversionCurrency = "USD" | "IDR" | "USC";

export function convertUsdIdr(amount: Decimal.Value, from: ConversionCurrency, quote: JisdorQuote | null) {
  if (!quote) return null;
  if (from === "IDR") return D(amount).div(quote.rate);
  return tradingAmountToUsd(amount, from).times(quote.rate);
}

export function parseConversionAmount(input: string) {
  const value = input.trim();
  if (!/^-?\d{1,16}(?:[.,]\d{1,2})?$/.test(value)) return null;
  return D(value.replace(",", "."));
}

export function formatFxEstimate(amount: Decimal.Value, from: ConversionCurrency, quote: JisdorQuote | null) {
  const result = convertUsdIdr(amount, from, quote);
  if (result === null) return null;
  return `≈ ${from === "IDR" ? fmtUSD(result) : fmtIDR(result)}`;
}
