import { userTimezone } from "./time";
import { Prisma, type LedgerEntryType } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal, fmtUSD0, tradingAmountToUsd } from "@/lib/money";
import { startOfUTCDay, zonedPeriod } from "@/lib/dates";
import type { CreateTransactionInput } from "@/lib/validation/ledger";

/**
 * Ledger — single source of truth for account money.
 *
 * Signed convention:
 *   DEPOSIT +amount | WITHDRAWAL −amount | REALIZED_PNL ±amount
 *   ADJUSTMENT ±amount | FEE −amount | REVERSAL −(signed original)
 *
 * Closing balance = opening + realizedNetPnL + deposits − withdrawals + adjustments
 * is COMPUTED from rows; never stored. Rows are immutable — corrections append a
 * REVERSAL row referencing the original via reversalOfId.
 */

export function signedAmount(type: LedgerEntryType, amount: Decimal): Decimal {
  switch (type) {
    case "DEPOSIT":
    case "REALIZED_PNL":
    case "ADJUSTMENT":
    case "REVERSAL":
      return amount; // already signed at write time
    case "WITHDRAWAL":
    case "FEE":
      return amount.neg();
  }
}

export interface TransactionFilter {
  accountId?: string;
  type?: LedgerEntryType;
  from?: Date;
  to?: Date;
  limit?: number;
  offset?: number;
}

/** Reversals retain their event date while inheriting the original's reporting type. */
export async function attributedLedger(userId: string, db: Prisma.TransactionClient = prisma) {
  const rows = await db.accountTransaction.findMany({
    where: { userId }, orderBy: [{ occurredAt: "asc" }, { createdAt: "asc" }],
  });
  const originals = new Map(rows.map((r) => [r.id, r]));
  return rows.map((row) => {
    const original = row.reversalOfId ? originals.get(row.reversalOfId) : undefined;
    return original ? { ...row, type: original.type, sourceTradeId: original.sourceTradeId } : row;
  });
}

export function canReverseLedgerEntry(entry: {
  type: LedgerEntryType;
  sourceTradeId: string | null;
  withdrawalId: string | null;
  mt5DealId: string | null;
}) {
  return entry.type !== "REVERSAL" && !entry.sourceTradeId && (!entry.withdrawalId || Boolean(entry.mt5DealId));
}

export async function listTransactions(userId: string, filter: TransactionFilter) {
  const where: Prisma.AccountTransactionWhereInput = {
    userId,
    ...(filter.accountId ? { accountId: filter.accountId } : {}),
    ...(filter.type ? { type: filter.type } : {}),
    ...(filter.from || filter.to
      ? {
          occurredAt: {
            ...(filter.from ? { gte: filter.from } : {}),
            ...(filter.to ? { lt: filter.to } : {}),
          },
        }
      : {}),
  };
  const [items, total] = await Promise.all([
    prisma.accountTransaction.findMany({
      where,
      orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
      take: filter.limit ?? 100,
      skip: filter.offset ?? 0,
      include: {
        account: { select: { id: true, name: true } },
        reversals: { select: { id: true }, take: 1 },
      },
    }),
    prisma.accountTransaction.count({ where }),
  ]);
  return { items, total };
}

export async function createManualTransaction(
  userId: string,
  input: CreateTransactionInput,
  req?: Request,
) {
  const account = await prisma.tradingAccount.findFirst({
    where: { id: input.accountId, userId },
  });
  if (!account) throw new ApiError(404, "Akun tidak ditemukan");

  const amount = D(input.amount);
  const row = await prisma.accountTransaction.create({
    data: {
      userId,
      accountId: account.id,
      type: input.type,
      amount: signedAmount(input.type, amount),
      currency: account.currency,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      note: input.note || null,
    },
  });
  await audit({ userId, action: "create", entity: "AccountTransaction", entityId: row.id, after: { ...input }, req });
  return row;
}

