

/**
 * Monte Carlo bootstrap over HISTORICAL trade R-multiples (v1.4.0).
 * - Seeded deterministic RNG (mulberry32): identical seed + data → identical paths
 *   (reproducible, PRD acceptance).
 * - Bootstrap: each simulated trade draws uniformly (with replacement) from the
 *   user's historical R distribution; equity compounds by riskPct per trade.
 * - Outputs percentile bands (p10/p25/p50/p75/p90), risk-of-ruin (path hit
 *   maxDdPct), and sample-size caveats. Illustrative only — NOT a forecast.
 */

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MonteCarloInput {
  /** historical R multiples (net), e.g. 2.1, -1.0, 0.5 */
  historicalR: number[];
  startingBalance: number;
  riskPctPerTrade: number; // 1 = 1%
  tradesPerPath: number; // e.g. 52 (a year of weekly-ish trading)
  paths: number; // e.g. 1000
  maxDdPct: number; // ruin threshold, e.g. 30
  seed: number;
}

export interface MonteCarloResult {
  p10: number[];
  p25: number[];
  p50: number[];
  p75: number[];
  p90: number[];
  medianFinal: number;
  p10Final: number;
  p90Final: number;
  riskOfRuinPct: number; // % of paths hitting maxDd threshold
  medianMaxDdPct: number;
  sampleTrades: number;
  caveat: string | null;
}

export function monteCarlo(input: MonteCarloInput): MonteCarloResult {
  const { historicalR, startingBalance, tradesPerPath, maxDdPct, seed } = input;
  const n = historicalR.length;
  const riskPct = input.riskPctPerTrade / 100;
  const rnd = mulberry32(seed);

  if (n === 0) {
    throw new Error("Belum ada trade historis — Monte Carlo butuh minimal 1 trade");
  }

  const paths: number[][] = [];
  let ruinCount = 0;
  const maxDds: number[] = [];

  for (let p = 0; p < input.paths; p++) {
    let equity = startingBalance;
    let peak = startingBalance;
    let maxDd = 0;
    const series: number[] = [startingBalance];
    for (let t = 0; t < tradesPerPath; t++) {
      const r = historicalR[Math.floor(rnd() * n)]!;
      equity = equity * (1 + r * riskPct);
      if (equity < 0) equity = 0;
      if (equity > peak) peak = equity;
      const dd = peak > 0 ? ((peak - equity) / peak) * 100 : 0;
      if (dd > maxDd) maxDd = dd;
      series.push(Number(equity.toFixed(2)));
    }
    if (maxDd >= maxDdPct) ruinCount++;
    maxDds.push(maxDd);
    paths.push(series);
  }

  const percentiles = [10, 25, 50, 75, 90];
  const indices = percentiles.map((pctile) =>
    Math.min(paths.length - 1, Math.max(0, Math.floor((pctile / 100) * paths.length))));
  const bands = percentiles.map((): number[] => []);
  for (let step = 0; step <= tradesPerPath; step++) {
    const values = paths.map((series) => series[step]!).sort((a, b) => a - b);
    bands.forEach((band, index) => band.push(values[indices[index]!]!));
  }
  const [p10, p25, p50, p75, p90] = bands as [number[], number[], number[], number[], number[]];

  maxDds.sort((a, b) => a - b);
  const medianMaxDd = maxDds[Math.floor(maxDds.length / 2)] ?? 0;

  return {
    p10,
    p25,
    p50,
    p75,
    p90,
    medianFinal: p50.at(-1)!,
    p10Final: p10.at(-1)!,
    p90Final: p90.at(-1)!,
    riskOfRuinPct: (ruinCount / input.paths) * 100,
    medianMaxDdPct: Number(medianMaxDd.toFixed(2)),
    sampleTrades: n,
    caveat:
      n < 30
        ? `Sampel historis kecil (${n} trade < 30) — distribusi R belum stabil; hasil hanya ilustratif`
        : null,
  };
}
