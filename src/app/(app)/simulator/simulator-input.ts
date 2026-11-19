import { D } from "@/lib/money";

export function parseSimulationNumber(value: string, grouped = false) {
  const text = value.trim();
  const localized = grouped && /^-?\d{1,3}(?:\.\d{3})+(?:,\d*)?$/.test(text);
  const normalized = (localized ? text.replaceAll(".", "") : text).replace(",", ".");
  if (!/^-?(?:\d+(?:\.\d*)?|\.\d+)$/.test(normalized)) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export function formatTarget(value: number) {
  const [whole = "0", fraction] = D(value).toFixed().split(".");
  const grouped = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  return fraction ? `${grouped},${fraction}` : grouped;
}
