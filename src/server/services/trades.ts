import { Prisma, type Trade } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal, tradingAmountToUsd } from "@/lib/money";
import {
  actualR,
  avgEntryPrice,
  closePnl,
  deriveStatus,
  initialRiskUsd,
  plannedRR,
  rollupExecutions,
} from "@/lib/finance/trades";
import type { CreateTradeInput, AddExecutionInput } from "@/lib/validation/trades";
import { isTradeJournalComplete, journalCompletionSelect } from "@/lib/trade-journal-completion";
import { requireActiveAccount } from "./accounts";

/**
 * Trade lifecycle service.
 *
 * Invariants:
 * - Executions are the source of truth for quantities and realized P&L.
 * - Every (partial) close posts exactly one REALIZED_PNL row to the account
 *   ledger atomically with the execution (sourceTradeId links them).
 * - Trade.realizedPnl is the cumulative sum of close executions.
 * - Status is derived from entered vs closed quantity, never stored by hand.
 */

export function findInstrumentBySymbol(db: Prisma.TransactionClient, userId: string, symbol: string) {
  return db.instrument.findFirst({
    where: { symbol, OR: [{ ownerId: null }, { ownerId: userId }] },
    orderBy: { ownerId: { sort: "asc", nulls: "first" } },
  });
}

async function resolveInstrument(userId: string, input: CreateTradeInput) {
  if (input.instrumentId) {
    const inst = await prisma.instrument.findFirst({
      where: { id: input.instrumentId, OR: [{ ownerId: null }, { ownerId: userId }] },
    });
    if (!inst) throw new ApiError(404, "Instrumen tidak ditemukan");
    return inst;
  }
  const symbol = input.symbol?.toUpperCase();
  if (!symbol) throw new ApiError(400, "instrumentId atau symbol wajib diisi");
  const inst = await findInstrumentBySymbol(prisma, userId, symbol);
  if (!inst) throw new ApiError(404, `Instrumen ${symbol} belum terdaftar`);
  return inst;
}

export async function lockTradeWrites(tx: Prisma.TransactionClient, userId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
}

export async function raiseInstrumentPricePrecision(
  tx: Prisma.TransactionClient,
  userId: string,
  instrument: { id: string; ownerId: string | null; pricePrecision: number },
  precision: number,
) {
  if (instrument.ownerId !== userId || instrument.pricePrecision >= precision) return;
  await tx.instrument.updateMany({
    where: { id: instrument.id, ownerId: userId, pricePrecision: { lt: precision } },
    data: { pricePrecision: precision },
  });
}

export async function registerTradeInstrument(userId: string, symbol: string, req?: Request) {
  const { instrument, created } = await prisma.$transaction(async (tx) => {
    await lockTradeWrites(tx, userId);
    const existing = await findInstrumentBySymbol(tx, userId, symbol);
    if (existing) return { instrument: existing, created: false };

    const instrument = await tx.instrument.create({
      data: { ownerId: userId, symbol, name: symbol, category: "custom" },
    });
    return { instrument, created: true };
  });

  if (created) await audit({ userId, action: "create", entity: "Instrument", entityId: instrument.id, after: { symbol }, req });
  return { id: instrument.id, symbol: instrument.symbol };
}

export async function createTrade(userId: string, input: CreateTradeInput, req?: Request) {
  await requireActiveAccount(userId, input.accountId);
  if (input.strategyId) {
    const strategy = await prisma.strategy.findFirst({ where: { id: input.strategyId, userId } });
    if (!strategy) throw new ApiError(404, "Strategi tidak ditemukan");
  }
  const instrument = await resolveInstrument(userId, input);

  const trade = await prisma.$transaction(async (tx) => {
    await lockTradeWrites(tx, userId);
    const account = await requireActiveAccount(userId, input.accountId, tx);
    if (input.ticket) {
      const dup = await tx.trade.findUnique({ where: { accountId_ticket: { accountId: account.id, ticket: input.ticket } } });
      if (dup) throw new ApiError(409, `Trade dengan ticket ${input.ticket} sudah ada`);
    }
    const pricePrecision = Math.max(...[input.entryPrice, input.initialStopLoss, input.initialTakeProfit]
      .map((price) => D(price).toDecimalPlaces(6).decimalPlaces()));
    await raiseInstrumentPricePrecision(tx, userId, instrument, pricePrecision);
    return createTradeEntry(tx, userId, instrument, input);
  });

  await audit({ userId, action: "create", entity: "Trade", entityId: trade.id, after: { ticket: input.ticket, direction: input.direction }, req });
  return trade;
}

