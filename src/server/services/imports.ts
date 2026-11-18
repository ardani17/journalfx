import { Prisma } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { parseMt5Report } from "@/server/mt5-report";
import { createTradeEntry, findInstrumentBySymbol, lockTradeWrites, recordTradeExecution } from "./trades";

export interface ImportReport {
  imported: number;
  duplicates: number;
  depositsImported: number;
  withdrawalsImported: number;
  cashflowDuplicates: number;
  skipped: number;
  errors: string[];
  registeredSymbols: string[];
}

export async function importStatement(
  userId: string,
  accountId: string,
  bytes: Buffer,
  req?: Request,
): Promise<ImportReport> {
  const account = await prisma.tradingAccount.findFirst({ where: { id: accountId, userId } });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");
  if (account.currency !== "USD") throw new ApiError(400, "Pilih akun tujuan dengan mata uang USD");

  const { positions, cashflows, errors } = await parseMt5Report(bytes);
  const report: ImportReport = {
    imported: 0, duplicates: 0, depositsImported: 0, withdrawalsImported: 0, cashflowDuplicates: 0,
    skipped: errors.length, errors, registeredSymbols: [],
  };

  for (const row of positions) {
    try {
      const result = await prisma.$transaction(async (tx) => {
        await lockTradeWrites(tx, userId);
        const existingTrade = await tx.trade.findUnique({
          where: { accountId_ticket: { accountId, ticket: row.ticket } },
          select: { id: true },
        });
        if (existingTrade) return null;

        const pricePrecision = Math.max(2, row.openPrice.decimalPlaces(), row.closePrice.decimalPlaces(),
          row.stopLoss?.decimalPlaces() ?? 0, row.takeProfit?.decimalPlaces() ?? 0);
        const existingInstrument = await findInstrumentBySymbol(tx, userId, row.symbol);
        const instrument = existingInstrument ?? await tx.instrument.create({
          data: { ownerId: userId, symbol: row.symbol, name: row.symbol, category: "custom", pricePrecision },
        });
        if (instrument.ownerId === userId && instrument.pricePrecision < pricePrecision) {
          await tx.instrument.update({ where: { id: instrument.id }, data: { pricePrecision } });
        }

        const trade = await createTradeEntry(tx, userId, instrument, {
          accountId,
          ticket: row.ticket,
          direction: row.direction,
          lot: row.lot,
          entryAt: row.openAt,
          entryPrice: row.openPrice,
          initialStopLoss: row.stopLoss,
          initialTakeProfit: row.takeProfit,
          commission: row.commission,
          swap: row.swap,
          fees: 0,
        });
        await recordTradeExecution(tx, userId, trade.id, {
          kind: "CLOSE",
          quantity: row.lot,
          price: row.closePrice,
          executedAt: row.closeAt,
          commission: 0,
          swap: 0,
          fees: 0,
          externalId: `import:${accountId}:${row.ticket}`,
        }, row.netPnl);
        return { registeredSymbol: existingInstrument ? null : row.symbol };
      });

      if (!result) {
        report.duplicates++;
        continue;
      }
      report.imported++;
      if (result.registeredSymbol) report.registeredSymbols.push(result.registeredSymbol);
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || !["P2000", "P2020"].includes(error.code)) throw error;
      report.skipped++;
      report.errors.push(`Baris ${row.rowNumber} · Nilai posisi di luar rentang yang didukung`);
    }
  }

  for (const row of cashflows) {
    const imported = await prisma.$transaction(async (tx) => {
      await lockTradeWrites(tx, userId);
      const existing = await tx.accountTransaction.findUnique({
        where: { accountId_mt5DealId: { accountId, mt5DealId: row.dealId } },
        select: { id: true },
      });
      if (existing) return false;

      const withdrawal = row.type === "WITHDRAWAL" ? await tx.withdrawal.create({
        data: {
          userId, projectId: account.projectId, accountId, status: "COMPLETED",
          amountUSD: row.amount.abs(), completedAt: row.occurredAt, note: row.comment,
        },
        select: { id: true },
      }) : null;
      await tx.accountTransaction.create({
        data: {
          userId, accountId, type: row.type, amount: row.amount, currency: account.currency,
          occurredAt: row.occurredAt, note: row.comment, mt5DealId: row.dealId, withdrawalId: withdrawal?.id,
        },
      });
      return true;
    });
    if (!imported) report.cashflowDuplicates++;
    else if (row.type === "DEPOSIT") report.depositsImported++;
    else report.withdrawalsImported++;
  }

  report.registeredSymbols.sort();
  await audit({ userId, action: "import", entity: "TradingAccount", entityId: accountId, after: { ...report }, req });
  return report;
}
