import { PrismaClient, type Prisma } from "@prisma/client";
import { APP_NAME } from "@/lib/brand";
import { zonedPeriod } from "@/lib/dates";
import { actualR, closePnl, deriveStatus, initialRiskUsd, plannedRR } from "@/lib/finance/trades";
import { D, fmtUSD0 } from "@/lib/money";
import { DEFAULT_BUCKETS, ROADMAP_AMOUNTS } from "@/server/services/users";
import { seedInstruments } from "./seed-instruments";

const EMAIL = "demo@horizon-journal.test";
const GOOGLE_SUBJECT = "horizon-journal-demo";
const TIMEZONE = "Asia/Jakarta";
const INITIAL_CAPITAL = 2_500;
const TARGET = 1_000_000;
const FX_RATE = 16_000;
const DAY_MS = 86_400_000;
const MOVES = [7, -3, 5, 6, -3, 0.2, 9, -3, 5, -3, 10, 3, 7, -3, 9, 6, -3, 5, 8, -3, 4, 6, -3, 5];

function daysAgo(now: Date, days: number) {
  return new Date(now.getTime() - days * DAY_MS);
}

async function seedTrades(tx: Prisma.TransactionClient, userId: string, accountIds: string[], now: Date) {
  const instrument = await tx.instrument.findUniqueOrThrow({ where: { symbol: "XAUUSD" } });
  const strategies = await Promise.all([
    tx.strategy.create({ data: { userId, name: "Pullback Demo", timeframe: "M15", description: "Strategi fiktif untuk uji filter jurnal." } }),
    tx.strategy.create({ data: { userId, name: "Breakout Demo", timeframe: "H1", description: "Strategi fiktif untuk uji perbandingan performa." } }),
  ]);
  const lot = D(0.08);
  const commission = D(1.60);

  for (const [index, move] of [...MOVES, null, 4].entries()) {
    const direction = index % 2 === 0 ? "LONG" : "SHORT";
    const sign = direction === "LONG" ? 1 : -1;
    const accountId = accountIds[index % accountIds.length]!;
    const strategy = strategies[Math.floor(index / accountIds.length) % strategies.length]!;
    const entryAt = daysAgo(now, 1 + Math.floor((MOVES.length + 1 - index) * 1.4));
    const entryPrice = D(2_680 + index * 3);
    const sl = entryPrice.minus(sign * 3);
    const tp = entryPrice.plus(sign * 7);
    const initialRisk = initialRiskUsd(direction, entryPrice, sl, instrument, lot);
    const isPartial = index === MOVES.length + 1;
    const closeQuantity = move === null ? D(0) : isPartial ? lot.div(2) : lot;
    const close = move === null ? null : {
      userId,
      kind: isPartial ? "PARTIAL_CLOSE" as const : "CLOSE" as const,
      quantity: closeQuantity,
      price: entryPrice.plus(D(move).times(sign)),
      commission: isPartial ? commission.div(2) : commission,
      executedAt: new Date(entryAt.getTime() + 3_600_000),
    };
    const pnl = close ? closePnl(direction, entryPrice, close, instrument) : null;
    const trade = await tx.trade.create({ data: {
      userId, accountId, instrumentId: instrument.id, strategyId: strategy.id,
      ticket: `DEMO-${String(index + 1).padStart(3, "0")}`, direction, lot, entryPrice, entryAt,
      status: deriveStatus(false, lot, closeQuantity),
      initialStopLoss: sl, initialTakeProfit: tp, initialRisk,
      plannedRR: plannedRR(direction, entryPrice, sl, tp, instrument, lot),
      actualR: pnl === null ? null : actualR(pnl, initialRisk),
      realizedPnl: pnl, exitPrice: close?.price, exitAt: close?.executedAt,
      commission: close?.commission,
      session: index % 2 === 0 ? "london" : "newyork", timeframe: strategy.timeframe,
      executions: { create: [
        { userId, kind: "ENTRY", quantity: lot, price: entryPrice, executedAt: entryAt },
        ...(close ? [{ ...close, realizedPnl: pnl }] : []),
      ] },
      journal: { create: {
        marketContext: "Harga dan kondisi pasar fiktif untuk pengujian.",
        entryReason: `Sampel ${strategy.name}`,
        exitReason: close ? (isPartial ? "Tutup setengah posisi" : "Eksekusi penutupan demo") : null,
        emotionBefore: "calm", confidence: 4, stressLevel: 2, compliant: true,
        lessons: "Periksa ulang catatan dan kesesuaian ukuran posisi.",
        tags: ["demo", "review"],
      } },
    } });
    if (close && pnl !== null) {
      await tx.accountTransaction.create({ data: {
        userId, accountId, type: "REALIZED_PNL", sourceTradeId: trade.id, amount: pnl,
        occurredAt: close.executedAt, note: `Realisasi ${trade.ticket}`,
      } });
    }
  }
}

