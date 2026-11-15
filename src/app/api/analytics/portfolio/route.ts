import { requireUser } from "@/server/auth";
import { portfolioOverview } from "@/server/services/portfolio";
import { handleRouteError, ok } from "@/lib/api";

export async function GET() {
  try {
    const user = await requireUser();
    const rows = await portfolioOverview(user.id);
    return ok(
      rows.map((r) => ({
        ...r,
        balance: r.balance.toString(),
        realizedPnl: r.realizedPnl.toString(),
        prop: r.prop
          ? {
              targetUsd: r.prop.targetUsd?.toString() ?? null,
              progressPct: r.prop.progressPct?.toString() ?? null,
              maxDailyLossUsd: r.prop.maxDailyLossUsd?.toString() ?? null,
              maxTotalDdUsd: r.prop.maxTotalDdUsd?.toString() ?? null,
              breached: r.prop.breached,
              passed: r.prop.passed,
            }
          : null,
      })),
    );
  } catch (e) {
    return handleRouteError(e);
  }
}
