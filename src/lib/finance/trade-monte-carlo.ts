import { z } from "zod";

export const tradeSimulationFields = {
  initialEquity: { label: "Modal awal Monte Carlo (USD)", initial: 1000, min: 0.01, max: 100_000_000, step: 0.01 },
  baseRiskPercent: { label: "Risiko dasar (%)", initial: 1, min: 0.01, max: 100, step: 0.01 },
  winRate: { label: "Win rate (%)", initial: 50, min: 0, max: 100, step: 0.01 },
  avgRR: { label: "Rasio reward/risk", initial: 2, min: 0.01, max: 100, step: 0.01 },
  stopLossPips: { label: "Stop loss (pip)", initial: 20, min: 0.01, max: 100_000, step: 0.01 },
  pipValue: { label: "Nilai pip per lot (USD)", initial: 10, min: 0.01, max: 100_000, step: 0.01 },
  maxLotCap: { label: "Lot maksimum", initial: 50, min: 0.01, max: 1_000, step: 0.01 },
  commissionPerLot: { label: "Komisi per lot (USD)", initial: 7, min: 0, max: 100_000, step: 0.01 },
  avgSpreadAndSlippagePips: { label: "Spread dan slippage (pip)", initial: 1, min: 0, max: 10_000, step: 0.01 },
  drawdownThreshold: { label: "Ambang drawdown (%)", initial: 10, min: 0.01, max: 100, step: 0.01 },
  minMarginRequirement: { label: "Batas margin (USD)", initial: 0, min: 0, max: 100_000_000, step: 0.01 },
  withdrawalIntervalTrades: { label: "Interval WD (trade)", initial: 20, min: 1, max: 2_000, step: 1 },
  withdrawalRatePercent: { label: "Porsi laba untuk WD (%)", initial: 30, min: 0, max: 100, step: 0.01 },
  ruinLossPercent: { label: "Ambang risiko kehancuran (%)", initial: 50, min: 0.01, max: 100, step: 0.01 },
  totalTrades: { label: "Jumlah trade", initial: 250, min: 1, max: 2_000, step: 1 },
  tradesPerCycle: { label: "Trade per siklus", initial: 5, min: 1, max: 2_000, step: 1 },
  iterations: { label: "Iterasi Monte Carlo", initial: 1_000, min: 1, max: 5_000, step: 1 },
} as const;

export type TradeSimulationField = keyof typeof tradeSimulationFields;
type NumericInput = Record<TradeSimulationField, number>;
export type TradeSimulationInput = NumericInput & { enableDrawdownThrottle: boolean; enableWithdrawal: boolean };

const numericFields = Object.entries(tradeSimulationFields).map(([name, { min, max, step }]) => {
  const bounded = z.number().min(min).max(max);
  return [name, step === 1 ? bounded.int() : bounded] as const;
});
export const tradeSimulationSchema = z.object({
  ...Object.fromEntries(numericFields) as Record<TradeSimulationField, z.ZodNumber>,
  enableDrawdownThrottle: z.boolean(),
  enableWithdrawal: z.boolean(),
});

export interface TradeStep {
  trade: number;
  win: boolean;
  opening: number;
  lot: number;
  riskPercent: number;
  actualRisk: number;
  cost: number;
  gross: number;
  net: number;
  withdrawal: number;
  closing: number;
  drawdown: number;
  throttled: boolean;
  stopped: boolean;
}

function drawdownPercent(peak: number, equity: number) {
  return ((peak - equity) / peak) * 100;
}

function centsOfLot(value: number) {
  const scaled = value * 100;
  return Math.floor(scaled + Number.EPSILON * scaled);
}