type EntryInput = Omit<CreateTradeInput, "lot" | "entryPrice" | "entryAt" | "initialStopLoss" | "initialTakeProfit" | "commission" | "swap"> & {
  lot: Decimal.Value;
  entryPrice: Decimal.Value;
  entryAt: Date | string;
  initialStopLoss?: Decimal.Value | null;
  initialTakeProfit?: Decimal.Value | null;
  commission: Decimal.Value;
  swap: Decimal.Value;
};

export async function createTradeEntry(
  tx: Prisma.TransactionClient,
  userId: string,
  instrument: { id: string; contractSize: Decimal | null },
  input: EntryInput,
) {
  const lot = D(input.lot);
  const entry = D(input.entryPrice);
  const sl = input.initialStopLoss != null ? D(input.initialStopLoss) : null;
  const tp = input.initialTakeProfit != null ? D(input.initialTakeProfit) : null;
  const spec = instrument.contractSize === null ? null : { contractSize: instrument.contractSize };
  const commission = D(input.commission);
  const swap = D(input.swap);
  const fees = D(input.fees);
  const entryAt = new Date(input.entryAt);

  return tx.trade.create({
    data: {
      userId,
      accountId: input.accountId,
      instrumentId: instrument.id,
      strategyId: input.strategyId || null,
      ticket: input.ticket || null,
      direction: input.direction,
      status: "OPEN",
      lot,
      entryPrice: entry,
      initialStopLoss: sl,
      initialTakeProfit: tp,
      initialRisk: spec ? initialRiskUsd(input.direction, entry, sl, spec, lot) : null,
      plannedRR: spec ? plannedRR(input.direction, entry, sl, tp, spec, lot) : null,
      session: input.session || null,
      timeframe: input.timeframe || null,
      commission,
      swap,
      fees,
      entryAt,
      executions: { create: { userId, kind: "ENTRY", quantity: lot, price: entry, commission, swap, fees, executedAt: entryAt } },
      journal: {
        create: {
          marketContext: input.marketContext || null,
          entryReason: input.entryReason || null,
          preChecklist: input.preChecklist ?? undefined,
        },
      },
    },
  });
}

export async function getTrade(userId: string, id: string) {
  const trade = await prisma.trade.findFirst({
    where: { id, userId },
    include: {
      instrument: true,
      strategy: true,
      account: { select: { id: true, name: true, currency: true } },
      executions: { orderBy: { executedAt: "asc" } },
      journal: true,
      attachments: { orderBy: { createdAt: "asc" } },
    },
  });
  if (!trade) throw new ApiError(404, "Trade tidak ditemukan");
  return trade;
}

export interface ListTradesFilter {
  accountId?: string;
  status?: string;
  strategyId?: string;
  result?: "win" | "loss" | "be";
  from?: Date;
  to?: Date;
  q?: string;
  sort?: "asc" | "desc";
  limit: number;
  offset: number;
}

