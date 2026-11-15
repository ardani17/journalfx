import { Prisma, type Trade } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
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

async function resolveInstrument(input: CreateTradeInput) {
  if (input.instrumentId) {
    const inst = await prisma.instrument.findUnique({ where: { id: input.instrumentId } });
    if (!inst) throw new ApiError(404, "Instrumen tidak ditemukan");
    return inst;
  }
  const symbol = input.symbol?.toUpperCase();
  if (!symbol) throw new ApiError(400, "instrumentId atau symbol wajib diisi");
  const inst = await prisma.instrument.findUnique({ where: { symbol } });
  if (!inst) throw new ApiError(404, `Instrumen ${symbol} belum terdaftar`);
  return inst;
}

export async function createTrade(userId: string, input: CreateTradeInput, req?: Request) {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: input.accountId, userId },
  });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");
  const instrument = await resolveInstrument(input);

  if (input.ticket) {
    const dup = await prisma.trade.findFirst({
      where: { accountId: account.id, ticket: input.ticket },
    });
    if (dup) throw new ApiError(409, `Trade dengan ticket ${input.ticket} sudah ada`);
  }

  const lot = D(input.lot);
  const entry = D(input.entryPrice);
  const sl = input.initialStopLoss !== undefined ? D(input.initialStopLoss) : null;
  const tp = input.initialTakeProfit !== undefined ? D(input.initialTakeProfit) : null;
  const spec = { contractSize: instrument.contractSize };

  const risk = sl !== null ? initialRiskUsd(input.direction, entry, sl, spec, lot) : null;
  const rr = plannedRR(input.direction, entry, sl, tp, spec, lot);

  const trade = await prisma.$transaction(async (tx) => {
    const t = await tx.trade.create({
      data: {
        userId,
        accountId: account.id,
        instrumentId: instrument.id,
        strategyId: input.strategyId || null,
        ticket: input.ticket || null,
        direction: input.direction,
        status: "OPEN",
        lot,
        entryPrice: entry,
        initialStopLoss: sl,
        initialTakeProfit: tp,
        initialRisk: risk,
        plannedRR: rr,
        session: input.session || null,
        timeframe: input.timeframe || null,
        commission: D(input.commission),
        swap: D(input.swap),
        fees: D(input.fees),
        entryAt: new Date(input.entryAt),
      },
    });
    await tx.tradeExecution.create({
      data: {
        userId,
        tradeId: t.id,
        kind: "ENTRY",
        quantity: lot,
        price: entry,
        commission: D(input.commission),
        swap: D(input.swap),
        fees: D(input.fees),
        executedAt: new Date(input.entryAt),
      },
    });
    await tx.tradeJournal.create({
      data: {
        tradeId: t.id,
        marketContext: input.marketContext || null,
        entryReason: input.entryReason || null,
        preChecklist: (input.preChecklist ?? undefined) as object | undefined,
      },
    });
    return t;
  });

  await audit({ userId, action: "create", entity: "Trade", entityId: trade.id, after: { ticket: input.ticket, direction: input.direction }, req });
  return trade;
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
  limit: number;
  offset: number;
}

export async function listTrades(userId: string, filter: ListTradesFilter) {
  const where: Prisma.TradeWhereInput = {
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
            { journal: { isNot: { entryReason: null } } },
          ],
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.trade.findMany({
      where,
      orderBy: [{ entryAt: "desc" }, { createdAt: "desc" }],
      take: filter.limit,
      skip: filter.offset,
      include: {
        instrument: { select: { symbol: true, pricePrecision: true } },
        strategy: { select: { name: true } },
        journal: { select: { tags: true, mistakes: true } },
      },
    }),
    prisma.trade.count({ where }),
  ]);
  return { items, total };
}

