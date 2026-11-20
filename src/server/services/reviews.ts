import { userTimezone } from "./time";
import { Prisma, type PeriodReview } from "@prisma/client";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal, tradingAmountToUsd } from "@/lib/money";
import { disciplineScore, type DisciplineResult } from "@/lib/finance/discipline";
import { debtDateKey, debtSchedule, scheduledDebtDate } from "@/lib/finance/debt";
import { coreMetrics, realizedTradingRows } from "./analytics";
import { computeBalance } from "./ledger";
import { getRecommendation } from "./withdrawals";
import { budgetOverview } from "./finance";
import { addUTCDays, calendarDate, fmtCalendarDateID, zonedPeriod, DEFAULT_TZ } from "@/lib/dates";
import { localDateKey, reviewPeriodForDate, type ReviewKind, type ReviewWindow } from "@/lib/review-period";
import { reviewSelectorSchema } from "@/lib/validation/reviews";

type ReviewSelection = { date?: string; reviewId?: string };

export function periodFor(kind: ReviewKind, at = new Date(), timezone = DEFAULT_TZ): { start: Date; end: Date } {
  return zonedPeriod(kind, at, timezone);
}

export interface PeriodFacts {
  tradesCount: number;
  netPnl: Decimal;
  winRate: number | null;
  discipline: DisciplineResult;
  wdRecommended: Decimal | null;
  wdActual: Decimal;
  compoundedAmount: Decimal; // profit retained (not withdrawn) in period
  budgetCoveragePct: number | null;
  balance: Decimal;
}

/** Facts assembled from the ledger/analytics — captured immutably at close. */
export async function collectFacts(userId: string, window: ReviewWindow): Promise<PeriodFacts> {
  const { start, end } = window;
  const historical = end <= new Date();
  const [metrics, balances, wdRec, budget, trades, riskSettings, wdActualAgg] = await Promise.all([
    coreMetrics(userId, { from: start, to: end }),
    computeBalance(userId, undefined, historical ? end : undefined),
    historical ? null : getRecommendation(userId),
    historical ? null : budgetOverview(userId).catch(() => null),
    prisma.trade.findMany({
      where: { userId, entryAt: { gte: start, lt: end } },
      include: { journal: true },
    }),
    prisma.riskSettings.findUnique({ where: { userId } }),
    prisma.withdrawal.aggregate({
      where: { userId, status: "COMPLETED", completedAt: { gte: start, lt: end } },
      _sum: { amountUSD: true },
    }),
  ]);
  const riskPct = riskSettings ? Number(riskSettings.riskPerTrade) : 1;
  let riskOk = 0;
  let setupOk = 0;
  let slOk = 0;
  let emoOk = 0;
  let completeOk = 0;
  let freqOk = 0;
  for (const t of trades) {
    const balanceBase = balances.balance.gt(0) ? balances.balance : D(1);
    if (!t.initialRisk || D(t.initialRisk).lte(balanceBase.times(riskPct / 100).times(1.05))) riskOk++;
    if (t.strategyId) setupOk++;
    if (t.initialStopLoss) slOk++;
    const j = t.journal;
    if (!j || (!j.fomo && !j.revenge && !j.overtrading)) emoOk++;
    if (j && j.marketContext && j.entryReason && (j.lessons || j.postChecklist)) completeOk++;
    freqOk++; // overtrading flagged in journal reduces this below
    if (j?.overtrading) freqOk--;
  }
  const n = trades.length;
  const discipline = disciplineScore({
    riskRespected: n > 0 ? { ok: riskOk, total: n } : undefined,
    setupFollowed: n > 0 ? { ok: setupOk, total: n } : undefined,
    slPresent: n > 0 ? { ok: slOk, total: n } : undefined,
    emotionsClean: n > 0 ? { ok: emoOk, total: n } : undefined,
    completeness: n > 0 ? { ok: completeOk, total: n } : undefined,
    frequencyOk: n > 0 ? { ok: freqOk, total: n } : undefined,
  });

  const wdActual = D(wdActualAgg._sum.amountUSD ?? 0);
  const periodProfit = metrics.netPnl;
  const compoundedAmount = Decimal.max(periodProfit.minus(wdActual), new Decimal(0));

  return {
    tradesCount: metrics.totalTrades,
    netPnl: periodProfit,
    winRate: metrics.winRate,
    discipline,
    wdRecommended: wdRec?.recommendation.recommended ?? null,
    wdActual,
    compoundedAmount,
    budgetCoveragePct: budget ? budget.coveragePct : null,
    balance: balances.balance,
  };
}

