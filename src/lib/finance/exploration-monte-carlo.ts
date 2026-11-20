import { z } from "zod";
import { mulberry32 } from "./montecarlo";

export const explorationPaths = 500;
export const explorationTradesPerCycle = 5;

export const explorationFields = {
  capital: { label: "Modal awal (USD)", initial: 1000, min: 0.01, max: 1e16 },
  target: { label: "Target saldo (USD)", initial: 10000, min: 0.01, max: 1e16 },
  trades: { label: "Jumlah trade", initial: 120, min: 1, max: 300 },
  winRate: { label: "Peluang menang (%)", initial: 55, min: 0, max: 100 },
  winReturn: { label: "Laba saat menang (%)", initial: 6, min: 0.01, max: 100 },
  lossReturn: { label: "Rugi saat kalah (%)", initial: 3, min: 0.01, max: 100 },
  withdrawalRate: { label: "Porsi laba ditarik (%)", initial: 50, min: 0, max: 100 },
  withdrawalAmount: { label: "Nominal ditarik (USD)", initial: 0, min: 0, max: 1e16 },
  fee: { label: "Biaya per trade (USD)", initial: 0, min: 0, max: 1e16 },
} as const;

export type ExplorationField = keyof typeof explorationFields;
export const explorationFieldNames = Object.keys(explorationFields) as ExplorationField[];
const numericFields = Object.fromEntries(explorationFieldNames.map((key) => {
  const { min, max } = explorationFields[key];
  const value = z.number().min(min).max(max);
  return [key, key === "trades" ? value.int() : value];
})) as Record<ExplorationField, z.ZodNumber>;

export const explorationSchema = z.object({
  ...numericFields,
  withdrawal: z.enum(["NONE", "DYNAMIC", "FIXED"]),
});

export type ExplorationInput = z.infer<typeof explorationSchema>;

export function defaultExplorationInput(capital: number, target: number): ExplorationInput {
  const defaults = Object.fromEntries(explorationFieldNames.map((key) => [key, explorationFields[key].initial])) as Record<ExplorationField, number>;
  return {
    ...defaults,
    capital: numericFields.capital.safeParse(capital).data ?? defaults.capital,
    target: numericFields.target.safeParse(target).data ?? defaults.target,
    withdrawal: "NONE",
  };
}

function percentile(sorted: Float64Array, fraction: number) {
  const position = (sorted.length - 1) * fraction;
  const lower = Math.floor(position);
  return sorted[lower]! + (sorted[Math.ceil(position)]! - sorted[lower]!) * (position - lower);
}

export interface ExplorationTrade {
  trade: number;
  win: boolean;
  opening: number;
  profit: number;
  taken: number;
  closing: number;
}

export function simulateExploration(input: ExplorationInput, seed: number) {
  const { capital, target, trades, fee, withdrawal, withdrawalRate, withdrawalAmount } = input;
  const steps = Array.from({ length: trades + 1 }, () => new Float64Array(explorationPaths));
  const sample: ExplorationTrade[] = [];
  const sampleBalances = [capital];
  const rates = { win: input.winReturn / 100, loss: -input.lossReturn / 100 };
  const winChance = input.winRate / 100;
  let reachedCount = 0;
  steps[0]!.fill(capital);

  for (let path = 0; path < explorationPaths; path++) {
    const random = mulberry32(seed + path);
    let closing = capital;
    let cumulativeProfit = 0;
    let profitPeak = 0;
    let reached = closing >= target;
    for (let trade = 1; trade <= trades; trade++) {
      if (closing > 0) {
        const opening = closing;
        const win = random() < winChance;
        const profit = Math.max(-opening, opening * (win ? rates.win : rates.loss) - fee);
        cumulativeProfit += profit;
        const desired = withdrawal === "DYNAMIC" ? (cumulativeProfit - profitPeak) * withdrawalRate / 100
          : withdrawal === "FIXED" ? withdrawalAmount : 0;
        const taken = Math.max(0, Math.min(profit, desired));
        profitPeak = Math.max(profitPeak, cumulativeProfit);
        closing = opening + profit - taken;
        // Preserve exact target hits when a decimal return falls within double precision noise.
        reached ||= closing >= target || target - closing <= 8 * Number.EPSILON * target;
        if (path === 0) sample.push({ trade, win, opening, profit, taken, closing });
      }
      steps[trade]![path] = closing;
      if (path === 0) sampleBalances.push(closing);
    }
    reachedCount += Number(reached);
  }

  const chart = steps.map((balances, trade) => {
    balances.sort();
    const bounds: [number, number] = [percentile(balances, 0.1), percentile(balances, 0.9)];
    return { trade, bounds, sample: sampleBalances[trade]! };
  });
  return { reachedCount, chart, sample, median: percentile(steps[trades]!, 0.5) };
}

export type ExplorationResult = ReturnType<typeof simulateExploration>;
