import { requireUser } from "@/server/auth";
import { getRecommendation } from "@/server/services/withdrawals";
import { handleRouteError, ok } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const bundle = await getRecommendation(user.id);
    return ok({
      recommendation: {
        eligibleProfit: bundle.recommendation.eligibleProfit.toString(),
        recommended: bundle.recommendation.recommended.toString(),
        profitOnlyCap: bundle.recommendation.profitOnlyCap.toString(),
        needsCap: bundle.recommendation.needsCap?.toString() ?? null,
        cashCap: bundle.recommendation.cashCap.toString(),
        zeroReasons: bundle.recommendation.zeroReasons,
        warnings: bundle.recommendation.warnings,
        caps: bundle.recommendation.caps,
      },
      rule: bundle.rule,
      needsWeeklyUsd: bundle.needsWeeklyUsd?.toString() ?? null,
      cumulativePnl: bundle.cumulativePnl.toString(),
      hwm: bundle.hwm.toString(),
      periodProfit: bundle.periodProfit.toString(),
      periodTaken: bundle.periodTaken.toString(),
      availableCash: bundle.availableCash.toString(),
      latestFx: bundle.latestFx,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