const reviewProject = { project: { select: { name: true } } } satisfies Prisma.PeriodReviewInclude;

async function reviewWindowForRevision(review: PeriodReview): Promise<ReviewWindow> {
  let original = review;
  while (original.correctionOfId) {
    original = await prisma.periodReview.findUniqueOrThrow({
      where: { id: original.correctionOfId, userId: review.userId, kind: review.kind },
    });
  }
  return { start: original.periodStart, end: original.periodEnd };
}

export async function resolveReview(userId: string, kind: ReviewKind, selection: ReviewSelection = {}) {
  const validated = reviewSelectorSchema.parse({ kind, ...selection });
  const timezone = await userTimezone(userId);
  if (validated.reviewId) {
    const review = await prisma.periodReview.findUnique({
      where: { id: validated.reviewId, userId, kind }, include: reviewProject,
    });
    if (!review) throw new ApiError(404, "Review tidak ditemukan.");
    return { review, timezone, window: await reviewWindowForRevision(review) };
  }

  const today = localDateKey(new Date(), timezone);
  const date = validated.date ?? today;
  if (date > today) throw new ApiError(400, "Pilih tanggal hari ini atau tanggal lampau.");
  const window = reviewPeriodForDate(kind, date, timezone);
  const { start, end } = window;
  const latest = await prisma.periodReview.findFirst({
    where: { userId, kind, periodStart: { gte: start, lt: end }, periodEnd: end },
    orderBy: { periodStart: "desc" }, include: reviewProject,
  });
  if (latest) return { review: latest, timezone, window };
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Proyek belum tersedia.");
  const projectId = project.id;
  const review = await prisma.periodReview.upsert({
    where: { userId_kind_periodStart: { userId, kind, periodStart: start } },
    create: { userId, projectId, kind, periodStart: start, periodEnd: end },
    update: {},
    include: reviewProject,
  });
  return { review, timezone, window };
}

export async function getOrCreateReview(userId: string, kind: ReviewKind, selection?: ReviewSelection) {
  return (await resolveReview(userId, kind, selection)).review;
}

export async function saveReviewFields(
  userId: string,
  kind: ReviewKind,
  fields: { performance?: string; riskNotes?: string; reflections?: string; nextPlan?: string },
  req?: Request,
  selection?: ReviewSelection,
) {
  const review = await getOrCreateReview(userId, kind, selection);
  if (review.status === "CLOSED") {
    throw new ApiError(400, "Review sudah ditutup. Pilih Buat Koreksi untuk membuat revisi.");
  }
  const [updated] = await prisma.periodReview.updateManyAndReturn({
    where: { id: review.id, status: "OPEN" },
    data: fields,
  });
  if (!updated) throw new ApiError(400, "Review sudah ditutup.");
  await audit({ userId, action: "update", entity: "PeriodReview", entityId: review.id, after: fields, req });
  return updated;
}