/** Corrections never mutate: append a REVERSAL row that negates the original. */
export async function reverseTransaction(userId: string, id: string, reason: string, req?: Request) {
  const { original, reversal } = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const original = await tx.accountTransaction.findFirst({ where: { id, userId } });
    if (!original) throw new ApiError(404, "Transaksi tidak ditemukan");
    if (!canReverseLedgerEntry(original)) {
      throw new ApiError(400, "Entri ini tidak dapat dibatalkan langsung melalui ledger");
    }
    const already = await tx.accountTransaction.findUnique({ where: { reversalOfId: id } });
    if (already) throw new ApiError(400, "Transaksi ini sudah dibatalkan sebelumnya");

    const reversal = await tx.accountTransaction.create({
      data: {
        userId,
        accountId: original.accountId,
        type: "REVERSAL",
        amount: original.amount.neg(),
        currency: original.currency,
        occurredAt: new Date(),
        note: `Pembatalan: ${reason}`,
        reversalOfId: original.id,
      },
    });
    if (original.type === "WITHDRAWAL" && original.mt5DealId && original.withdrawalId) {
      await tx.withdrawal.update({
        where: { id: original.withdrawalId, userId },
        data: { status: "CANCELLED" },
      });
    }
    return { original, reversal };
  });
  await audit({ userId, action: "reverse", entity: "AccountTransaction", entityId: id, before: original, after: reversal, req });
  return reversal;
}

export interface AccountBalance {
  deposits: Decimal;
  withdrawals: Decimal;
  realizedPnl: Decimal;
  adjustments: Decimal;
  fees: Decimal;
  balance: Decimal;
}

/** Aggregate in the account currency, or in USD across all accounts. */
export async function computeBalance(userId: string, accountId?: string, upTo?: Date, db: Prisma.TransactionClient = prisma): Promise<AccountBalance> {
  const rows = await db.accountTransaction.findMany({
    where: {
      userId,
      ...(accountId ? { accountId } : {}),
      ...(upTo ? { occurredAt: { lt: upTo } } : {}),
    },
    select: { type: true, amount: true, currency: true, reversalOfId: true },
  });

  // Reversals cancel their original's bucket contribution (net, not gross):
  // a reversed withdrawal must no longer count as withdrawn.
  const reversalIds = rows
    .filter((r) => r.type === "REVERSAL" && r.reversalOfId)
    .map((r) => r.reversalOfId!);
  const originals = reversalIds.length
    ? await db.accountTransaction.findMany({
        where: { id: { in: reversalIds } },
        select: { id: true, type: true },
      })
    : [];
  const typeById = new Map(originals.map((o) => [o.id, o.type]));

  const acc: AccountBalance = {
    deposits: new Decimal(0),
    withdrawals: new Decimal(0),
    realizedPnl: new Decimal(0),
    adjustments: new Decimal(0),
    fees: new Decimal(0),
    balance: new Decimal(0),
  };

  const addToBucket = (type: LedgerEntryType, amt: Decimal) => {
    switch (type) {
      case "DEPOSIT":
        acc.deposits = acc.deposits.add(amt);
        break;
      case "WITHDRAWAL":
        acc.withdrawals = acc.withdrawals.add(amt.neg());
        break;
      case "REALIZED_PNL":
        acc.realizedPnl = acc.realizedPnl.add(amt);
        break;
      case "ADJUSTMENT":
        acc.adjustments = acc.adjustments.add(amt);
        break;
      case "FEE":
        acc.fees = acc.fees.add(amt.neg());
        break;
      case "REVERSAL":
        break;
    }
  };

  for (const r of rows) {
    const amt = accountId ? D(r.amount) : tradingAmountToUsd(r.amount, r.currency);
    acc.balance = acc.balance.add(amt);
    if (r.type === "REVERSAL") {
      const originalType = r.reversalOfId ? typeById.get(r.reversalOfId) : undefined;
      if (originalType) addToBucket(originalType, amt); // amt = −original → cancels bucket
      continue;
    }
    addToBucket(r.type, amt);
  }
  return acc;
}

export interface BalancePoint {
  date: string; // yyyy-MM-dd
  balance: number;
}