export function tradeFilterWhere(userId: string, filter: Omit<ListTradesFilter, "limit" | "offset">): Prisma.TradeWhereInput {
  return {
    userId,
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(filter.status ? { status: filter.status as Trade["status"] } : {}),
    ...(filter.strategyId ? { strategyId: filter.strategyId } : {}),
    ...(filter.from || filter.to
      ? {
          entryAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
    ...(filter.result
      ? {
          realizedPnl:
            filter.result === "win"
              ? { gt: 0 }
              : filter.result === "loss"
                ? { lt: 0 }
                : 0,
        }
      : {}),
    ...(filter.q
      ? {
          OR: [
            { ticket: { contains: filter.q, mode: "insensitive" } },
            { journal: { is: { entryReason: { contains: filter.q, mode: "insensitive" } } } },
          ],
        }
      : {}),
  };
}

export async function listTrades(userId: string, filter: ListTradesFilter, includeJournalCompletion = false) {
  const sort = filter.sort ?? "desc";
  const where = tradeFilterWhere(userId, filter);
  const [items, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ entryAt: sort }, { createdAt: sort }, { id: sort }],
      take: filter.limit,
      skip: filter.offset,
      include: {
        instrument: { select: { symbol: true, pricePrecision: true } },
        account: { select: { currency: true } },
        strategy: { select: { name: true } },
        journal: { select: journalCompletionSelect },
      },
    }),
    prisma.trade.count({ where }),
  ]);
  return {
    items: items.map(({ journal, ...trade }) => ({
      ...trade,
      journal: journal ? { tags: journal.tags, mistakes: journal.mistakes } : null,
      ...(includeJournalCompletion ? { journalComplete: isTradeJournalComplete(journal) } : {}),
    })),
    total,
  };
}

/** Add an execution; CLOSE/PARTIAL_CLOSE posts realized P&L to the ledger atomically. */
export async function addExecution(
  userId: string,
  tradeId: string,
  input: AddExecutionInput,
  req?: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    await lockTradeWrites(tx, userId);
    return recordTradeExecution(tx, userId, tradeId, input);
  });

  await audit({ userId, action: "create", entity: "TradeExecution", entityId: result.execution.id, after: { ...input, realizedPnl: result.execution.realizedPnl?.toString() }, req });
  return result;
}

type ExecutionInput = Omit<AddExecutionInput, "quantity" | "price" | "executedAt"> & {
  quantity: Decimal.Value;
  price: Decimal.Value;
  executedAt?: Date | string;
};

