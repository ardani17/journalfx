import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { splitDebtPayment, projectRepayment } from "@/lib/finance/debt";
import { utcMonth } from "@/lib/dates";

/* ───────────────────────── Budget & expenses ───────────────────────── */

export async function ensureCurrentBudget(userId: string) {
  const { start, end } = utcMonth(new Date());
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
  const spentAgg = await prisma.financialTransaction.groupBy({
    by: ["categoryId"],
    where: {
      userId,
      kind: "EXPENSE",
      occurredAt: { gte: budget.periodStart, lt: budget.periodEnd },
      reversalOfId: null,
    },
    _sum: { amount: true },
  });
  const spentByCat = new Map(spentAgg.map((r) => [r.categoryId, D(r._sum.amount ?? 0)]));
  const totalSpent = [...spentByCat.values()].reduce((s, v) => s.add(v), new Decimal(0));
  const incomeAgg = await prisma.financialTransaction.aggregate({
    where: { userId, kind: "INCOME", occurredAt: { gte: budget.periodStart, lt: budget.periodEnd } },
    _sum: { amount: true },
  });
  const funded = D(incomeAgg._sum.amount);
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
  return prisma.financialTransaction.findMany({
    where: { userId },
    orderBy: [{ occurredAt: "desc" }, { createdAt: "desc" }],
    take: limit,
    include: { category: { select: { name: true } } },
  });
}

/* ───────────────────────── Debts ───────────────────────── */

export async function listDebts(userId: string) {
  return prisma.debt.findMany({
    where: { userId },
    orderBy: { createdAt: "asc" },
    include: { payments: { orderBy: { paidAt: "desc" }, take: 5 } },
  });
}

export async function createDebt(
  userId: string,
  input: {
    name: string; creditor?: string; principalOriginal: number;
    interestRate?: number; installmentAmount?: number; installmentFreq?: string;
    dueDay?: number; startDate?: string; notes?: string;
  },
  req?: Request,
) {
  const d = await prisma.debt.create({
    data: {
      userId,
      name: input.name,
      creditor: input.creditor ?? null,
      principalOriginal: new Decimal(input.principalOriginal),
      principalRemaining: new Decimal(input.principalOriginal),
      interestRate: input.interestRate !== undefined ? new Decimal(input.interestRate) : null,
      installmentAmount: input.installmentAmount !== undefined ? new Decimal(input.installmentAmount) : null,
      installmentFreq: input.installmentFreq ?? null,
      dueDay: input.dueDay ?? null,
      startDate: input.startDate ? new Date(input.startDate) : null,
      notes: input.notes ?? null,
    },
  });
  await audit({ userId, action: "create", entity: "Debt", entityId: d.id, after: input, req });
  return d;
}

export async function payDebt(
  userId: string,
  debtId: string,
  input: { totalAmount: number; interestPortion: number; feePortion: number; paidAt?: string; note?: string },
  req?: Request,
) {
  const debt = await prisma.debt.findFirst({ where: { id: debtId, userId } });
  if (!debt) throw new ApiError(404, "Hutang tidak ditemukan");
  if (debt.status === "PAID") throw new ApiError(400, "Hutang sudah lunas");

  const split = splitDebtPayment({
    totalAmount: input.totalAmount,
    interestPortion: input.interestPortion,
    feePortion: input.feePortion,
    principalRemaining: debt.principalRemaining,
  });

  const result = await prisma.$transaction(async (tx) => {
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
}) {
  const periodsPerYear = debt.installmentFreq === "weekly" ? 52 : 12;
  return projectRepayment({
    principalRemaining: debt.principalRemaining,
    installmentAmount: debt.installmentAmount,
    periodsPerYear,
    annualInterestRatePct: debt.interestRate,
  });
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
 * Allocate realized profit of a period into buckets by priority & target %.
 * Idempotent per (bucket, period) via unique constraint — no double allocation.
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

  // verify the period has unallocated realized profit of at least `amount`
  const realized = await prisma.accountTransaction.aggregate({
    where: {
      userId,
      type: "REALIZED_PNL",
      occurredAt: { gte: new Date(input.periodStart), lt: new Date(input.periodEnd) },
    },
    _sum: { amount: true },
  });
  const periodPnl = D(realized._sum.amount);
  const priorAllocations = await prisma.financialAllocation.aggregate({
    where: { userId, bucket: { projectId: project.id }, sourcePeriodStart: new Date(input.periodStart), sourcePeriodEnd: new Date(input.periodEnd) },
    _sum: { amount: true },
  });
  const allocatedSoFar = D(priorAllocations._sum.amount);
  const available = periodPnl.minus(allocatedSoFar);
  if (amount.gt(available)) {
    throw new ApiError(
      400,
      `Alokasi ${amount.toFixed(2)} melebihi profit periode yang belum dialokasikan (${available.toFixed(2)})`,
    );
  }

  const results = await prisma.$transaction(async (tx) => {
    const rows: { bucketId: string; amount: Decimal }[] = [];
    for (const b of withPercent) {
      const share = amount.times(D(b.targetPercent)).div(100);
      const alloc = await tx.financialAllocation.create({
        data: {
          userId,
          bucketId: b.id,
          amount: share,
          sourcePeriodStart: new Date(input.periodStart),
          sourcePeriodEnd: new Date(input.periodEnd),
        },
      });
      rows.push({ bucketId: b.id, amount: share });
      void alloc;
    }
    return rows;
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
