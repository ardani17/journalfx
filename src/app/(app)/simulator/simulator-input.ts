import { formatLocalizedNumber, normalizeNumericInput } from "@/lib/number-input";

export function parseSimulationNumber(value: string, grouped = false) {
  const normalized = normalizeNumericInput(value, grouped);
  if (normalized === undefined) return undefined;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : undefined;
}

export { formatLocalizedNumber as formatTarget };
