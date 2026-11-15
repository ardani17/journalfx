import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { positionSize } from "@/lib/finance/risk";
import { positionSizeSchema } from "@/lib/validation/planning";
import { handleRouteError, ok, parseBody, ApiError } from "@/lib/api";

export async function POST(req: Request) {
  try {
    await requireUser();
    const input = await parseBody(req, positionSizeSchema);
    const instrument = await prisma.instrument.findUnique({
      where: { symbol: input.symbol.toUpperCase() },
    });
    if (!instrument) throw new ApiError(404, `Instrumen ${input.symbol} tidak ditemukan`);

    const result = positionSize({
      balance: input.balance,
      riskPct: input.riskPct,
      entry: input.entry,
      stopLoss: input.stopLoss,
      contractSize: instrument.contractSize,
      costPerLot: input.costPerLot ?? 0,
      lotStep: instrument.lotStep,
      lotMin: instrument.lotMin,
      lotMax: instrument.lotMax,
      tickValueUsd: instrument.tickValue,
    });
    return ok({
      ...result,
      riskAmount: result.riskAmount.toString(),
      slDistance: result.slDistance.toString(),
      rawLots: result.rawLots.toString(),
      lots: result.lots.toString(),
      actualRisk: result.actualRisk.toString(),
    });
  } catch (e) {
    return handleRouteError(e);
  }
}