export async function recordTradeExecution(
  tx: Prisma.TransactionClient,
  userId: string,
  tradeId: string,
  input: ExecutionInput,
  brokerNetPnl?: Decimal,
) {
  const trade = await tx.trade.findFirst({
    where: { id: tradeId, userId },
    include: { executions: true, instrument: true, account: { select: { currency: true } } },
  });
  if (!trade) throw new ApiError(404, "Trade tidak ditemukan");
  if (trade.status === "CANCELLED") throw new ApiError(400, "Trade sudah dibatalkan");
  if (trade.status === "CLOSED") throw new ApiError(400, "Trade sudah ditutup");

  if (input.externalId) {
    const dup = await tx.tradeExecution.findUnique({ where: { userId_externalId: { userId, externalId: input.externalId } } });
    if (dup) throw new ApiError(409, "Eksekusi dengan ID eksternal tersebut sudah ada");
  }

  const currency = trade.account.currency;
  const spec = trade.instrument.contractSize === null ? null : { contractSize: trade.instrument.contractSize, accountCurrency: currency };
  const isClose = input.kind === "CLOSE" || input.kind === "PARTIAL_CLOSE";
  const qty = D(input.quantity);
  const price = D(input.price);
  const rollupBefore = rollupExecutions(trade.direction, trade.executions, spec);
  const enteredBefore = rollupBefore.openQty.add(rollupBefore.closedQty);

  if (input.reportedNetPnl !== undefined && (spec || !isClose)) {
    throw new ApiError(400, "P&L manual hanya untuk penutupan instrumen tanpa spesifikasi kontrak");
  }

  let closeNet: Decimal | null = null;
  if (isClose) {
    if (qty.gt(rollupBefore.openQty)) {
      throw new ApiError(400, `Quantity close (${qty}) melebihi posisi terbuka (${rollupBefore.openQty})`);
    }
    if (brokerNetPnl !== undefined) {
      closeNet = brokerNetPnl;
    } else if (input.reportedNetPnl !== undefined) {
      closeNet = D(input.reportedNetPnl);
    } else if (spec) {
      const entries = trade.executions.filter((e) => e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY");
      const entryCosts = entries.reduce((s, e) => s.add(D(e.commission)).add(D(e.swap)).add(D(e.fees)), new Decimal(0));
      const entryCostShare = enteredBefore.isZero() ? new Decimal(0) : entryCosts.times(qty.div(enteredBefore));
      closeNet = closePnl(trade.direction, avgEntryPrice(entries), { ...input, quantity: qty, price }, spec).minus(entryCostShare);
    } else {
      throw new ApiError(400, "Masukkan P&L bersih dari broker untuk menutup posisi ini");
    }
  } else if (enteredBefore.add(qty).gt(D(trade.lot))) {
    throw new ApiError(400, `Total entry (${enteredBefore.add(qty)}) melebihi lot trade (${trade.lot})`);
  }

  const execution = await tx.tradeExecution.create({
    data: {
      userId,
      tradeId,
      kind: input.kind,
      quantity: qty,
      price,
      commission: D(input.commission),
      swap: D(input.swap),
      fees: D(input.fees),
      realizedPnl: closeNet,
      executedAt: input.executedAt ? new Date(input.executedAt) : new Date(),
      externalId: input.externalId || null,
    },
  });
  await raiseInstrumentPricePrecision(tx, userId, trade.instrument, execution.price.decimalPlaces());

  if (execution.realizedPnl !== null) {
    await tx.accountTransaction.create({
      data: {
        userId,
        accountId: trade.accountId,
        type: "REALIZED_PNL",
        amount: execution.realizedPnl,
        currency,
        occurredAt: execution.executedAt,
        note: `${trade.instrument.symbol} ${trade.direction} ${input.kind === "CLOSE" ? "close" : "partial close"} ${qty}`,
        sourceTradeId: trade.id,
      },
    });
  }

  const executions = [...trade.executions, execution].sort((a, b) => a.executedAt.getTime() - b.executedAt.getTime());
  const rollup = rollupExecutions(trade.direction, executions, spec);
  const entered = rollup.openQty.add(rollup.closedQty);
  const status = deriveStatus(false, entered, rollup.closedQty);
  const lastClose = executions.findLast((e) => e.kind === "CLOSE" || e.kind === "PARTIAL_CLOSE");

  const updated = await tx.trade.update({
    where: { id: tradeId },
    data: {
      status,
      realizedPnl: rollup.closedQty.isZero() ? null : rollup.realizedPnl,
      actualR: rollup.closedQty.isZero() || !trade.initialRisk
        ? null
        : actualR(tradingAmountToUsd(rollup.realizedPnl, currency), D(trade.initialRisk)),
      exitPrice: lastClose ? D(lastClose.price) : null,
      exitAt: lastClose?.executedAt ?? null,
      commission: executions.reduce((s, e) => s.add(D(e.commission)), new Decimal(0)),
      swap: executions.reduce((s, e) => s.add(D(e.swap)), new Decimal(0)),
      fees: executions.reduce((s, e) => s.add(D(e.fees)), new Decimal(0)),
    },
  });
  return { execution, trade: updated, rollup };
}

export async function cancelTrade(userId: string, tradeId: string, reason: string, req?: Request) {
  const { trade, updated } = await prisma.$transaction(async (tx) => {
    await lockTradeWrites(tx, userId);
    const trade = await tx.trade.findFirst({ where: { id: tradeId, userId } });
    if (!trade) throw new ApiError(404, "Trade tidak ditemukan");
    if (trade.status === "CANCELLED") throw new ApiError(400, "Trade sudah dibatalkan");
    if (trade.status === "PARTIAL" || trade.status === "CLOSED" || trade.realizedPnl != null) {
      throw new ApiError(400, "Trade terealisasi tidak dapat dibatalkan — gunakan koreksi ledger yang diaudit");
    }
    const updated = await tx.trade.update({
      where: { id: tradeId },
      data: { status: "CANCELLED" },
    });
    return { trade, updated };
  });
  await audit({ userId, action: "cancel", entity: "Trade", entityId: tradeId, before: { status: trade.status }, after: { status: "CANCELLED", reason }, req });
  return updated;
}
