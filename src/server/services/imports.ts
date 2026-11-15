import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { parseStatementCsv } from "@/lib/finance/import-parsers";
import { addExecution, createTrade } from "./trades";
import { D } from "@/lib/money";

export interface ImportReport {
  platform: string;
  imported: number;
  duplicates: number;
  skipped: number;
  errors: string[];
  unknownSymbols: string[];
}

/**
 * Idempotent import: externalId on the CLOSE execution is
 * `import:{accountId}:{ticket}` — unique per user, so re-importing the same
 * statement is a no-op (PRD acceptance).
 */
export async function importStatement(
  userId: string,
  accountId: string,
  csvText: string,
  req?: Request,
): Promise<ImportReport> {
  const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");

  const parsed = parseStatementCsv(csvText);
  const report: ImportReport = {
    platform: parsed.platform,
    imported: 0,
    duplicates: 0,
    skipped: parsed.skipped,
    errors: parsed.errors,
    unknownSymbols: [],
  };

  for (const row of parsed.rows) {
    const instrument = await prisma.instrument.findUnique({ where: { symbol: row.symbol } });
    if (!instrument) {
      if (!report.unknownSymbols!.includes(row.symbol)) report.unknownSymbols!.push(row.symbol);
      continue;
    }
    const externalId = `import:${account.id}:${row.ticket}`;

    const existing = await prisma.tradeExecution.findFirst({
      where: { userId, externalId },
    });
    if (existing) {
      report.duplicates++;
      continue;
    }

    const existingTrade = await prisma.trade.findFirst({ where: { userId, accountId: account.id, ticket: row.ticket } });
    if (existingTrade && !row.closeTime) { report.duplicates++; continue; }
    const trade = existingTrade ?? await createTrade(userId, {
      accountId: account.id,
      instrumentId: instrument.id,
      direction: row.direction,
      lot: row.lot,
      entryPrice: row.openPrice,
      entryAt: row.openTime,
      initialStopLoss: row.stopLoss,
      initialTakeProfit: row.takeProfit,
      ticket: row.ticket,
      commission: Math.abs(row.commission),
      swap: -row.swap, // broker cash-flow convention → expense convention (credits stay negative)
      fees: Math.abs(row.fees),
    });

    if (row.closeTime && row.closePrice !== undefined) {
      await addExecution(userId, trade.id, {
        kind: "CLOSE",
        quantity: row.lot,
        price: row.closePrice,
        commission: 0, // costs already booked on the ENTRY leg
        swap: 0,
        fees: 0,
        executedAt: row.closeTime,
        externalId,
      });
    }
    report.imported++;
  }

  await audit({
    userId,
    action: "import",
    entity: "Trade",
    entityId: account.id,
    after: { ...report },
    req,
  });
  return report;
}

/** CSV export of closed trades for backup/analysis. */
export async function exportTradesCsv(userId: string, accountId?: string): Promise<string> {
  const trades = await prisma.trade.findMany({
    where: { userId, ...(accountId ? { accountId } : {}) },
    orderBy: { entryAt: "asc" },
    include: { instrument: true, strategy: true },
  });
  const header = [
    "ticket", "symbol", "direction", "status", "lot", "entryPrice", "entryAt",
    "exitPrice", "exitAt", "initialRisk", "plannedRR", "actualR",
    "commission", "swap", "fees", "realizedPnl", "strategy",
  ].join(",");
  const lines = trades.map((t) =>
    [
      t.ticket ?? "",
      t.instrument.symbol,
      t.direction,
      t.status,
      D(t.lot).toString(),
      D(t.entryPrice).toString(),
      t.entryAt.toISOString(),
      t.exitPrice ? D(t.exitPrice).toString() : "",
      t.exitAt ? t.exitAt.toISOString() : "",
      t.initialRisk ? D(t.initialRisk).toString() : "",
      t.plannedRR ? D(t.plannedRR).toString() : "",
      t.actualR ? D(t.actualR).toFixed(2) : "",
      D(t.commission).toString(),
      D(t.swap).toString(),
      D(t.fees).toString(),
      t.realizedPnl ? D(t.realizedPnl).toString() : "",
      t.strategy?.name ?? "",
    ].join(","),
  );
  return [header, ...lines].join("\n");
}
