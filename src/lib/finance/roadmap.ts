import { D, type Decimal } from "@/lib/money";
import type { SimulateResult } from "./compounding";

export function roadmapAmounts(
  target: Decimal,
  thresholds: readonly Decimal.Value[],
  above?: Decimal,
) {
  const amounts = thresholds.map(D).filter((amount) => amount.gt(0) && amount.lt(target) && (!above || amount.gt(above)));
  return [...new Map([...amounts, target].map((amount) => [amount.toString(), amount])).values()]
    .sort((left, right) => left.cmp(right));
}

export function projectedMilestones(
  amounts: Decimal[],
  initialCapital: Decimal,
  simulation: Pick<SimulateResult, "cycles">,
) {
  return amounts.map((amount) => ({
    amount,
    cycle: initialCapital.gte(amount)
      ? 0
      : simulation.cycles.find((cycle) => cycle.closing.gte(amount))?.cycle ?? null,
  }));
}

export function ledgerMilestones(
  amounts: Decimal[],
  entries: { amount: Decimal.Value; occurredAt: Date }[],
) {
  let balance = D(0);
  let index = 0;
  const hits: { amount: Decimal; achievedAt: Date; balanceAtHit: Decimal }[] = [];
  const ordered = amounts.toSorted((left, right) => left.cmp(right));
  for (const entry of entries) {
    balance = balance.plus(D(entry.amount));
    while (index < ordered.length && balance.gte(ordered[index]!)) {
      hits.push({ amount: ordered[index]!, achievedAt: entry.occurredAt, balanceAtHit: balance });
      index++;
    }
  }
  return { balance, hits };
}
