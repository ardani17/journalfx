import { prisma } from "@/server/db";
import { ApiError } from "@/lib/api";
import { audit } from "@/server/audit";
import { tradingAmountToUsd } from "@/lib/money";

/** Economic calendar (v1.3.0): manual + CSV entry; timestamps UTC. */
export async function listEvents(userId: string, opts?: { from?: Date; to?: Date }) {
  return prisma.economicEvent.findMany({
    where: {
      userId,
      ...(opts?.from || opts?.to
        ? { at: { ...(opts?.from ? { gte: opts.from } : {}), ...(opts?.to ? { lt: opts.to } : {}) } }
        : {}),
    },
    orderBy: { at: "asc" },
    take: 200,
  });
}

export async function addEvent(
  userId: string,
  input: { at: string; currency: string; title: string; impact: string },
  req?: Request,
) {
  const ev = await prisma.economicEvent.create({
    data: {
      userId,
      at: new Date(input.at),
      currency: input.currency.toUpperCase(),
      title: input.title,
      impact: input.impact,
      source: "manual",
    },
  });
  await audit({ userId, action: "create", entity: "EconomicEvent", entityId: ev.id, after: input, req });
  return ev;
}

export async function deleteEvent(userId: string, id: string, req?: Request) {
  const ev = await prisma.economicEvent.findFirst({ where: { id, userId } });
  if (!ev) throw new ApiError(404, "Event tidak ditemukan");
  await prisma.economicEvent.delete({ where: { id } });
  await audit({ userId, action: "delete", entity: "EconomicEvent", entityId: id, req });
}

/** Events within ±windowMinutes of a trade entry — journal context (source-attributed). */
export async function eventsAround(userId: string, at: Date, windowMinutes = 120) {
  const from = new Date(at.getTime() - windowMinutes * 60_000);
  const to = new Date(at.getTime() + windowMinutes * 60_000);
  return prisma.economicEvent.findMany({ where: { userId, at: { gte: from, lt: to } } });
}

/** Explainable journal insights from the user's own trades. */
export async function buildInsights(userId: string) {
  const [trades, { journalInsights }] = await Promise.all([
    prisma.trade.findMany({
      where: { userId },
      orderBy: { entryAt: "asc" },
      include: { journal: true, account: { select: { currency: true } } },
    }),
    import("@/lib/finance/insights"),
  ]);
  type InsightTrade = import("@/lib/finance/insights").InsightTrade;
  let prevLoss = false;
  const mapped: InsightTrade[] = trades.map((tr) => {
    const j = tr.journal;
    const hasJournalContent = Boolean(j && (
      [j.marketContext, j.entryReason, j.exitReason, j.emotionBefore, j.emotionDuring, j.emotionAfter, j.lessons, j.improvement]
        .some((field) => field?.trim()) ||
      j.confidence !== null || j.stressLevel !== null || j.compliant !== null ||
      j.fomo || j.revenge || j.overtrading || j.mistakes.length || j.tags.length ||
      [j.preChecklist, j.postChecklist].some((value) => value && Object.keys(value).length)
    ));
    const item: InsightTrade = {
      session: tr.session,
      timeframe: tr.timeframe,
      direction: tr.direction,
      realizedPnl: tr.realizedPnl === null ? null : tradingAmountToUsd(tr.realizedPnl, tr.account.currency).toNumber(),
      actualR: tr.actualR ? Number(tr.actualR) : null,
      initialStopLoss: tr.initialStopLoss ? Number(tr.initialStopLoss) : null,
      entryAt: tr.entryAt.toISOString(),
      emotionBefore: j?.emotionBefore ?? null,
      fomo: j?.fomo ?? false,
      revenge: j?.revenge ?? false,
      overtrading: j?.overtrading ?? false,
      mistakes: j?.mistakes ?? [],
      hasJournalContent,
      journalComplete: Boolean(j && j.marketContext && j.entryReason && (j.lessons || j.postChecklist)),
      prevTradeLoss: prevLoss,
    };
    prevLoss = tr.realizedPnl !== null && Number(tr.realizedPnl) < 0;
    return item;
  });
  return journalInsights(mapped);
}