/** Add an execution; CLOSE/PARTIAL_CLOSE posts realized P&L to the ledger atomically. */
export async function addExecution(
  userId: string,
  tradeId: string,
  input: AddExecutionInput,
  req?: Request,
) {
  const trade = await prisma.trade.findFirst({
    where: { id: tradeId, userId },
    include: { executions: true, instrument: true },
  });
  if (!trade) throw new ApiError(404, "Trade tidak ditemukan");
  if (trade.status === "CANCELLED") throw new ApiError(400, "Trade sudah dibatalkan");

  if (input.externalId) {
    const dup = await prisma.tradeExecution.findFirst({
      where: { userId, externalId: input.externalId },
    });
    if (dup) throw new ApiError(409, "Eksekusi dengan ID eksternal tersebut sudah ada (dedup)");
  }

  const spec = { contractSize: trade.instrument.contractSize };
  const isClose = input.kind === "CLOSE" || input.kind === "PARTIAL_CLOSE";
  const qty = D(input.quantity);

  const rollupBefore = rollupExecutions(trade.direction, trade.executions, spec);
  if (isClose) {
    if (qty.gt(rollupBefore.openQty)) {
      throw new ApiError(
        400,
        `Quantity close (${qty}) melebihi posisi terbuka (${rollupBefore.openQty})`,
      );
    }
  } else {
    const enteredTotal = rollupBefore.openQty.add(rollupBefore.closedQty).add(qty);
    if (enteredTotal.gt(D(trade.lot))) {
      throw new ApiError(400, `Total entry (${enteredTotal}) melebihi lot trade (${trade.lot})`);
    }
  }

  const entryAvg = avgEntryPrice(
    trade.executions.filter((e) => e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY"),
  );

  let closeNet: Decimal | null = null;
  if (isClose) {
    // Net P&L includes the proportional share of entry-leg costs
    // (commission/swap/fees) plus this close's own costs — so the ledger
    // REALIZED_PNL row always reflects the fully netted figure.
    const enteredBefore = rollupBefore.openQty.add(rollupBefore.closedQty);
    const entryCosts = trade.executions
      .filter((e) => e.kind === "ENTRY" || e.kind === "PARTIAL_ENTRY")
      .reduce((s, e) => s.add(D(e.commission)).add(D(e.swap)).add(D(e.fees)), new Decimal(0));
    const entryCostShare = enteredBefore.isZero()
      ? new Decimal(0)
      : entryCosts.times(qty.div(enteredBefore));
    closeNet = closePnl(trade.direction, entryAvg, input, spec).minus(entryCostShare);
  }

  const result = await prisma.$transaction(async (tx) => {
    const execution = await tx.tradeExecution.create({
      data: {
        userId,
        tradeId,
        kind: input.kind,
        quantity: qty,
        price: D(input.price),
        commission: D(input.commission),
        swap: D(input.swap),
        fees: D(input.fees),
        realizedPnl: closeNet,
        executedAt: input.executedAt ? new Date(input.executedAt) : new Date(),
        externalId: input.externalId || null,
      },
    });

    if (closeNet !== null) {
      await tx.accountTransaction.create({
        data: {
          userId,
          accountId: trade.accountId,
          type: "REALIZED_PNL",
          amount: closeNet,
          occurredAt: execution.executedAt,
          note: `${trade.instrument.symbol} ${trade.direction} ${input.kind === "CLOSE" ? "close" : "partial close"} ${qty}`,
          sourceTradeId: trade.id,
        },
      });
    }

    const executions = await tx.tradeExecution.findMany({
      where: { tradeId },
      orderBy: { executedAt: "asc" },
    });
    const rollup = rollupExecutions(trade.direction, executions, spec);
    const entered = rollup.openQty.add(rollup.closedQty);
    const status = deriveStatus(false, entered, rollup.closedQty);
    const lastClose = [...executions].reverse().find((e) => e.kind === "CLOSE" || e.kind === "PARTIAL_CLOSE");
    // Net realized P&L = Σ per-close net (each already carries its cost share)
    const netRealized = executions.reduce(
      (s, e) => (e.realizedPnl !== null ? s.add(D(e.realizedPnl)) : s),
      new Decimal(0),
    );

    const updated = await tx.trade.update({
      where: { id: tradeId },
      data: {
        status,
        realizedPnl: rollup.closedQty.isZero() ? null : netRealized,
        actualR:
          rollup.closedQty.isZero() || !trade.initialRisk
            ? null
            : actualR(netRealized, D(trade.initialRisk)),
        exitPrice: lastClose ? D(lastClose.price) : null,
        exitAt: lastClose ? lastClose.executedAt : null,
        commission: executions.reduce((s, e) => s.add(D(e.commission)), new Decimal(0)),
        swap: executions.reduce((s, e) => s.add(D(e.swap)), new Decimal(0)),
        fees: executions.reduce((s, e) => s.add(D(e.fees)), new Decimal(0)),
      },
    });
    return { execution, trade: updated, rollup };
  });

  await audit({ userId, action: "create", entity: "TradeExecution", entityId: result.execution.id, after: { ...input, realizedPnl: closeNet?.toString() }, req });
  return result;
}

export async function cancelTrade(userId: string, tradeId: string, reason: string, req?: Request) {
  const trade = await prisma.trade.findFirst({ where: { id: tradeId, userId } });
  if (!trade) throw new ApiError(404, "Trade tidak ditemukan");
  if (trade.status === "CANCELLED") throw new ApiError(400, "Trade sudah dibatalkan");
  const updated = await prisma.trade.update({
    where: { id: tradeId },
    data: { status: "CANCELLED" },
  });
  await audit({ userId, action: "cancel", entity: "Trade", entityId: tradeId, before: { status: trade.status }, after: { status: "CANCELLED", reason }, req });
  return updated;
}
