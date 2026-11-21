import { z } from "zod";
import { D, Decimal } from "@/lib/money";
import { mulberry32 } from "./montecarlo";

export const explorationPaths = 500;
export const explorationTradesPerCycle = 5;

export const explorationFields = {
  capital: { label: "Modal awal (USD)", initial: 1000, min: 0.01, max: 1e16 },
  target: { label: "Target saldo (USD)", initial: 10000, min: 0.01, max: 1e16 },
  trades: { label: "Jumlah trade", initial: 120, min: 1, max: 300 },
  tradesPerDay: { label: "Trade per hari", initial: 1, min: 1, max: Number.MAX_SAFE_INTEGER },
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
  return [key, key === "trades" || key === "tradesPerDay" ? value.int() : value];
})) as Record<ExplorationField, z.ZodNumber>;

function amountField(name: "capital" | "target" | "withdrawalAmount" | "fee") {
  const { min, max } = explorationFields[name];
  return z.union([
    z.string().max(32).regex(/^(?:\d+(?:\.\d*)?|\.\d+)$/).transform(D),
    z.number().transform((value) => D(value).toDecimalPlaces(2)),
  ])
    .refine((value) => value.decimalPlaces() <= 2 && value.gte(min) && value.lte(max))
    .transform((value) => value.toFixed());
}

export const explorationSchema = z.object({
  ...numericFields,
  tradesPerDay: numericFields.tradesPerDay.default(explorationFields.tradesPerDay.initial),
  capital: amountField("capital"),
  target: amountField("target"),
  withdrawalAmount: amountField("withdrawalAmount"),
  fee: amountField("fee"),
  withdrawal: z.enum(["NONE", "DYNAMIC", "FIXED"]),
});

export type ExplorationInput = z.infer<typeof explorationSchema>;

export function explorationTradeDay(trade: number, tradesPerDay: number) {
  return Math.ceil(trade / tradesPerDay);
}

export function defaultExplorationInput(capital: string | number, target: string | number): ExplorationInput {
  const defaults = Object.fromEntries(explorationFieldNames.map((key) => [key, explorationFields[key].initial])) as Record<ExplorationField, number>;
  return explorationSchema.parse({
    ...defaults,
    capital: explorationSchema.shape.capital.safeParse(capital).data ?? defaults.capital,
    target: explorationSchema.shape.target.safeParse(target).data ?? defaults.target,
    withdrawal: "NONE",
  });
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

export function simulateExploration(input: Omit<ExplorationInput, "tradesPerDay">, seed: number) {
  const { trades, withdrawal } = input;
  const capital = D(input.capital);
  const target = D(input.target);
  const fee = D(input.fee);
  const withdrawalRate = D(input.withdrawalRate).div(100);
  const withdrawalAmount = D(input.withdrawalAmount);
  const zero = D(0);
  const steps = Array.from({ length: trades + 1 }, () => new Float64Array(explorationPaths));
  const sample: ExplorationTrade[] = [];
  const sampleBalances = [capital.toNumber()];
  const rates = { win: D(input.winReturn).div(100), loss: D(input.lossReturn).div(-100) };
  const winChance = input.winRate / 100;
  let reachedCount = 0;
  steps[0]!.fill(capital.toNumber());

  for (let path = 0; path < explorationPaths; path++) {
    const random = mulberry32(seed + path);
    let closing = capital;
    let cumulativeProfit = zero;
    let profitPeak = zero;
    let reached = closing.gte(target);
    for (let trade = 1; trade <= trades; trade++) {
      if (closing.gt(0)) {
        const opening = closing;
        const win = random() < winChance;
        const profit = Decimal.max(opening.neg(), opening.times(win ? rates.win : rates.loss).minus(fee));
        let taken = zero;
        if (withdrawal === "DYNAMIC") {
          cumulativeProfit = cumulativeProfit.plus(profit);
          const desired = cumulativeProfit.minus(profitPeak).times(withdrawalRate);
          taken = Decimal.max(0, Decimal.min(profit, desired));
          profitPeak = Decimal.max(profitPeak, cumulativeProfit);
        } else if (withdrawal === "FIXED") {
          taken = Decimal.max(0, Decimal.min(profit, withdrawalAmount));
        }
        closing = opening.plus(profit).minus(taken);
        reached ||= closing.gte(target);
        if (path === 0) {
          sample.push({
            trade, win, opening: opening.toNumber(), profit: profit.toNumber(),
            taken: taken.toNumber(), closing: closing.toNumber(),
          });
        }
      }
      const chartBalance = closing.toNumber();
      steps[trade]![path] = chartBalance;
      if (path === 0) sampleBalances.push(chartBalance);
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
