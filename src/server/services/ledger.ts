import { Prisma, type LedgerEntryType } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { startOfUTCDay, utcWeek } from "@/lib/dates";
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
      include: { account: { select: { id: true, name: true } } },
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
      amount: input.type === "WITHDRAWAL" ? amount.neg() : input.type === "ADJUSTMENT" ? amount : amount,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
      note: input.note || null,
    },
  });
  await audit({ userId, action: "create", entity: "AccountTransaction", entityId: row.id, after: { ...input }, req });
  return row;
}

/** Corrections never mutate: append a REVERSAL row that negates the original. */
export async function reverseTransaction(userId: string, id: string, reason: string, req?: Request) {
  const original = await prisma.accountTransaction.findFirst({ where: { id, userId } });
  if (!original) throw new ApiError(404, "Transaksi tidak ditemukan");
  if (original.type === "REVERSAL") throw new ApiError(400, "Transaksi reversal tidak dapat dibatalkan lagi");
  const already = await prisma.accountTransaction.findFirst({ where: { reversalOfId: id } });
  if (already) throw new ApiError(400, "Transaksi ini sudah dibatalkan sebelumnya");

  const reversal = await prisma.accountTransaction.create({
    data: {
      userId,
      accountId: original.accountId,
      type: "REVERSAL",
      amount: original.amount.neg(),
      occurredAt: new Date(),
      note: `Pembatalan: ${reason}`,
      reversalOfId: original.id,
    },
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

/** Aggregate ledger for one account (or all user accounts when accountId omitted). */
export async function computeBalance(userId: string, accountId?: string, upTo?: Date): Promise<AccountBalance> {
  const rows = await prisma.accountTransaction.findMany({
    where: {
      userId,
      ...(accountId ? { accountId } : {}),
      ...(upTo ? { occurredAt: { lt: upTo } } : {}),
    },
    select: { type: true, amount: true, reversalOfId: true },
  });

  // Reversals cancel their original's bucket contribution (net, not gross):
  // a reversed withdrawal must no longer count as withdrawn.
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
    const amt = D(r.amount);
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
    select: { occurredAt: true, amount: true },
  });
  if (rows.length === 0) return [];

  const byDay = new Map<string, Decimal>();
  for (const r of rows) {
    const key = startOfUTCDay(r.occurredAt).toISOString().slice(0, 10);
    byDay.set(key, (byDay.get(key) ?? new Decimal(0)).add(D(r.amount)));
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
  const { start, end } = utcWeek(at);
  const opening = await computeBalance(userId, undefined, start);
  const rows = await prisma.accountTransaction.findMany({
    where: { userId, occurredAt: { gte: start, lt: end } },
    select: { type: true, amount: true, sourceTradeId: true, reversalOfId: true },
  });

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
    if (r.type === "REVERSAL") {
      const originalType = r.reversalOfId ? typeById.get(r.reversalOfId) : undefined;
      if (originalType) bucket(originalType, D(r.amount)); // cancel original
      continue;
    }
    if (r.type === "REALIZED_PNL" && r.sourceTradeId) tradeIds.add(r.sourceTradeId);
    bucket(r.type, D(r.amount));
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
  for (const m of project.milestones) {
    if (!m.achievedAt && last.balance >= Number(m.amount)) {
      await prisma.milestone.update({
        where: { id: m.id },
        data: { achievedAt: new Date(), balanceAtHit: last.balance.toFixed(2) },
      });
      await prisma.notification.create({
        data: {
          userId,
          kind: "milestone",
          title: `Milestone tercapai: ${m.label ?? `$${m.amount}`}`,
          body: `Balance telah mencapai $${Number(m.amount).toLocaleString("en-US")}.`,
          severity: "INFO",
          link: "/roadmap",
        },
      });
    }
  }
}
