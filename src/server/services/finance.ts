import { randomUUID } from "node:crypto";
import { userTimezone } from "./time";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { DEBT_PERIODS_PER_YEAR, debtDateKey, debtSchedule, isRecurringDebt, splitDebtPayment, projectRepayment } from "@/lib/finance/debt";
import type { DebtCreateInput, DebtTermsInput } from "@/lib/validation/finance";
import { zonedPeriod } from "@/lib/dates";

/** Reversals cancel the original entry in reports, including across date windows. */
export async function effectiveFinancialTransactions(userId: string) {
  const rows = await prisma.financialTransaction.findMany({ where: { userId } });
  const reversed = new Set(rows.flatMap((r) => r.reversalOfId ? [r.reversalOfId] : []));
  return rows.filter((r) => !r.reversalOfId && !reversed.has(r.id));
}

export async function financialTotals(userId: string) {
  const rows = await effectiveFinancialTransactions(userId);
  const sumKind = (kind: "INCOME" | "EXPENSE") => rows
    .filter((r) => r.kind === kind && r.currency === "IDR")
    .reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  return { income: sumKind("INCOME"), expense: sumKind("EXPENSE") };
}

/* ───────────────────────── Budget & expenses ───────────────────────── */

export async function ensureCurrentBudget(userId: string) {
  const { start, end } = zonedPeriod("MONTHLY", new Date(), await userTimezone(userId));
  let budget = await prisma.budget.findFirst({
    where: { userId, periodStart: start, periodEnd: end, isActive: true },
    include: { categories: { orderBy: { order: "asc" } } },
  });
  if (!budget) {
    // carry categories from the most recent budget, planned amounts unchanged
    const prev = await prisma.budget.findFirst({
      where: { userId, isActive: true },
      orderBy: { periodStart: "desc" },
      include: { categories: { orderBy: { order: "asc" } } },
    });
    budget = await prisma.budget.create({
      data: {
        userId,
        periodStart: start,
        periodEnd: end,
        categories: prev
          ? {
              create: prev.categories.map((c) => ({
                userId,
                name: c.name,
                plannedAmount: c.plannedAmount,
                order: c.order,
              })),
            }
          : undefined,
      },
      include: { categories: { orderBy: { order: "asc" } } },
    });
  }
  return budget;
}

export async function budgetOverview(userId: string) {
  const budget = await ensureCurrentBudget(userId);
  const planned = budget.categories
    .filter((c) => c.isActive)
    .reduce((s, c) => s.add(D(c.plannedAmount)), new Decimal(0));
  const rows = (await effectiveFinancialTransactions(userId)).filter((r) =>
    r.currency === "IDR" && r.occurredAt >= budget.periodStart && r.occurredAt < budget.periodEnd);
  const spentByCat = new Map<string | null, Decimal>();
  for (const r of rows.filter((r) => r.kind === "EXPENSE" && !r.debtId)) {
    spentByCat.set(r.categoryId, (spentByCat.get(r.categoryId) ?? D(0)).plus(D(r.amount)));
  }
  const totalSpent = [...spentByCat.values()].reduce((s, v) => s.add(v), new Decimal(0));
  const livingBuckets = await prisma.financialBucket.findMany({ where: { userId, kind: "LIVING" }, select: { id: true } });
  const livingIds = new Set(livingBuckets.map((b) => b.id));
  const funded = rows.filter((r) => r.kind === "ALLOCATION" && r.bucketId && livingIds.has(r.bucketId))
    .reduce((sum, r) => sum.plus(D(r.amount)), D(0));
  return {
    budget,
    planned,
    totalSpent,
    funded,
    coveragePct: planned.isZero() ? 0 : Number(funded.div(planned).times(100).toFixed(1)),
    categories: budget.categories.map((c) => ({
      ...c,
      spent: spentByCat.get(c.id) ?? new Decimal(0),
    })),
  };
}