function runPath(
  input: TradeSimulationInput,
  multiplier: (trade: number) => number,
  observe: (trade: number, equity: number) => void,
  steps?: TradeStep[],
) {
  let equity = input.initialEquity;
  let peak = equity;
  let watermark = equity;
  let withdrawn = 0;
  let maxDrawdown = 0;
  let lossStreak = 0;
  let longestLossStreak = 0;
  let ruined = false;
  const ruinFloor = equity * (1 - input.ruinLossPercent / 100);
  const riskPerLot = input.stopLossPips * input.pipValue;
  const costPerLot = input.commissionPerLot + input.avgSpreadAndSlippagePips * input.pipValue;
  const maxLotCents = centsOfLot(input.maxLotCap);

  for (let i = 0; i < input.totalTrades; i++) {
    if (equity > input.minMarginRequirement) {
      const opening = equity;
      const throttled = input.enableDrawdownThrottle && drawdownPercent(peak, equity) >= input.drawdownThreshold;
      const riskPercent = input.baseRiskPercent * (throttled ? 0.5 : 1);
      const rawLot = (equity * riskPercent / 100) / riskPerLot;
      const lot = Math.min(maxLotCents, Math.max(1, centsOfLot(rawLot))) / 100;
      const actualRisk = lot * riskPerLot;
      const outcome = multiplier(i);
      const gross = actualRisk * outcome;
      const cost = lot * costPerLot;
      const net = gross - cost;
      equity += net;
      let withdrawal = 0;
      if (input.enableWithdrawal && (i + 1) % input.withdrawalIntervalTrades === 0 && equity > watermark) {
        withdrawal = (equity - watermark) * input.withdrawalRatePercent / 100;
        if (withdrawal > 0) {
          equity -= withdrawal;
          withdrawn += withdrawal;
          watermark = equity;
        }
      }
      peak = Math.max(peak, equity);
      const drawdown = drawdownPercent(peak, equity);
      maxDrawdown = Math.max(maxDrawdown, drawdown);
      ruined ||= equity < ruinFloor;
      lossStreak = outcome < 0 ? lossStreak + 1 : 0;
      longestLossStreak = Math.max(longestLossStreak, lossStreak);
      if (steps) steps.push({
        trade: i + 1, win: outcome > 0, opening, lot, actualRisk, riskPercent, cost, gross, net,
        withdrawal, closing: equity, drawdown, throttled, stopped: equity <= input.minMarginRequirement,
      });
    }
    observe(i, equity);
  }

  return { equity, withdrawn, maxDrawdown, longestLossStreak, ruined, stopped: equity <= input.minMarginRequirement };
}

function percentile(sorted: Float64Array, fraction: number) {
  const index = fraction * (sorted.length - 1);
  const lo = Math.floor(index);
  const hi = Math.ceil(index);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (index - lo);
}

export function simulateTradeMonteCarlo(raw: TradeSimulationInput, random = Math.random) {
  const input = tradeSimulationSchema.parse(raw);
  const { iterations, totalTrades } = input;
  const equity = new Float64Array(iterations * totalTrades);
  const wins = new Uint8Array(iterations * totalTrades);
  const withdrawn = new Float64Array(iterations);
  const drawdowns = new Float64Array(iterations);
  const baseline = new Float64Array(totalTrades);
  const chance = input.winRate / 100;
  let drawdownSum = 0;
  let ruinCount = 0;
  let maxLossStreak = 0;
  let lossStreakSum = 0;

  for (let path = 0; path < iterations; path++) {
    const result = runPath(input, (trade) => {
      const won = random() < chance;
      wins[path * totalTrades + trade] = Number(won);
      return won ? input.avgRR : -1;
    }, (trade, balance) => {
      equity[trade * iterations + path] = balance;
    });
    withdrawn[path] = result.withdrawn;
    drawdowns[path] = result.maxDrawdown;
    drawdownSum += result.maxDrawdown;
    ruinCount += Number(result.ruined);
    lossStreakSum += result.longestLossStreak;
    maxLossStreak = Math.max(maxLossStreak, result.longestLossStreak);
  }

  runPath(input, () => chance * input.avgRR - (1 - chance), (trade, balance) => { baseline[trade] = balance; });
  const finalBalances = equity.subarray((totalTrades - 1) * iterations);
  const medianFinal = percentile(finalBalances.slice().sort(), 0.5);
  let exampleIndex = 0;
  for (let i = 1; i < iterations; i++) {
    if (Math.abs(finalBalances[i]! - medianFinal) < Math.abs(finalBalances[exampleIndex]! - medianFinal)) exampleIndex = i;
  }
  const steps: TradeStep[] = [];
  const example = runPath(input, (i) => wins[exampleIndex * totalTrades + i] ? input.avgRR : -1, () => {}, steps);

  const chart = Array.from(baseline, (expected, i) => {
    const sorted = equity.subarray(i * iterations, (i + 1) * iterations).sort();
    return {
      trade: i + 1, expected,
      p5: percentile(sorted, 0.05), p25: percentile(sorted, 0.25), p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75), p95: percentile(sorted, 0.95),
    };
  });
  return {
    chart,
    steps,
    example,
    tradesPerCycle: input.tradesPerCycle,
    medianFinal,
    p5Final: chart.at(-1)!.p5,
    medianWithdrawn: percentile(withdrawn.sort(), 0.5),
    meanMaxDrawdown: drawdownSum / iterations,
    p95MaxDrawdown: percentile(drawdowns.sort(), 0.95),
    riskOfRuin: 100 * ruinCount / iterations,
    meanLossStreak: lossStreakSum / iterations,
    maxLossStreak,
  };
}

export type TradeMonteCarloResult = ReturnType<typeof simulateTradeMonteCarlo>;
