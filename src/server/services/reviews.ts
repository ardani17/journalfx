import { userTimezone } from "./time";
import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { D, Decimal } from "@/lib/money";
import { disciplineScore, type DisciplineResult } from "@/lib/finance/discipline";
import { debtDateKey, debtSchedule, scheduledDebtDate } from "@/lib/finance/debt";
import { coreMetrics } from "./analytics";
import { computeBalance } from "./ledger";
import { getRecommendation } from "./withdrawals";
import { budgetOverview } from "./finance";
import { addUTCDays, calendarDate, fmtCalendarDateID, zonedPeriod, DEFAULT_TZ } from "@/lib/dates";

export type ReviewKind = "DAILY" | "WEEKLY" | "MONTHLY";

export function periodFor(kind: ReviewKind, at = new Date(), timezone = DEFAULT_TZ): { start: Date; end: Date } {
  return zonedPeriod(kind, at, timezone);
}

export interface PeriodFacts {
  tradesCount: number;
  netPnl: Decimal;
  winRate: number | null;
  discipline: DisciplineResult;
  wdRecommended: Decimal;
  wdActual: Decimal;
  compoundedAmount: Decimal; // profit retained (not withdrawn) in period
  budgetCoveragePct: number | null;
  balance: Decimal;
}

/** Facts assembled from the ledger/analytics — captured immutably at close. */
export async function collectFacts(userId: string, kind: ReviewKind): Promise<PeriodFacts> {
  const { start, end } = periodFor(kind, new Date(), await userTimezone(userId));
  const [metrics, balances, wdRec, budget, trades, riskSettings, wdActualAgg] = await Promise.all([
    coreMetrics(userId, { from: start, to: end }),
    computeBalance(userId),
    getRecommendation(userId),
    budgetOverview(userId).catch(() => null),
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
    wdRecommended: wdRec.recommendation.recommended,
    wdActual,
    compoundedAmount,
    budgetCoveragePct: budget ? budget.coveragePct : null,
    balance: balances.balance,
  };
}

export async function getOrCreateReview(userId: string, kind: ReviewKind) {
  const { start, end } = periodFor(kind, new Date(), await userTimezone(userId));
  const latest = await prisma.periodReview.findFirst({
    where: { userId, kind, periodStart: { gte: start, lt: end } },
    orderBy: { periodStart: "desc" }, include: { project: { select: { name: true } } },
  });
  if (latest) return latest;
  const project = await prisma.project.findFirst({ where: { userId, isActive: true } });
  if (!project) throw new ApiError(404, "Project belum ada");
  const projectId = project.id;
  return prisma.periodReview.upsert({
    where: { userId_kind_periodStart: { userId, kind, periodStart: start } },
    create: { userId, projectId, kind, periodStart: start, periodEnd: end },
    update: {},
    include: { project: { select: { name: true } } },
  });
}

export async function saveReviewFields(
  userId: string,
  kind: ReviewKind,
  fields: { performance?: string; riskNotes?: string; reflections?: string; nextPlan?: string },
  req?: Request,
) {
  const review = await getOrCreateReview(userId, kind);
  if (review.status === "CLOSED") {
    throw new ApiError(400, "Review sudah ditutup (snapshot immutable) — buat koreksi melalui tombol koreksi");
  }
  const [updated] = await prisma.periodReview.updateManyAndReturn({
    where: { id: review.id, status: "OPEN" },
    data: fields,
  });
  if (!updated) throw new ApiError(400, "Review sudah ditutup (snapshot immutable)");
  await audit({ userId, action: "update", entity: "PeriodReview", entityId: review.id, after: fields, req });
  return updated;
}

export async function closeReview(userId: string, kind: ReviewKind, req?: Request) {
  const review = await getOrCreateReview(userId, kind);
  if (review.status === "CLOSED") throw new ApiError(400, "Review sudah ditutup");
  const facts = await collectFacts(userId, kind);
  const closedAt = new Date();
  const snapshot = {
    closedAt: closedAt.toISOString(),
    tradesCount: facts.tradesCount,
    netPnl: facts.netPnl.toString(),
    winRate: facts.winRate,
    balance: facts.balance.toString(),
    wdRecommended: facts.wdRecommended.toString(),
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
export async function correctReview(userId: string, kind: ReviewKind, req?: Request) {
  const review = await getOrCreateReview(userId, kind);
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