export async function addCategory(userId: string, name: string, plannedAmount: number, req?: Request) {
  const budget = await ensureCurrentBudget(userId);
  const c = await prisma.expenseCategory.create({
    data: {
      userId,
      budgetId: budget.id,
      name,
      plannedAmount: new Decimal(plannedAmount),
      order: budget.categories.length,
    },
  });
  await audit({ userId, action: "create", entity: "ExpenseCategory", entityId: c.id, after: { name, plannedAmount }, req });
  return c;
}

export async function removeCategory(userId: string, id: string, req?: Request) {
  const c = await prisma.expenseCategory.findFirst({ where: { id, userId } });
  if (!c) throw new ApiError(404, "Kategori tidak ditemukan");
  await prisma.expenseCategory.update({ where: { id }, data: { isActive: false } });
  await audit({ userId, action: "delete", entity: "ExpenseCategory", entityId: id, req });
}

export async function addFinancialTransaction(
  userId: string,
  input: { kind: "INCOME" | "EXPENSE"; amount: number; currency?: string; description?: string; categoryId?: string; occurredAt?: string },
  req?: Request,
) {
  if (input.categoryId) {
    const category = await prisma.expenseCategory.findFirst({ where: { id: input.categoryId, userId, isActive: true } });
    if (!category) throw new ApiError(404, "Kategori tidak ditemukan");
  }
  if (input.currency && input.currency !== "IDR") {
    throw new ApiError(400, "Transaksi keuangan pribadi menggunakan IDR; konversikan nilai aktual terlebih dahulu");
  }
  const tx = await prisma.financialTransaction.create({
    data: {
      userId,
      kind: input.kind,
      amount: new Decimal(input.amount),
      currency: input.currency ?? "IDR",
      description: input.description ?? null,
      categoryId: input.categoryId ?? null,
      occurredAt: input.occurredAt ? new Date(input.occurredAt) : new Date(),
    },
  });
  await audit({ userId, action: "create", entity: "FinancialTransaction", entityId: tx.id, after: input, req });
  return tx;
}

export async function reverseFinancialTransaction(userId: string, id: string, req?: Request) {
  const t = await prisma.financialTransaction.findFirst({ where: { id, userId } });
  if (!t) throw new ApiError(404, "Transaksi tidak ditemukan");
  if (t.debtId || t.withdrawalId || t.kind === "ALLOCATION") {
    throw new ApiError(400, "Transaksi terhubung memerlukan koreksi pada sumbernya agar ledger tetap konsisten");
  }
  if (t.reversalOfId) throw new ApiError(400, "Baris reversal tidak dapat dibalik lagi");
  const dup = await prisma.financialTransaction.findFirst({ where: { reversalOfId: id } });
  if (dup) throw new ApiError(400, "Transaksi sudah dibatalkan");
  const rev = await prisma.financialTransaction.create({
    data: {
      userId,
      kind: "REVERSAL",
      amount: D(t.amount).neg(),
      currency: t.currency,
      occurredAt: new Date(),
      description: `Pembatalan: ${t.description ?? t.id}`,
      reversalOfId: t.id,
    },
  });
  await audit({ userId, action: "reverse", entity: "FinancialTransaction", entityId: id, req });
  return rev;
}

export async function listFinancialTransactions(userId: string, limit = 100) {
  const rows = await prisma.financialTransaction.findMany({
    where: { userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: { select: { name: true } } },
  });
  const reversals = await prisma.financialTransaction.findMany({
    where: { userId, reversalOfId: { in: rows.map((r) => r.id) } }, select: { reversalOfId: true },
  });
  const reversed = new Set(reversals.map((r) => r.reversalOfId));
  return rows.map((r) => ({ ...r, reversed: reversed.has(r.id) }));
}

/* ───────────────────────── Debts ───────────────────────── */

export async function listDebts(userId: string) {
  return prisma.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { payments: { orderBy: { paidAt: "desc" }, take: 5 } },
  });
}