async function seedDemo(tx: Prisma.TransactionClient) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('horizon-journal-demo-seed'))`;
  const existing = await tx.user.findMany({ select: { googleSubject: true }, take: 2 });
  if (existing.length > 0) {
    if (existing.length === 1 && existing[0]?.googleSubject === GOOGLE_SUBJECT) {
      return "Demo data already exists. No rows changed.";
    }
    throw new Error("Demo database already contains an account. Seed stopped to preserve existing data.");
  }

  const now = new Date();
  const start = daysAgo(now, 45);
  const instruments = await seedInstruments(tx);
  const { id: userId } = await tx.user.create({ data: {
    name: "Pengguna Demo", email: EMAIL, timezone: TIMEZONE,
    googleSubject: GOOGLE_SUBJECT, riskSettings: { create: {} },
  } });
  const percentages = [35, 20, 15, 15, 15, 0];
  const project = await tx.project.create({ data: {
    userId, name: APP_NAME, initialCapital: INITIAL_CAPITAL, targetAmount: TARGET, startDate: start,
    milestones: { create: ROADMAP_AMOUNTS.map((amount, order) => ({ amount, order: order + 1, label: fmtUSD0(amount) })) },
    buckets: { create: DEFAULT_BUCKETS.map((bucket, index) => ({ ...bucket, userId, targetPercent: percentages[index] })) },
  }, include: { buckets: true } });
  const projectId = project.id;
  const [primary, secondary] = await Promise.all([
    tx.tradingAccount.create({ data: { userId, projectId, name: "Akun Demo Utama", broker: "Broker Demo" } }),
    tx.tradingAccount.create({ data: { userId, projectId, name: "Akun Demo Prop", broker: "Simulasi Prop", isProp: true,
      propMaxDailyLossPct: 5, propMaxTotalDdPct: 10, propTargetPct: 8 } }),
  ]);
  await tx.accountTransaction.createMany({ data: [
    { userId, accountId: primary.id, type: "DEPOSIT", amount: INITIAL_CAPITAL, occurredAt: start, note: "Modal awal fiktif" },
    { userId, accountId: secondary.id, type: "DEPOSIT", amount: 1_000, occurredAt: start, note: "Modal prop fiktif" },
  ] });
  await seedTrades(tx, userId, [primary.id, secondary.id], now);

  await tx.compoundingScenario.createMany({ data: [
    { userId, projectId, name: "Demo · Compounding", initialCapital: INITIAL_CAPITAL, targetAmount: TARGET,
      returnPerCycle: 3, frequency: "WEEKLY", wdMode: "NONE" },
    { userId, projectId, name: "Demo · Withdrawal Dinamis", initialCapital: INITIAL_CAPITAL, targetAmount: TARGET,
      returnPerCycle: 5, frequency: "WEEKLY", wdMode: "DYNAMIC", wdRatio: 40, costPerCycle: 2 },
  ] });
  await tx.withdrawalRule.create({ data: { userId, projectId, maxWdRatio: 40, needsTargetIdr: 2_100_000, reserveUsd: 250 } });
  const completedAt = daysAgo(now, 2);
  const withdrawal = await tx.withdrawal.create({ data: {
    userId, projectId, accountId: primary.id, status: "COMPLETED", amountUSD: 75, fxRate: FX_RATE,
    receivedAmount: 75 * FX_RATE, requestedAt: daysAgo(now, 3), completedAt, rateAt: completedAt, note: "Withdrawal fiktif",
    transactions: { create: { userId, accountId: primary.id, type: "WITHDRAWAL", amount: -75, occurredAt: completedAt } },
  } });
  await tx.withdrawal.create({ data: { userId, projectId, accountId: primary.id, status: "REQUESTED", amountUSD: 25, requestedAt: now } });
  await tx.exchangeRate.create({ data: { userId, pair: "USDIDR", rate: FX_RATE, at: completedAt, source: "manual-wd" } });
  await tx.financialTransaction.create({ data: {
    userId, kind: "INCOME", amount: 75 * FX_RATE, fxRate: FX_RATE, occurredAt: completedAt,
    description: "Penerimaan withdrawal demo", withdrawalId: withdrawal.id,
  } });
  const week = zonedPeriod("WEEKLY", completedAt, TIMEZONE);
  for (const bucket of project.buckets.filter((row) => row.targetPercent?.gt(0))) {
    const amount = D(bucket.targetPercent).times(50).div(100);
    const cashEntry = await tx.financialTransaction.create({ data: {
      userId, kind: "ALLOCATION", amount: amount.times(FX_RATE), fxRate: FX_RATE, bucketId: bucket.id,
      occurredAt: completedAt, description: "Alokasi withdrawal demo",
    } });
    await tx.financialAllocation.create({ data: {
      userId, bucketId: bucket.id, amount, financialTxId: cashEntry.id,
      sourcePeriodStart: week.start, sourcePeriodEnd: week.end,
    } });
  }

  const month = zonedPeriod("MONTHLY", now, TIMEZONE);
  const budget = await tx.budget.create({ data: { userId, periodStart: month.start, periodEnd: month.end } });
  for (const [order, category] of [
    { name: "Makan", plannedAmount: 1_200_000, expense: 350_000 },
    { name: "Transportasi", plannedAmount: 450_000, expense: 125_000 },
    { name: "Tagihan", plannedAmount: 450_000, expense: 210_000 },
  ].entries()) {
    const { id: categoryId } = await tx.expenseCategory.create({ data: {
      userId, budgetId: budget.id, name: category.name, plannedAmount: category.plannedAmount, order,
    } });
    await tx.financialTransaction.create({ data: {
      userId, categoryId, kind: "EXPENSE", amount: category.expense, occurredAt: now, description: `Pengeluaran demo · ${category.name}`,
    } });
  }
  const { id: debtId } = await tx.debt.create({ data: {
    userId, name: "Cicilan Demo", creditor: "Kreditur Fiktif", principalOriginal: 2_000_000,
    principalRemaining: 1_700_000, installmentAmount: 300_000, installmentFreq: "monthly", dueDay: 25, startDate: start,
    payments: { create: { userId, paidAt: now, totalAmount: 300_000, principalPortion: 300_000 } },
  } });
  await tx.financialTransaction.create({ data: {
    userId, debtId, amount: 300_000, kind: "EXPENSE", occurredAt: now, description: "Pembayaran cicilan demo",
  } });

  await tx.periodReview.createMany({ data: (["DAILY", "WEEKLY", "MONTHLY"] as const).map((kind) => {
    const period = zonedPeriod(kind, now, TIMEZONE);
    return { userId, projectId, kind, periodStart: period.start, periodEnd: period.end,
      performance: "Catatan performa demo", riskNotes: "Periksa batas risiko di akun simulasi.",
      nextPlan: "Bandingkan hasil kedua strategi pada halaman Analitik." };
  }) });
  await tx.economicEvent.createMany({ data: [
    { userId, at: now, currency: "USD", impact: "high", title: "Demo · Rilis inflasi AS (fiktif)", source: "manual" },
    { userId, at: daysAgo(now, 6), currency: "USD", impact: "medium", title: "Demo · Data tenaga kerja (fiktif)", source: "manual" },
  ] });
  await tx.notification.createMany({ data: [
    { userId, kind: "journal", title: `Selamat datang di ${APP_NAME}`, body: "Data ini khusus untuk testing.", link: "/journal" },
    { userId, kind: "risk", title: "Demo · Tinjau posisi terbuka", severity: "WARNING", link: "/risk" },
  ] });

  return `Seeded ${instruments} instruments and ${MOVES.length + 2} demo trades across two accounts.`;
}

async function main() {
  const database = new URL(process.env.DATABASE_URL ?? "postgresql://unset");
  if (!["postgresql:", "postgres:"].includes(database.protocol) ||
      !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
      database.pathname !== "/horizon_journal_google_test") {
    throw new Error("Set DATABASE_URL to the local horizon_journal_google_test PostgreSQL database.");
  }

  const prisma = new PrismaClient();
  try {
    const result = await prisma.$transaction(seedDemo, { timeout: 30_000 });
    console.log(result);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
