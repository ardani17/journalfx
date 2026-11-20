import { AI_JOURNAL_SMALL_SAMPLE, MIN_AI_JOURNAL_TRADES, type AiJournalAnalysis } from "@/lib/ai-journal";
import { D, fmtNum, fmtPct, fmtUSD, tradingAmountToUsd, type Decimal } from "@/lib/money";
import { prisma } from "@/server/db";

export const REVIEW_ACTIONS = {
  "review-exits": "Tinjau alasan entry dan exit serta keputusan yang paling memengaruhi hasil trade ini.",
  "review-outliers": "Periksa trade dengan P/L paling ekstrem dan catat kondisi yang membuat hasilnya berbeda.",
  "review-decisions": "Tinjau catatan keputusan sebelum entry pada trade yang dibandingkan.",
  "review-checklist": "Tinjau apakah checklist sebelum entry membantu menjelaskan perbedaan disiplin pada trade ini.",
  "review-stop-record": "Cocokkan trade yang tidak mencatat SL awal dengan riwayat order dan catat apakah SL memang belum dipasang.",
  "review-risk": "Tinjau catatan SL awal dan ukuran risiko pada trade yang dibandingkan.",
} as const;

type ActionId = keyof typeof REVIEW_ACTIONS;
type JournalDiscipline = { compliant: boolean | null; fomo: boolean; emotionBefore: string | null };
type TradeSample = {
  pnlUsd: Decimal;
  r: Decimal | null;
  strategy: { id: string; name: string } | null;
  instrument: { id: string; symbol: string };
  session: string | null;
  compliant: boolean | null;
  fomo: boolean | null;
  recordedStop: boolean;
};

type TradeMetrics = {
  closedTrades: number;
  realizedPnlUsd: string;
  avgPnlUsd: string;
  winRatePct: string;
  avgR: string | null;
  actualRCount: number;
  wins: number;
  losses: number;
  breakEven: number;
};

type EvidenceGroup = { label: string; alias: string; metrics: TradeMetrics };
type Evidence = {
  id: string;
  groups: EvidenceGroup[];
  actionIds: readonly ActionId[];
  finding: string;
};

export type AiJournalEvidence = {
  coverage: AiJournalAnalysis["coverage"];
  evidence: Evidence[];
};

const performanceActions = ["review-exits", "review-outliers"] as const;
const disciplineActions = ["review-decisions", "review-checklist"] as const;
const riskActions = ["review-stop-record", "review-risk"] as const;
const recordedEmotions = new Set(["calm", "anxious", "excited", "angry", "bored"]);
const sessionLabels = new Map([["asian", "Asia"], ["london", "London"], ["newyork", "New York"]]);

function fomoStatus(journal: JournalDiscipline | null): boolean | null {
  if (!journal) return null;
  if (journal.fomo || journal.emotionBefore === "fomo") return true;
  // The stored false is also the default for a new journal. A recorded emotion provides a comparison sample.
  return journal.emotionBefore && recordedEmotions.has(journal.emotionBefore) ? false : null;
}

function tradeMetrics(trades: TradeSample[]): TradeMetrics {
  const closedTrades = trades.length;
  let pnl = D(0);
  let r = D(0);
  let actualRCount = 0;
  let wins = 0;
  let losses = 0;

  for (const trade of trades) {
    pnl = pnl.plus(trade.pnlUsd);
    if (trade.pnlUsd.gt(0)) wins++;
    if (trade.pnlUsd.lt(0)) losses++;
    if (trade.r !== null) {
      r = r.plus(trade.r);
      actualRCount++;
    }
  }

  return {
    closedTrades,
    realizedPnlUsd: pnl.toFixed(2),
    avgPnlUsd: pnl.div(closedTrades).toFixed(2),
    winRatePct: D(wins).times(100).div(closedTrades).toFixed(2),
    avgR: actualRCount > 0 ? r.div(actualRCount).toFixed(2) : null,
    actualRCount,
    wins,
    losses,
    breakEven: closedTrades - wins - losses,
  };
}

type Group = { key: string; label: string; alias?: string };

function compareGroups(
  id: string,
  trades: TradeSample[],
  classify: (trade: TradeSample) => Group | undefined,
  actionIds: readonly ActionId[],
): Evidence | undefined {
  const byGroup = new Map<string, { group: Group; trades: TradeSample[] }>();
  for (const trade of trades) {
    const group = classify(trade);
    if (!group) continue;
    const bucket = byGroup.get(group.key);
    if (bucket) bucket.trades.push(trade);
    else byGroup.set(group.key, { group, trades: [trade] });
  }
  const ranked = Array.from(byGroup.values())
    .filter((group) => group.trades.length >= MIN_AI_JOURNAL_TRADES)
    .map(({ group, trades }) => ({ ...group, metrics: tradeMetrics(trades) }))
    .sort((a, b) => D(b.metrics.avgPnlUsd).comparedTo(a.metrics.avgPnlUsd) || a.key.localeCompare(b.key));
  const best = ranked[0];
  const worst = ranked.at(-1);
  if (!best || !worst || D(best.metrics.avgPnlUsd).eq(worst.metrics.avgPnlUsd)) return;

  return {
    id,
    groups: [best, worst].map(({ label, alias, metrics }, index) => ({ label, alias: alias ?? (index === 0 ? "A" : "B"), metrics })),
    actionIds,
    finding: `${best.label} punya rata-rata P/L per trade lebih tinggi daripada ${worst.label}.`,
  };
}