export function serializeDebt<T extends { dueDate: Date | null }>(debt: T) {
  return { ...debt, dueDate: debtDateKey(debt.dueDate) };
}

function debtTermsData(input: Partial<DebtTermsInput>) {
  return {
    repaymentMode: input.repaymentMode ?? null,
    interestRate: input.interestRate == null ? null : D(input.interestRate),
    installmentAmount: input.installmentAmount == null ? null : D(input.installmentAmount),
    installmentFreq: input.installmentFreq ?? null,
    dueDate: input.dueDate ? new Date(input.dueDate) : null,
  };
}

export async function createDebt(userId: string, input: DebtCreateInput, req?: Request) {
  const d = await prisma.debt.create({
    data: {
      userId,
      name: input.name,
      creditor: input.creditor ?? null,
      principalOriginal: new Decimal(input.principalOriginal),
      principalRemaining: new Decimal(input.principalOriginal),
      ...debtTermsData(input),
      dueDay: input.dueDay ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      notes: input.notes ?? null,
    },
  });
  await audit({ userId, action: "create", entity: "Debt", entityId: d.id, after: input, req });
  return d;
}

export async function updateDebtTerms(userId: string, debtId: string, input: DebtTermsInput, req?: Request) {
  const updated = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const debt = await tx.debt.findUnique({ where: { id: debtId, userId } });
    if (!debt) throw new ApiError(404, "Hutang tidak ditemukan");

    const keepsDueDay = input.repaymentMode === "recurring"
      && (input.installmentFreq === "weekly" || input.installmentFreq === "monthly")
      && input.installmentFreq === debtSchedule(debt);
    return tx.debt.update({
      where: { id: debtId, userId },
      data: { ...debtTermsData(input), dueDay: keepsDueDay ? debt.dueDay : null },
    });
  });

  await audit({ userId, action: "update", entity: "Debt", entityId: debtId, after: input, req });
  return updated;
}

export async function payDebt(
  userId: string,
  debtId: string,
  input: { totalAmount: number; interestPortion: number; feePortion: number; paidAt?: string; note?: string },
  req?: Request,
) {
  const result = await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const debt = await tx.debt.findFirst({ where: { id: debtId, userId } });
    if (!debt) throw new ApiError(404, "Hutang tidak ditemukan");
    if (debt.status === "PAID") throw new ApiError(400, "Hutang sudah lunas");
    if (debt.interestRate !== null && D(debt.interestRate).isZero() && input.interestPortion > 0) {
      throw new ApiError(400, "Hutang ini dicatat tanpa bunga");
    }

    if (D(input.totalAmount).minus(input.interestPortion).minus(input.feePortion).gt(D(debt.principalRemaining))) {
      throw new ApiError(400, "Pembayaran pokok melebihi sisa hutang");
    }
    if (D(input.interestPortion).plus(input.feePortion).gt(input.totalAmount)) {
      throw new ApiError(400, "Porsi bunga dan biaya melebihi pembayaran");
    }
    const split = splitDebtPayment({
      totalAmount: input.totalAmount,
      interestPortion: input.interestPortion,
      feePortion: input.feePortion,
      principalRemaining: debt.principalRemaining,
    });

    const payment = await tx.debtPayment.create({
      data: {
        userId,
        debtId,
        paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
        totalAmount: split.totalAmount,
        interestPortion: split.interestPortion,
        feePortion: split.feePortion,
        principalPortion: split.principalPortion,
        note: input.note ?? null,
      },
    });
    const updated = await tx.debt.update({
      where: { id: debtId },
      data: {
        principalRemaining: split.remainingAfter,
        status: split.paidOff ? "PAID" : "ACTIVE",
        paidOffAt: split.paidOff ? new Date() : null,
      },
    });
    // optional linkage into cashflow (EXPENSE) when paid from tracked funds
    await tx.financialTransaction.create({
      data: {
        userId,
        kind: "EXPENSE",
        amount: split.totalAmount,
        description: `Pembayaran hutang: ${debt.name}`,
        debtId,
        occurredAt: payment.paidAt,
      },
    });
    return { payment, debt: updated };
  });

  await audit({ userId, action: "create", entity: "DebtPayment", entityId: result.payment.id, after: input, req });
  return result;
}

