import { z } from "zod";
import { requireUser } from "@/server/auth";
import { runMonteCarlo } from "@/server/services/portfolio";
import { handleRouteError, ok, parseBody } from "@/lib/api";

const mcSchema = z.object({
  riskPctPerTrade: z.coerce.number().min(0.1).max(10).optional(),
  tradesPerPath: z.coerce.number().int().min(10).max(520).optional(),
  paths: z.coerce.number().int().min(100).max(5000).optional(),
  seed: z.coerce.number().int().optional(),
});

export async function POST(req: Request) {
  try {
    const user = await requireUser();
    const input = await parseBody(req, mcSchema);
    const r = await runMonteCarlo(user.id, input);
    return ok({
      p10: r.p10,
      p50: r.p50,
      p90: r.p90,
      medianFinal: r.medianFinal,
      p10Final: r.p10Final,
      p90Final: r.p90Final,
      riskOfRuinPct: Number(r.riskOfRuinPct.toFixed(2)),
      medianMaxDdPct: r.medianMaxDdPct,
      sampleTrades: r.sampleTrades,
      caveat: r.caveat,
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