export function renderAiJournalFinding(evidence: Evidence, actionId: ActionId): AiJournalAnalysis["findings"][number] {
  return {
    id: evidence.id,
    finding: evidence.finding,
    evidence: evidence.groups.map(({ label, metrics }) => {
      const n = metrics.closedTrades;
      const r = metrics.avgR === null ? "R tidak tersedia" : `rata-rata R ${fmtNum(metrics.avgR)}R (${metrics.actualRCount}/${n} trade)`;
      const sample = n < AI_JOURNAL_SMALL_SAMPLE ? " · sampel kecil (<30 trade)" : "";
      return `${label} · ${n} trade · P/L trade tertutup ${fmtUSD(metrics.realizedPnlUsd)} · rata-rata P/L ${fmtUSD(metrics.avgPnlUsd)} per trade · win rate ${fmtPct(metrics.winRatePct)} · ${r}${sample}`;
    }),
    reviewAction: REVIEW_ACTIONS[actionId],
  };
}

export async function loadAiJournalEvidence(userId: string): Promise<AiJournalEvidence> {
  const rows = await prisma.trade.findMany({
    where: { userId, status: "CLOSED", realizedPnl: { not: null } },
    select: {
      realizedPnl: true,
      actualR: true,
      initialStopLoss: true,
      session: true,
      account: { select: { currency: true } },
      strategy: { select: { id: true, name: true } },
      instrument: { select: { id: true, symbol: true } },
      journal: { select: { compliant: true, fomo: true, emotionBefore: true } },
    },
  });
  const trades = rows.map((row): TradeSample => ({
    pnlUsd: tradingAmountToUsd(row.realizedPnl, row.account.currency),
    r: row.actualR === null ? null : D(row.actualR),
    strategy: row.strategy,
    instrument: row.instrument,
    session: row.session,
    compliant: row.journal?.compliant ?? null,
    fomo: fomoStatus(row.journal),
    recordedStop: row.initialStopLoss !== null,
  }));
  const coverage = {
    closedTrades: trades.length,
    disciplineTrades: trades.filter((trade) => trade.compliant !== null || trade.fomo !== null).length,
  };
  if (coverage.closedTrades < MIN_AI_JOURNAL_TRADES) return { coverage, evidence: [] };

  const overview = tradeMetrics(trades);
  const missingStop = trades.filter((trade) => !trade.recordedStop);
  const stopComparison = compareGroups("stop-loss", trades, ({ recordedStop }) => recordedStop
    ? { key: "recorded", label: "Trade dengan SL awal tercatat", alias: "recorded" }
    : { key: "missing", label: "Trade tanpa catatan SL awal", alias: "missing" }, riskActions);
  const stopCoverage: Evidence | undefined = missingStop.length >= MIN_AI_JOURNAL_TRADES ? {
    id: "stop-loss",
    groups: [{ label: "Trade tanpa catatan SL awal", alias: "missing", metrics: tradeMetrics(missingStop) }],
    actionIds: riskActions,
    finding: `SL awal tidak tercatat pada ${missingStop.length} dari ${coverage.closedTrades} trade tertutup.`,
  } : undefined;
  const evidence = [
    {
      id: "overview",
      finding: "Ringkasan performa trade tertutup.",
      groups: [{ label: "Seluruh riwayat", alias: "overall", metrics: overview }],
      actionIds: performanceActions,
    },
    compareGroups("strategy", trades, ({ strategy }) => strategy
      ? { key: strategy.id, label: `Strategi ${strategy.name}` } : undefined, performanceActions),
    compareGroups("instrument", trades, ({ instrument }) => ({
      key: instrument.id, label: instrument.symbol,
    }), performanceActions),
    compareGroups("session", trades, ({ session }) => {
      const label = sessionLabels.get(session?.trim().toLowerCase() ?? "");
      return label ? { key: label, label: `Sesi ${label}`, alias: label } : undefined;
    }, performanceActions),
    compareGroups("compliance", trades, ({ compliant }) => {
      if (compliant === null) return;
      return compliant
        ? { key: "yes", label: "Trade yang tercatat patuh pada rencana", alias: "compliant" }
        : { key: "no", label: "Trade yang tercatat tidak patuh pada rencana", alias: "noncompliant" };
    }, disciplineActions),
    compareGroups("fomo", trades, ({ fomo }) => {
      if (fomo === null) return;
      return fomo
        ? { key: "yes", label: "Trade dengan FOMO tercatat", alias: "fomo" }
        : { key: "no", label: "Trade dengan emosi tercatat tanpa indikasi FOMO", alias: "other-emotion" };
    }, disciplineActions),
    stopComparison ?? stopCoverage,
  ].filter((candidate): candidate is Evidence => candidate !== undefined);

  return { coverage, evidence };
}