export async function closeReview(userId: string, kind: ReviewKind, req?: Request, selection?: ReviewSelection) {
  const { review, window } = await resolveReview(userId, kind, selection);
  if (review.status === "CLOSED") throw new ApiError(400, "Review sudah ditutup");
  const facts = await collectFacts(userId, window);
  const closedAt = new Date();
  const snapshot = {
    closedAt: closedAt.toISOString(),
    tradesCount: facts.tradesCount,
    netPnl: facts.netPnl.toString(),
    winRate: facts.winRate,
    balance: facts.balance.toString(),
    wdRecommended: facts.wdRecommended?.toString() ?? null,
    wdActual: facts.wdActual.toString(),
    compoundedAmount: facts.compoundedAmount.toString(),
    budgetCoveragePct: facts.budgetCoveragePct,
    discipline: facts.discipline,
  };
  const [updated] = await prisma.periodReview.updateManyAndReturn({
    where: { id: review.id, status: "OPEN" },
    data: {
      status: "CLOSED",
      closedAt,
      snapshot: snapshot as object,
      wdActual: facts.wdActual,
      wdRecommended: facts.wdRecommended,
      compoundedAmount: facts.compoundedAmount,
      disciplineScore: facts.discipline as unknown as object,
      budgetCoverage: { coveragePct: facts.budgetCoveragePct } as object,
    },
  });
  if (!updated) throw new ApiError(400, "Review sudah ditutup");
  await audit({ userId, action: "close", entity: "PeriodReview", entityId: review.id, after: snapshot, req });
  return updated;
}

/** Audited correction: the closed review stays immutable; a correction copy is opened. */
export async function correctReview(userId: string, kind: ReviewKind, req?: Request, selection?: ReviewSelection) {
  const review = await getOrCreateReview(userId, kind, selection);
  if (review.status !== "CLOSED") throw new ApiError(400, "Review belum ditutup");
  const projectId = review.projectId;
  const correction = await prisma.periodReview.create({
    data: {
      userId,
      projectId,
      kind,
      periodStart: new Date(review.periodStart.getTime() + 1), // next audited revision, original snapshot unchanged
      periodEnd: review.periodEnd,
      status: "OPEN",
      correctionOfId: review.id,
      performance: review.performance,
      riskNotes: review.riskNotes,
      reflections: review.reflections,
      nextPlan: review.nextPlan,
    },
  }).catch((error: unknown) => {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      throw new ApiError(409, "Revisi untuk review ini sudah dibuat. Buka kembali periodenya untuk melanjutkan.");
    }
    throw error;
  });
  await audit({ userId, action: "correct", entity: "PeriodReview", entityId: review.id, after: { correctionId: correction.id }, req });
  return correction;
}

export async function listReviews(userId: string, kind?: ReviewKind) {
  return prisma.periodReview.findMany({
    where: { userId, ...(kind ? { kind } : {}) },
    orderBy: { periodStart: "desc" },
    take: 60,
  });
}

export async function listReviewsWithPnl(userId: string) {
  const reviews = await listReviews(userId);
  if (!reviews.length) return [];
  const [rows, periods] = await Promise.all([
    realizedTradingRows(userId),
    Promise.all(reviews.map(reviewWindowForRevision)),
  ]);
  return reviews.map((review, index) => {
    const window = periods[index]!;
    const livePnl = rows.reduce((sum, row) => row.occurredAt >= window.start && row.occurredAt < window.end
      ? sum.plus(tradingAmountToUsd(row.amount, row.currency)) : sum, D(0));
    const snapshot = review.snapshot;
    const snapshotPnl = snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) &&
      typeof snapshot.netPnl === "string" ? snapshot.netPnl : null;
    return { ...review, window, livePnl, snapshotPnl };
  });
}

export async function dailyReviewStatuses(userId: string, window: ReviewWindow, timezone: string) {
  const reviews = await prisma.periodReview.findMany({
    where: { userId, kind: "DAILY", periodStart: { gte: window.start, lt: window.end } },
    orderBy: { periodStart: "asc" },
    select: { periodStart: true, status: true },
  });
  return new Map(reviews.map((review) => [localDateKey(review.periodStart, timezone), review.status]));
}

/* ───────────────── Notifications ───────────────── */