export function debtProjection(debt: {
  principalRemaining: Decimal;
  installmentAmount: Decimal | null;
  installmentFreq: string | null;
  interestRate: Decimal | null;
  repaymentMode: string | null;
}) {
  const schedule = debtSchedule(debt);
  if (!isRecurringDebt(schedule)) return null;

  const projection = projectRepayment({
    principalRemaining: debt.principalRemaining,
    installmentAmount: debt.installmentAmount,
    periodsPerYear: DEBT_PERIODS_PER_YEAR[schedule],
    annualInterestRatePct: debt.interestRate,
  });
  if (!projection.complete || !projection.periods) return projection;

  const unit = { weekly: "minggu", monthly: "bulan", yearly: "tahun" }[schedule];
  return { ...projection, note: `Lunas dalam ${projection.periods} ${unit} (estimasi)` };
}

/* ───────────────────────── Buckets & allocation ───────────────────────── */

export async function listBucketsWithAllocated(userId: string) {
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  const buckets = await prisma.financialBucket.findMany({
    where: { userId, isActive: true, projectId: project.id },
    orderBy: { priority: "asc" },
    include: { allocations: { select: { amount: true } } },
  });
  return buckets.map((b) => ({
    id: b.id,
    kind: b.kind,
    name: b.name,
    priority: b.priority,
    targetPercent: b.targetPercent?.toString() ?? null,
    allocated: b.allocations.reduce((s, a) => s.add(D(a.amount)), new Decimal(0)).toString(),
  }));
}

/**
 * Allocate received withdrawal cash, expressed in USD at receipt FX, into buckets.
 * Financial transactions retain the IDR value and historical FX for coverage.
 */
