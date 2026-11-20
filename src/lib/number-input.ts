import { D, type Decimal } from "@/lib/money";

export function normalizeNumericInput(value: string, grouped = false) {
  const text = value.trim();
  const localized = grouped && /^-?[1-9]\d{0,2}(?:\.\d{3})+(?:,\d*)?$/.test(text);
  const normalized = (localized ? text.replaceAll(".", "") : text).replace(",", ".");
  return /^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized) ? normalized : undefined;
}

export function formatLocalizedNumber(value: Decimal.Value) {
  const [whole = "0", fraction] = D(value).toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}