/** Daily cumulative balance series (UTC days) for the balance chart. */
export async function balanceSeries(
  userId: string,
  accountId?: string,
  opts?: { from?: Date; to?: Date },
): Promise<BalancePoint[]> {
  const rows = await prisma.accountTransaction.findMany({
    where: {
      userId,
      ...(accountId ? { accountId } : {}),
      ...(opts?.from || opts?.to
        ? {
            occurredAt: {
              ...(opts?.from ? { gte: opts.from } : {}),
              ...(opts?.to ? { lt: opts.to } : {}),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "asc" },
    select: { occurredAt: true, amount: true, currency: true },
  });
  if (rows.length === 0) return [];

  const byDay = new Map<string, Decimal>();
  for (const r of rows) {
    const key = startOfUTCDay(r.occurredAt).toISOString().slice(0, 10);
    const amount = accountId ? D(r.amount) : tradingAmountToUsd(r.amount, r.currency);
    byDay.set(key, (byDay.get(key) ?? new Decimal(0)).add(amount));
  }
  const days = [...byDay.keys()].sort();
  let running = new Decimal(0);
  const series: BalancePoint[] = [];
  for (const day of days) {
    running = running.add(byDay.get(day) ?? 0);
    series.push({ date: day, balance: Number(running.toFixed(2)) });
  }
  return series;
}

export interface WeeklySummary {
  tradesCount: number;
  realizedPnl: Decimal;
  deposits: Decimal;
  withdrawals: Decimal;
  returnPct: Decimal | null; // vs opening balance of the week
}

export async function weeklySummary(userId: string, at = new Date()): Promise<WeeklySummary> {
  const { start, end } = zonedPeriod("WEEKLY", at, await userTimezone(userId));
  const [opening, rows] = await Promise.all([
    computeBalance(userId, undefined, start),
    prisma.accountTransaction.findMany({
      where: { userId, occurredAt: { gte: start, lt: end } },
      select: { type: true, amount: true, currency: true, sourceTradeId: true, reversalOfId: true },
    }),
  ]);

  // net attribution: a reversal inside the window cancels its original's bucket
  const reversalIds = rows
    .filter((r) => r.type === "REVERSAL" && r.reversalOfId)
    .map((r) => r.reversalOfId!);
  const originals = reversalIds.length
    ? await prisma.accountTransaction.findMany({
        where: { id: { in: reversalIds } },
        select: { id: true, type: true },
      })
    : [];
  const typeById = new Map(originals.map((o) => [o.id, o.type]));

  let realizedPnl = new Decimal(0);
  let deposits = new Decimal(0);
  let withdrawals = new Decimal(0);
  const tradeIds = new Set<string>();

  const bucket = (type: LedgerEntryType, amt: Decimal) => {
    switch (type) {
      case "REALIZED_PNL":
      case "FEE":
        realizedPnl = realizedPnl.add(amt);
        break;
      case "DEPOSIT":
        deposits = deposits.add(amt);
        break;
      case "WITHDRAWAL":
        withdrawals = withdrawals.add(amt.neg());
        break;
      default:
        break;
    }
  };

  for (const r of rows) {
    const amount = tradingAmountToUsd(r.amount, r.currency);
    if (r.type === "REVERSAL") {
      const originalType = r.reversalOfId ? typeById.get(r.reversalOfId) : undefined;
      if (originalType) bucket(originalType, amount); // cancel original
      continue;
    }
    if (r.type === "REALIZED_PNL" && r.sourceTradeId) tradeIds.add(r.sourceTradeId);
    bucket(r.type, amount);
  }
  const base = opening.balance;
  const returnPct = base.isZero() ? null : realizedPnl.div(base).times(100);
  return { tradesCount: tradeIds.size, realizedPnl, deposits, withdrawals, returnPct };
}

/** Milestone achievement check — scans realized balance history (cheap: ledger only). */
export async function checkMilestones(userId: string) {
  const project = await prisma.project.findFirst({
    where: { userId, isActive: true },
    include: { milestones: { orderBy: { order: "asc" } } },
  });
  if (!project) return;
  const series = await balanceSeries(userId);
  const last = series.at(-1);
  if (!last) return;
  const reached = project.milestones.filter((milestone) => !milestone.achievedAt && last.balance >= Number(milestone.amount));
  await Promise.all(reached.map((m) => prisma.$transaction(async (tx) => {
    const { count } = await tx.milestone.updateMany({
      where: { id: m.id, achievedAt: null },
      data: { achievedAt: new Date(), balanceAtHit: last.balance.toFixed(2) },
    });
    if (count === 0) return;
    await tx.notification.create({
      data: {
        userId,
        kind: "milestone",
        title: `Milestone tercapai: ${fmtUSD0(m.amount)}`,
        body: `Balance telah mencapai ${fmtUSD0(m.amount)}.`,
        severity: "INFO",
        link: "/roadmap",
      },
    });
  })));
}
