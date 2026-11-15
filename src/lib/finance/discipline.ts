import { D, Decimal } from "@/lib/money";

/**
 * Discipline score — explainable, weighted (PRD):
 *   risk 30% · setup 25% · SL 15% · emotions 15% · completeness 10% · frequency 5%
 * Each component ∈ [0,100]; weighted sum → total ∈ [0,100].
 * Missing data never fakes a score: it is flagged separately and the component
 * is excluded from the weighted average (renormalized weights).
 */

export interface DisciplineInput {
  /** trades whose actual risk ≤ planned limit ×1.05 vs total trades */
  riskRespected?: { ok: number; total: number };
  /** trades executed with a documented strategy/setup */
  setupFollowed?: { ok: number; total: number };
  /** trades that kept an initial stop loss (never removed) */
  slPresent?: { ok: number; total: number };
  /** trades without emotional flags (fomo/revenge/overtrading) */
  emotionsClean?: { ok: number; total: number };
  /** journal completeness ratio (context+reason+lessons+post-checklist) */
  completeness?: { ok: number; total: number };
  /** trading frequency within plan (not overtrading) */
  frequencyOk?: { ok: number; total: number };
}

export interface DisciplineResult {
  total: number | null; // null when no component has data
  components: {
    key: string;
    label: string;
    weightPct: number;
    score: number | null;
    ratio: string | null;
  }[];
  missing: string[];
}

const DEFS = [
  { key: "risk", label: "Risiko", weight: 30 },
  { key: "setup", label: "Setup", weight: 25 },
  { key: "sl", label: "Stop Loss", weight: 15 },
  { key: "emotions", label: "Emosi", weight: 15 },
  { key: "completeness", label: "Kelengkapan", weight: 10 },
  { key: "frequency", label: "Frekuensi", weight: 5 },
] as const;

export function disciplineScore(input: DisciplineInput): DisciplineResult {
  const map: Record<string, { ok: number; total: number } | undefined> = {
    risk: input.riskRespected,
    setup: input.setupFollowed,
    sl: input.slPresent,
    emotions: input.emotionsClean,
    completeness: input.completeness,
    frequency: input.frequencyOk,
  };

  const components: DisciplineResult["components"] = [];
  const missing: string[] = [];
  let weightedSum = new Decimal(0);
  let weightSum = new Decimal(0);

  for (const def of DEFS) {
    const v = map[def.key];
    if (!v || v.total === 0) {
      missing.push(def.label);
      components.push({ key: def.key, label: def.label, weightPct: def.weight, score: null, ratio: null });
      continue;
    }
    const score = Math.min(100, (v.ok / v.total) * 100);
    weightedSum = weightedSum.add(D(score).times(def.weight));
    weightSum = weightSum.add(def.weight);
    components.push({
      key: def.key,
      label: def.label,
      weightPct: def.weight,
      score: Number(score.toFixed(1)),
      ratio: `${v.ok}/${v.total}`,
    });
  }

  const total = weightSum.isZero() ? null : Number(weightedSum.div(weightSum).toFixed(1));
  return { total, components, missing };
}