/** Lightweight in-app reminders, refreshed on demand (dashboard load). */
export async function refreshNotifications(userId: string) {
  type Notice = { kind: string; title: string; body?: string; severity: "INFO" | "WARNING" | "CRITICAL"; link?: string };
  const notes: Notice[] = [];
  const datedDebtNotes: (Notice & { id: string; userId: string })[] = [];

  const today = new Date();
  const timezone = await userTimezone(userId);
  const periods = (["DAILY", "WEEKLY", "MONTHLY"] as const).map((kind) => ({ kind, ...periodFor(kind, today, timezone) }));
  const [reviews, debts] = await Promise.all([
    Promise.all(periods.map(({ kind, start, end }) => prisma.periodReview.findFirst({
      where: { userId, kind, periodStart: { gte: start, lt: end } },
      orderBy: { periodStart: "desc" },
    }))),
    prisma.debt.findMany({ where: { userId, status: "ACTIVE" } }),
  ]);
  for (const [index, { kind }] of periods.entries()) {
    const review = reviews[index];
    if (!review || (review.status === "OPEN" && !review.reflections && !review.nextPlan)) {
      notes.push({
        kind: "review",
        title: `Review ${kind === "DAILY" ? "harian" : kind === "WEEKLY" ? "mingguan" : "bulanan"} belum diisi`,
        severity: kind === "DAILY" ? "INFO" : "WARNING",
        link: `/reviews/${kind.toLowerCase()}`,
      });
    }
  }

  const localToday = calendarDate(today, timezone);
  const todayKey = localToday.toISOString().slice(0, 10);
  const reminderEnd = addUTCDays(localToday, 3).toISOString().slice(0, 10);
  for (const d of debts) {
    const schedule = debtSchedule(d);
    if (schedule === "one_time" || schedule === "yearly") {
      const dueDate = scheduledDebtDate(schedule, debtDateKey(d.dueDate), todayKey);
      if (dueDate && dueDate >= todayKey && dueDate <= reminderEnd) {
        const label = schedule === "yearly" ? "Cicilan" : "Pelunasan";
        datedDebtNotes.push({
          id: `debt-due:${d.id}:${dueDate}`,
          userId,
          kind: "debt",
          title: `${label} "${d.name}" jatuh tempo ${fmtCalendarDateID(dueDate)}`,
          severity: "WARNING",
          link: `/debts#debt-${d.id}`,
        });
      }
      continue;
    }
    if (schedule === "flexible") continue;
    if (d.dueDay && d.installmentAmount) {
      const dayOfMonth = localToday.getUTCDate();
      const dueIn = d.dueDay - dayOfMonth;
      if (dueIn >= 0 && dueIn <= 3) {
        notes.push({
          kind: "debt",
          title: `Cicilan "${d.name}" jatuh tempo ${d.dueDay} bulan ini`,
          severity: "WARNING",
          link: "/debts",
        });
      }
    }
  }
  const datedNotices = datedDebtNotes.length
    ? await prisma.notification.createManyAndReturn({ data: datedDebtNotes, skipDuplicates: true })
    : [];

  const { riskStatus } = await import("./risk");
  const st = await riskStatus(userId);
  for (const b of st.breaches) {
    notes.push({ kind: "risk", title: b, severity: "CRITICAL", link: "/risk" });
  }

  // dedupe against unread
  const existing = await prisma.notification.findMany({
    where: { userId, readAt: null },
    select: { title: true },
  });
  const have = new Set(existing.map((e) => e.title));
  const fresh = notes.filter((n) => !have.has(n.title));
  const created = await Promise.all(
    fresh.map((n) => prisma.notification.create({ data: { userId, ...n } })),
  );
  const notices = [...datedNotices, ...created];
  if (notices.length === 0) return;
  const { dispatchNotification } = await import("./notify-channels");
  await Promise.allSettled(notices.map((notice) => dispatchNotification(userId, notice.id, timezone)));
}

export async function markAllRead(userId: string) {
  await prisma.notification.updateMany({
    where: { userId, readAt: null },
    data: { readAt: new Date() },
  });
}
