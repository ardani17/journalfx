import { requireUser } from "@/server/auth";
import { getRecommendation, listWithdrawals } from "@/server/services/withdrawals";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { WithdrawalsClient } from "./withdrawals-client";

export const metadata = { title: "Withdrawal Plan (WD)" };

export default async function WithdrawalsPage() {
  const user = await requireUser();
  const [bundle, history] = await Promise.all([
    getRecommendation(user.id),
    listWithdrawals(user.id),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Withdrawal Plan (WD)"
        subtitle="Penarikan profit-only dengan pemulihan loss (high-water mark). Rekomendasi — eksekusi tetap manual di broker."
      />
      <WithdrawalsClient
        rec={{
          eligible: bundle.recommendation.eligibleProfit.toString(),
          recommended: bundle.recommendation.recommended.toString(),
          profitOnlyCap: bundle.recommendation.profitOnlyCap.toString(),
          needsCap: bundle.recommendation.needsCap?.toString() ?? null,
          cashCap: bundle.recommendation.cashCap.toString(),
          zeroReasons: bundle.recommendation.zeroReasons,
          warnings: bundle.recommendation.warnings,
          caps: bundle.recommendation.caps,
        }}
        rule={bundle.rule}
        needsWeeklyUsd={bundle.needsWeeklyUsd?.toString() ?? null}
        cumulativePnl={bundle.cumulativePnl.toString()}
        hwm={bundle.hwm.toString()}
        periodProfit={bundle.periodProfit.toString()}
        periodTaken={bundle.periodTaken.toString()}
        availableCash={bundle.availableCash.toString()}
        latestFx={bundle.latestFx ? { rate: bundle.latestFx.rate, at: bundle.latestFx.at.toISOString() } : null}
        history={history.map((w) => ({
          id: w.id,
          status: w.status,
          amountUSD: w.amountUSD.toString(),
          fxRate: w.fxRate?.toString() ?? null,
          receivedAmount: w.receivedAmount?.toString() ?? null,
          fees: w.fees?.toString() ?? null,
          note: w.note,
          createdAt: w.createdAt.toISOString(),
          completedAt: w.completedAt?.toISOString() ?? null,
        }))}
      />
    </PageShell>
  );
}
