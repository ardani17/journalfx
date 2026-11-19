import { requireUser } from "@/server/auth";
import { getRecommendation, listWithdrawals, listWithdrawalSourceAccounts } from "@/server/services/withdrawals";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { WithdrawalsClient } from "./withdrawals-client";

export const metadata = { title: "Withdrawal Plan (WD)" };

export default async function WithdrawalsPage() {
  const user = await requireUser();
  const [bundle, history] = await Promise.all([
    getRecommendation(user.id),
    listWithdrawals(user.id),
  ]);
  const accounts = bundle.recommendation.recommended.gt(0)
    ? await listWithdrawalSourceAccounts(user.id, bundle.projectId)
    : [];

  return (
    <PageShell>
      <PageHeader
        title="Withdrawal Plan (WD)"
        subtitle="Rencanakan penarikan laba trading dan catat dana yang diterima dari broker."
      />
      <WithdrawalsClient
        accounts={accounts.map(({ id, name, balanceUsd }) => ({ id, name, balanceUsd: balanceUsd.toString() }))}
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
        cumulativePnl={bundle.cumulativePnl.toString()}
        hwm={bundle.hwm.toString()}
        periodProfit={bundle.periodProfit.toString()}
        periodTaken={bundle.periodTaken.toString()}
        availableCash={bundle.availableCash.toString()}
        latestFx={bundle.latestFx}
        history={history.map((w) => ({
          id: w.id,
          status: w.status,
          amountUSD: w.amountUSD.toString(),
          fxRate: w.fxRate?.toString() ?? null,
          receivedAmount: w.receivedAmount?.toString() ?? null,
          fees: w.fees?.toString() ?? null,
          note: w.note,
          mt5DealId: w.mt5DealId,
          createdAt: w.createdAt.toISOString(),
          completedAt: w.completedAt?.toISOString() ?? null,
        }))}
      />
    </PageShell>
  );
}