export async function allocateProfit(
  userId: string,
  input: { periodStart: string; periodEnd: string; amount: number; note?: string },
  req?: Request,
) {
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  const amount = D(input.amount);
  if (amount.lte(0)) throw new ApiError(400, "Jumlah alokasi harus positif");

  const buckets = await prisma.financialBucket.findMany({
    where: { userId, projectId: project.id, isActive: true },
    orderBy: { priority: "asc" },
  });
  const withPercent = buckets.filter((b) => b.targetPercent && D(b.targetPercent).gt(0));
  const pctSum = withPercent.reduce((s, b) => s.add(D(b.targetPercent)), new Decimal(0));
  if (!pctSum.eq(100)) {
    throw new ApiError(400, `Total targetPercent bucket harus 100% (sekarang ${pctSum.toFixed(2)}%)`);
  }

  const results = await prisma.$transaction(async (tx) => {
    // Serialize competing allocations for this user, including overlapping periods.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    const completed = await tx.withdrawal.findMany({ where: { userId, projectId: project.id, status: "COMPLETED" }, select: { id: true } });
    const income = await tx.financialTransaction.findMany({
      where: { userId, kind: "INCOME", withdrawalId: { in: completed.map((w) => w.id) }, currency: "IDR" },
    });
    let receivedUsd = D(0);
    let receivedIdr = D(0);
    for (const receipt of income) {
      if (!receipt.fxRate || D(receipt.fxRate).lte(0)) continue;
      receivedUsd = receivedUsd.plus(D(receipt.amount).div(D(receipt.fxRate)));
      receivedIdr = receivedIdr.plus(D(receipt.amount));
    }
    const priorRows = await tx.financialAllocation.findMany({
      where: { userId, bucket: { projectId: project.id }, reversedById: null },
      select: { financialTxId: true, amount: true },
    });
    if (priorRows.some((r) => !r.financialTxId)) {
      throw new ApiError(400, "Alokasi lama belum memiliki rekonsiliasi penerimaan IDR — koreksi data lama terlebih dahulu");
    }
    const allocatedIdr = await tx.financialTransaction.aggregate({
      where: { userId, id: { in: priorRows.flatMap((r) => r.financialTxId ? [r.financialTxId] : []) } }, _sum: { amount: true },
    });
    const available = priorRows.reduce((balance, row) => balance.minus(row.amount), receivedUsd);
    if (amount.gt(available) || receivedUsd.lte(0)) {
      throw new ApiError(400, `Alokasi melebihi dana withdrawal yang sudah diterima dan belum dialokasikan (${Decimal.max(available, 0).toFixed(2)} USD)`);
    }
    const remainingIdr = Decimal.max(receivedIdr.minus(D(allocatedIdr._sum.amount)), 0);
    const rate = remainingIdr.div(available);
    const allocationIdr = amount.times(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN);
    let remainingAllocationIdr = allocationIdr;
    let remaining = amount;
    const occurredAt = new Date();
    const sourcePeriodStart = new Date(input.periodStart);
    const sourcePeriodEnd = new Date(input.periodEnd);
    const shares = withPercent.map((bucket, index) => {
      const last = index === withPercent.length - 1;
      const share = last ? remaining : amount.times(D(bucket.targetPercent)).div(100).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      remaining = remaining.minus(share);
      const shareIdr = last ? remainingAllocationIdr : share.times(rate).toDecimalPlaces(2, Decimal.ROUND_DOWN);
      remainingAllocationIdr = remainingAllocationIdr.minus(shareIdr);
      return { bucketId: bucket.id, amount: share, shareIdr, financialTxId: randomUUID() };
    });
    await tx.financialTransaction.createMany({
      data: shares.map(({ bucketId, shareIdr, financialTxId }) => ({
        id: financialTxId, userId, kind: "ALLOCATION", bucketId, amount: shareIdr,
        currency: "IDR", fxRate: rate, occurredAt, description: input.note ?? "Alokasi dana withdrawal diterima",
      })),
    });
    await tx.financialAllocation.createMany({
      data: shares.map(({ bucketId, amount, financialTxId }) => ({
        userId, bucketId, amount, financialTxId, sourcePeriodStart, sourcePeriodEnd,
      })),
    });
    return shares.map(({ bucketId, amount }) => ({ bucketId, amount }));
  });

  await audit({ userId, action: "create", entity: "FinancialAllocation", after: { ...input, shares: results.map((r) => ({ ...r, amount: r.amount.toString() })) }, req });
  return results;
}

export async function listAllocations(userId: string) {
  return prisma.financialAllocation.findMany({
    where: { userId },
    orderBy: { createdAt: "desc" },
    take: 100,
    include: { bucket: { select: { name: true, kind: true } } },
  });
}

export async function updateBucketPercentages(userId: string, entries: { id: string; targetPercent: number }[]) {
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  const buckets = await prisma.financialBucket.findMany({ where: { userId, projectId: project.id, isActive: true } });
  if (new Set(entries.map((e) => e.id)).size !== entries.length || entries.length !== buckets.length ||
      entries.some((e) => !buckets.some((b) => b.id === e.id))) throw new ApiError(400, "Daftar bucket tidak valid");
  if (!entries.reduce((sum, e) => sum.plus(e.targetPercent), D(0)).eq(100)) {
    throw new ApiError(400, "Total target bucket harus 100%");
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${userId}))`;
    await Promise.all(entries.map(({ id, targetPercent }) => tx.financialBucket.update({
      where: { id },
      data: { targetPercent: D(targetPercent) },
    })));
  });
  await audit({ userId, action: "update", entity: "FinancialBucket", after: entries });
}
