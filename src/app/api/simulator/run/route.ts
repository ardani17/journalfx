import { requireUser } from "@/server/auth";
import { runSimulation } from "@/server/services/scenarios";
import { runSimulationSchema } from "@/lib/validation/planning";
import { handleRouteError, ok, parseBody } from "@/lib/api";

/** Ad-hoc simulation without saving a scenario. */
export async function POST(req: Request) {
  try {
    await requireUser();
    const input = await parseBody(req, runSimulationSchema);
    const { result } = runSimulation(input);
    // cap the payload: first 400 cycles for chart, summary for the rest
    return ok({
      cyclesCount: result.cyclesCount,
      reached: result.reached,
      targetNotReached: result.targetNotReached,
      finalBalance: result.finalBalance.toString(),
      totalWd: result.totalWd.toString(),
      totalProfit: result.totalProfit.toString(),
      totalDeposits: result.totalDeposits.toString(),
      series: result.cycles.slice(0, 400).map((c) => ({
        cycle: c.cycle,
        opening: Number(c.opening.toFixed(2)),
        closing: Number(c.closing.toFixed(2)),
        wd: Number(c.wd.toFixed(2)),
      })),
      firstCycles: result.cycles.slice(0, 12),
      lastCycle: result.cycles.at(-1) ?? null,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
