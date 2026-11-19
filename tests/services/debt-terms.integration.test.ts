import { randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { prisma } from "@/server/db";
import { createDebt, listDebts, payDebt, serializeDebt, updateDebtTerms } from "@/server/services/finance";
import { markAllRead, refreshNotifications } from "@/server/services/reviews";

vi.mock("@/server/services/risk", () => ({ riskStatus: async () => ({ breaches: [] }) }));
vi.mock("@/server/services/notify-channels", () => ({ dispatchNotification: async () => undefined }));

describe.skipIf(process.env.RUN_DB_TESTS !== "1")("PostgreSQL debt terms", () => {
  const fixtureIds: string[] = [];

  beforeAll(() => {
    if (existsSync(".env")) process.loadEnvFile(".env");
  });
  afterEach(() => vi.useRealTimers());
  afterAll(async () => {
    if (fixtureIds.length) {
      await prisma.$transaction([
        prisma.auditLog.deleteMany({ where: { userId: { in: fixtureIds } } }),
        prisma.user.deleteMany({ where: { id: { in: fixtureIds } } }),
      ]);
    }
    await prisma.$disconnect();
  });

  async function newOwner() {
    const key = randomUUID();
    const user = await prisma.user.create({
      data: { email: `qa-debt-${key}@example.invalid`, name: "Temporary debt QA", googleSubject: `qa-debt-${key}`, timezone: "Asia/Jakarta" },
    });
    fixtureIds.push(user.id);
    return user.id;
  }

  it("records a flexible interest-free debt from partial payment through payoff", async () => {
    const userId = await newOwner();
    const debt = await createDebt(userId, { name: "Hutang pribadi", principalOriginal: 1250, repaymentMode: "flexible", interestRate: 0 });
    expect(serializeDebt(debt)).toMatchObject({ repaymentMode: "flexible", dueDate: null, installmentFreq: null });
    await expect(payDebt(userId, debt.id, { totalAmount: 410, interestPortion: 1, feePortion: 0 })).rejects.toMatchObject({ status: 400 });

    const partial = await payDebt(userId, debt.id, { totalAmount: 510, interestPortion: 0, feePortion: 10 });
    expect(partial.payment.principalPortion.toString()).toBe("500");
    expect(partial.debt.principalRemaining.toString()).toBe("750");
    expect(partial.debt.status).toBe("ACTIVE");

    const payoff = await payDebt(userId, debt.id, { totalAmount: 750, interestPortion: 0, feePortion: 0 });
    expect(payoff.debt.status).toBe("PAID");
    expect(payoff.debt.principalRemaining.toString()).toBe("0");
    expect(await prisma.financialTransaction.count({ where: { userId, debtId: debt.id } })).toBe(2);
  });

  it("edits legacy terms only for the owner and keeps the existing balance and ledger", async () => {
    const [userId, otherId] = await Promise.all([newOwner(), newOwner()]);
    const debt = await createDebt(userId, { name: "Hutang lama", principalOriginal: 3000, installmentFreq: "monthly", installmentAmount: 1200, dueDay: 25 });
    const { payment } = await payDebt(userId, debt.id, { totalAmount: 1200, interestPortion: 200, feePortion: 0 });
    const monthly = await updateDebtTerms(userId, debt.id, { repaymentMode: "recurring", installmentFreq: "monthly", interestRate: 10 });
    expect(monthly.dueDay).toBe(25);

    const terms = { repaymentMode: "one_time", dueDate: "2028-02-29", interestRate: 0 } as const;
    await expect(updateDebtTerms(otherId, debt.id, terms)).rejects.toMatchObject({ status: 404 });
    expect(serializeDebt(await updateDebtTerms(userId, debt.id, terms))).toMatchObject({
      repaymentMode: "one_time", dueDate: "2028-02-29", dueDay: null, installmentFreq: null, installmentAmount: null,
    });
    const [stored] = await listDebts(userId);
    expect(stored?.principalOriginal.toString()).toBe("3000");
    expect(stored?.principalRemaining.toString()).toBe("2000");
    expect(stored?.payments.map((entry) => entry.id)).toEqual([payment.id]);
  });

  it("reminds only for active dated obligations in the local window, once per occurrence", async () => {
    const userId = await newOwner();
    const payoff = { name: "Pelunasan", principalOriginal: 2000, repaymentMode: "one_time", interestRate: 0 } as const;
    const annual = { name: "Tahunan", principalOriginal: 2000, repaymentMode: "recurring", installmentFreq: "yearly", installmentAmount: 1000 } as const;
    const once = await createDebt(userId, { ...payoff, dueDate: "2027-01-02" });
    const yearly = await createDebt(userId, { ...annual, dueDate: "2026-01-02" });
    await createDebt(userId, { ...payoff, dueDate: "2027-01-03" });
    await createDebt(userId, { ...payoff, dueDate: "2026-12-29" });
    await createDebt(userId, annual);
    await createDebt(userId, { ...payoff, repaymentMode: "flexible" });
    const paid = await createDebt(userId, { ...payoff, dueDate: "2027-01-02" });
    await payDebt(userId, paid.id, { totalAmount: 2000, interestPortion: 0, feePortion: 0 });

    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-12-29T17:05:00Z"));
    await Promise.all([refreshNotifications(userId), refreshNotifications(userId)]);
    await markAllRead(userId);
    await refreshNotifications(userId);

    const reminders = await prisma.notification.findMany({ where: { userId, kind: "debt" } });
    expect(reminders.map(({ link }) => link).sort()).toEqual([`/debts#debt-${once.id}`, `/debts#debt-${yearly.id}`].sort());
    expect(reminders.every(({ readAt }) => readAt !== null)).toBe(true);
  });
});
