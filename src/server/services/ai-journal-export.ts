import type { Prisma } from "@prisma/client";
import { MIN_AI_JOURNAL_TRADES, type AiJournalCoverage, type AiJournalMetrics, type AiJournalScope } from "@/lib/ai-journal";
import { DEFAULT_TZ, isValidTimezone } from "@/lib/dates";
import { D, Decimal, tradingAmountToUsd } from "@/lib/money";
import { journalEmotionLabel, journalMistakeLabel, tradingSessionLabel } from "@/lib/trading-labels";
import { prisma } from "@/server/db";

const MAX_EXPORT_BYTES = 24 * 1024;
const MAX_EXAMPLES = 3;
const MAX_GROUPS_PER_BREAKDOWN = 12;
const BREAKDOWNS = ["instrument", "strategy", "session", "day"] as const;

const tradeSelect = {
  id: true, accountId: true, direction: true, lot: true, entryAt: true, exitAt: true, entryPrice: true, actualR: true,
  exitPrice: true, initialStopLoss: true, initialTakeProfit: true, initialRisk: true,
  realizedPnl: true, session: true,
  account: { select: { currency: true } },
  instrument: { select: { id: true, symbol: true } },
  strategy: { select: { id: true, name: true } },
  journal: { select: { compliant: true, fomo: true, revenge: true, overtrading: true, emotionBefore: true,
    emotionDuring: true, emotionAfter: true, mistakes: true, exitReason: true } },
} satisfies Prisma.TradeSelect;

type TradeRow = Prisma.TradeGetPayload<{ select: typeof tradeSelect }>;
type Trade = TradeRow & { ref: string; accountRef: string; instrumentRef: string; strategyRef: string; day: string; pnl: Decimal };
type Example = {
  tradeRef: string;
  account: string;
  accountCurrency: "USD" | "USC";
  instrument: string;
  entryAt: string;
  exitAt: string | null;
  pnlUsd: string;
  details?: Record<string, string | number | boolean | null>;
  partialCloses?: { at: string; price: string; lot: string }[];
};
type Pattern = {
  id: string;
  label: string;
  kind: "recorded" | "indicator";
  trades: number;
  netPnlUsd: string;
  netPnlWithoutTheseTradesUsd: string;
  examples: Example[];
};
type Group = ReturnType<typeof groupMetrics> & { id: string };

function closedTradesWhere(userId: string) {
  return { userId, status: "CLOSED", realizedPnl: { not: null } } satisfies Prisma.TradeWhereInput;
}

export async function hasEnoughAiJournalTrades(userId: string) {
  const count = await prisma.trade.count({ where: closedTradesWhere(userId), take: MIN_AI_JOURNAL_TRADES });
  return count >= MIN_AI_JOURNAL_TRADES;
}

function divide(numerator: Decimal, denominator: Decimal | number): Decimal | null {
  return D(denominator).isZero() ? null : numerator.div(denominator);
}

function groupMetrics(trades: Trade[]) {
  let grossWin = D(0);
  let grossLoss = D(0);
  let wins = 0;
  let losses = 0;
  let rTotal = D(0);
  let rCount = 0;
  for (const { pnl, actualR } of trades) {
    if (pnl.gt(0)) {
      wins++;
      grossWin = grossWin.plus(pnl);
    } else if (pnl.lt(0)) {
      losses++;
      grossLoss = grossLoss.minus(pnl);
    }
    if (actualR !== null) {
      rTotal = rTotal.plus(D(actualR));
      rCount++;
    }
  }
  const count = trades.length;
  const net = grossWin.minus(grossLoss);
  return {
    closedTrades: count, wins, losses, breakEven: count - wins - losses,
    winRate: count ? Number(D(wins).times(100).div(count).toFixed(2)) : null,
    netPnlUsd: net.toString(),
    expectancyUsd: divide(net, count)?.toFixed(4) ?? null,
    avgWin: divide(grossWin, wins),
    avgLoss: divide(grossLoss, losses),
    avgR: divide(rTotal, rCount)?.toDecimalPlaces(4).toNumber() ?? null,
    profitFactor: divide(grossWin, grossLoss),
  };
}

function closeOrder(trades: Trade[]) {
  return trades.flatMap((trade) => trade.exitAt ? [{ trade, time: trade.exitAt.getTime() }] : [])
    .sort((a, b) => a.time - b.time || a.trade.entryAt.getTime() - b.trade.entryAt.getTime() ||
      a.trade.id.localeCompare(b.trade.id));
}

function overallMetrics(trades: Trade[]): AiJournalMetrics {
  const { avgWin, avgLoss, profitFactor, ...metrics } = groupMetrics(trades);
  const closed = closeOrder(trades);
  let cumulative = D(0);
  let peak = D(0);
  let drawdown = D(0);
  for (const { trade } of closed) {
    cumulative = cumulative.plus(trade.pnl);
    peak = Decimal.max(peak, cumulative);
    drawdown = Decimal.max(drawdown, peak.minus(cumulative));
  }
  return {
    ...metrics,
    avgWinUsd: avgWin?.toFixed(4) ?? null,
    avgLossUsd: avgLoss?.toFixed(4) ?? null,
    profitFactor: profitFactor?.toDecimalPlaces(4).toNumber() ?? null,
    realizedRiskReward: avgWin && avgLoss ? avgWin.div(avgLoss).toDecimalPlaces(4).toNumber() : null,
    closedTradeDrawdownUsd: closed.length ? drawdown.toString() : null,
  };
}

function groupBy<T>(values: T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>();
  for (const value of values) {
    const id = key(value);
    const group = groups.get(id);
    if (group) group.push(value);
    else groups.set(id, [value]);
  }
  return groups;
}

function inputGroup(id: string, trades: Trade[]): Group {
  return { id, ...groupMetrics(trades) };
}

function rankGroups(groups: Map<string, Trade[]>) {
  const calculated = [...groups].map(([id, rows]) => inputGroup(id, rows));
  const byExpectancy = calculated.filter((group) => group.closedTrades >= MIN_AI_JOURNAL_TRADES)
    .sort((a, b) => D(b.expectancyUsd).cmp(D(a.expectancyUsd)) || a.id.localeCompare(b.id));
  const bySize = calculated.sort((a, b) => b.closedTrades - a.closedTrades || a.id.localeCompare(b.id));
  return [...new Set([...byExpectancy.slice(0, 3), ...byExpectancy.slice(-3).reverse(), ...bySize])];
}

function sessionName(session: string | null) {
  const key = session?.trim().toLowerCase() ?? "";
  return Object.hasOwn(tradingSessionLabel, key) ? tradingSessionLabel[key]! : "Sesi tidak tercatat";
}

function hasRisk(trade: Trade) {
  return trade.initialRisk !== null && D(trade.initialRisk).gt(0);
}

function comparesAtLeastFiftyPercentHigher(next: Trade, previous: Trade) {
  if (hasRisk(next) && hasRisk(previous)) return D(next.initialRisk).gte(D(previous.initialRisk).times(1.5));
  return next.instrumentRef === previous.instrumentRef && D(previous.lot).gt(0) && D(next.lot).gte(D(previous.lot).times(1.5));
}

type Candidate = { trade: Trade; details?: Example["details"] };

function timingEvidence(trades: Trade[]) {
  const revenge: Candidate[] = [];
  const riskIncreases: Candidate[] = [];
  for (const account of groupBy(trades, (trade) => trade.accountRef).values()) {
    const completed = closeOrder(account);
    let closeIndex = 0;
    let previous: Trade | undefined;
    for (const trade of account) {
      const entryTime = trade.entryAt.getTime();
      for (let nextClose = completed[closeIndex]; nextClose; nextClose = completed[++closeIndex]) {
        const { trade: closing, time } = nextClose;
        const openedAt = closing.entryAt.getTime();
        if (time > entryTime || (time === entryTime && openedAt >= entryTime)) break;
        if (openedAt <= time) previous = closing;
      }
      if (!previous?.exitAt || !comparesAtLeastFiftyPercentHigher(trade, previous)) continue;
      const minutesSinceClose = (entryTime - previous.exitAt.getTime()) / 60_000;
      const details = {
        previousTrade: previous.ref, minutesSinceClose, previousPnlUsd: previous.pnl.toString(),
        previousLot: String(previous.lot), lot: String(trade.lot),
        previousRiskUsd: hasRisk(previous) ? String(previous.initialRisk) : null,
        riskUsd: hasRisk(trade) ? String(trade.initialRisk) : null,
      };
      riskIncreases.push({ trade, details });
      if (previous.pnl.lt(0) && minutesSinceClose <= 15) revenge.push({ trade, details });
    }
  }
  return { revenge, riskIncreases };
}

function frequentDays(trades: Trade[]) {
  const result: Candidate[] = [];
  const known = trades.filter((trade) => sessionName(trade.session) !== "Sesi tidak tercatat");
  for (const session of groupBy(known, (trade) => trade.accountRef + ":" + sessionName(trade.session)).values()) {
    const days = [...groupBy(session, (trade) => trade.day).values()].sort((a, b) => a.length - b.length);
    const baselineLength = days.length - 1;
    if (baselineLength < 5) continue;
    const allWins = session.filter((trade) => trade.pnl.gt(0)).length;
    for (const [index, day] of days.entries()) {
      const rank = (position: number) => days[position + Number(position >= index)]!.length;
      const median = (rank(Math.floor((baselineLength - 1) / 2)) + rank(Math.floor(baselineLength / 2))) / 2;
      if (day.length < 2 * median) continue;
      const dayWins = day.filter((trade) => trade.pnl.gt(0)).length;
      const baselineRate = (allWins - dayWins) / (session.length - day.length);
      if (dayWins / day.length >= baselineRate) continue;
      const first = day[0]!;
      const details = { day: first.day, session: sessionName(first.session), dayTrades: day.length, baselineMedianTrades: median,
        baselineDays: baselineLength, winRate: Math.round(dayWins / day.length * 10_000) / 100,
        baselineWinRate: Math.round(baselineRate * 10_000) / 100 };
      for (const trade of day) result.push({ trade, details });
    }
  }
  return result;
}

function exitsBeforeTarget(trades: Trade[]): Candidate[] {
  return trades.flatMap((trade) => {
    if (!trade.pnl.gt(0) || trade.exitPrice === null || trade.initialTakeProfit === null) return [];
    const distance = D(trade.initialTakeProfit).minus(D(trade.exitPrice));
    if (trade.direction === "LONG" ? !distance.gt(0) : !distance.lt(0)) return [];
    return [{ trade, details: {
      entryPrice: String(trade.entryPrice), exitPrice: String(trade.exitPrice), targetPrice: String(trade.initialTakeProfit),
      priceGapToTarget: distance.abs().toString(), exitReasonRecorded: Boolean(trade.journal?.exitReason?.trim()),
    } }];
  });
}

const journalSignals = {
  "missing-stop": { label: "SL awal tidak tercatat", select: (trade: Trade) => trade.initialStopLoss === null },
  "missing-target": { label: "TP awal tidak tercatat", select: (trade: Trade) => trade.initialTakeProfit === null },
  "compliant": { label: "Tercatat patuh pada rencana", select: (trade: Trade) => trade.journal?.compliant === true },
  "noncompliant": { label: "Tercatat tidak patuh pada rencana", select: (trade: Trade) => trade.journal?.compliant === false },
  "recorded-fomo": { label: "FOMO tercatat", select: (trade: Trade) => Boolean(trade.journal?.fomo) ||
    [trade.journal?.emotionBefore, trade.journal?.emotionDuring, trade.journal?.emotionAfter].includes("fomo") },
  "recorded-revenge": { label: "Revenge trading tercatat", select: (trade: Trade) => trade.journal?.revenge === true },
  "recorded-overtrading": { label: "Overtrading tercatat", select: (trade: Trade) => trade.journal?.overtrading === true },
  "recorded-mistakes": { label: "Trade dengan kesalahan tercatat di jurnal",
    select: (trade: Trade) => Boolean(trade.journal?.mistakes.some((mistake) => mistake.trim())) },
};

function buildEvidence(trades: Trade[], metrics: AiJournalMetrics, tradesByExample: Map<Example, string>) {
  const evidence: Pattern[] = [];
  function add(id: string, label: string, kind: Pattern["kind"], candidates: Candidate[]) {
    if (!candidates.length) return;
    const net = candidates.reduce((sum, { trade }) => sum.plus(trade.pnl), D(0));
    const examples = candidates.slice().sort((a, b) => a.trade.entryAt.getTime() - b.trade.entryAt.getTime() ||
      a.trade.id.localeCompare(b.trade.id)).slice(-MAX_EXAMPLES).map(({ trade, details }) => {
      const example: Example = {
        tradeRef: trade.ref, account: trade.accountRef, accountCurrency: trade.account.currency === "USC" ? "USC" : "USD",
        instrument: trade.instrumentRef, entryAt: trade.entryAt.toISOString(),
        exitAt: trade.exitAt?.toISOString() ?? null, pnlUsd: trade.pnl.toString(), details,
      };
      tradesByExample.set(example, trade.id);
      return example;
    });
    evidence.push({ id, label, kind, trades: candidates.length, netPnlUsd: net.toString(),
      netPnlWithoutTheseTradesUsd: D(metrics.netPnlUsd).minus(net).toString(), examples });
  }
  const { revenge, riskIncreases } = timingEvidence(trades);
  add("possible-revenge", "Indikasi entry cepat dengan kenaikan risiko setelah rugi", "indicator", revenge);
  add("possible-overtrading", "Indikasi lonjakan frekuensi dengan win rate lebih rendah", "indicator", frequentDays(trades));
  add("higher-risk", "Kenaikan risiko atau ukuran lot", "indicator", riskIncreases);
  add("exit-below-target", "Exit profit sebelum level TP tercatat", "indicator", exitsBeforeTarget(trades));
  for (const [id, { label, select }] of Object.entries(journalSignals)) {
    add(id, label, "recorded", trades.filter(select).map((trade) => ({ trade })));
  }
  for (const [emotion, label] of Object.entries(journalEmotionLabel)) {
    if (emotion === "fomo") continue;
    const recorded = trades.filter(({ journal }) => journal &&
      [journal.emotionBefore, journal.emotionDuring, journal.emotionAfter].includes(emotion));
    add("emotion-" + emotion, "Emosi tercatat: " + label, "recorded", recorded.map((trade) => ({ trade })));
  }
  for (const [tag, label] of Object.entries(journalMistakeLabel)) {
    const id = "mistake-" + tag.toLowerCase().replaceAll(" ", "-");
    const recorded = trades.filter(({ journal }) => journal?.mistakes.includes(tag));
    add(id, "Kesalahan tercatat: " + label, "recorded", recorded.map((trade) => ({ trade })));
  }
  return evidence;
}

function assignRef(map: Map<string, string>, key: string, prefix: string) {
  const existing = map.get(key);
  if (existing) return existing;
  const ref = prefix + "-" + (map.size + 1);
  map.set(key, ref);
  return ref;
}

export async function loadAiJournalExport(userId: string, userTimezone: string) {
  return prisma.$transaction(async (tx) => {
    const timezone = isValidTimezone(userTimezone) ? userTimezone : DEFAULT_TZ;
    const capturedAt = new Date().toISOString();
    const rows = await tx.trade.findMany({ where: closedTradesWhere(userId), select: tradeSelect,
      orderBy: [{ entryAt: "asc" }, { id: "asc" }] });
    const settings = rows.length >= MIN_AI_JOURNAL_TRADES ? await tx.riskSettings.findUnique({ where: { userId },
      select: { riskPerTrade: true, dailyLossLimit: true, weeklyLossLimit: true, maxOpenRisk: true } }) : null;
    const riskSettings = settings ? { appliesTo: "current" as const, unit: "percent" as const, ...settings } : null;
    const localDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone, year: "numeric", month: "2-digit", day: "2-digit" });
    const labels = new Map<string, string>([["overview", "Seluruh trade tertutup"], ["no-strategy", "Tanpa strategi"]]);
    const accounts = new Map<string, string>();
    const instruments = new Map<string, string>();
    const strategies = new Map<string, string>();
    const trades = rows.map((row, index): Trade => {
      const instrumentRef = assignRef(instruments, row.instrument.id, "instrument");
      const strategyRef = row.strategy ? assignRef(strategies, row.strategy.id, "strategy") : "no-strategy";
      labels.set(instrumentRef, row.instrument.symbol);
      if (row.strategy) labels.set(strategyRef, row.strategy.name);
      return { ...row, ref: "trade-" + (index + 1), day: localDate.format(row.entryAt),
        accountRef: assignRef(accounts, row.accountId, "account"), instrumentRef, strategyRef,
        pnl: tradingAmountToUsd(row.realizedPnl, row.account.currency) };
    });

    const scope: AiJournalScope = { capturedAt, timezone, currency: "USD", closedTrades: trades.length,
      from: trades[0]?.day ?? null, to: trades.at(-1)?.day ?? null };
    const coverage: AiJournalCoverage = {
      withJournal: trades.filter((trade) => trade.journal).length,
      withRecordedStop: trades.filter((trade) => trade.initialStopLoss !== null).length,
      withRecordedTarget: trades.filter((trade) => trade.initialTakeProfit !== null).length,
      withExitTime: trades.filter((trade) => trade.exitAt !== null).length,
      withExitReason: trades.filter((trade) => trade.journal?.exitReason?.trim()).length,
      withRisk: trades.filter(hasRisk).length,
      withActualR: trades.filter((trade) => trade.actualR !== null).length,
      withSession: trades.filter((trade) => sessionName(trade.session) !== "Sesi tidak tercatat").length,
      withJournalDiscipline: trades.filter(({ journal }) => journal && (journal.compliant != null || journal.fomo || journal.revenge ||
        journal.overtrading || journal.emotionBefore || journal.emotionDuring || journal.emotionAfter ||
        journal.mistakes.some((mistake) => mistake.trim()))).length,
      breakdownGroupsOmitted: 0, examplesOmitted: 0,
    };
    const metrics = overallMetrics(trades);
    const ranked = {
      instrument: rankGroups(groupBy(trades, (trade) => trade.instrumentRef)),
      strategy: rankGroups(groupBy(trades, (trade) => trade.strategyRef)),
      session: rankGroups(groupBy(trades, (trade) => sessionName(trade.session))).map((group) => {
        const id = "session-" + group.id.toLowerCase().replaceAll(" ", "-");
        labels.set(id, group.id);
        return { ...group, id };
      }),
      day: rankGroups(groupBy(trades, (trade) => trade.day)).map((group) => {
        const id = "day-" + group.id;
        labels.set(id, "Tanggal entry " + group.id);
        return { ...group, id };
      }),
    };
    const breakdowns = {
      instrument: ranked.instrument.slice(0, MAX_GROUPS_PER_BREAKDOWN),
      strategy: ranked.strategy.slice(0, MAX_GROUPS_PER_BREAKDOWN),
      session: ranked.session.slice(0, MAX_GROUPS_PER_BREAKDOWN),
      day: ranked.day.slice(0, MAX_GROUPS_PER_BREAKDOWN),
    };
    for (const key of BREAKDOWNS) coverage.breakdownGroupsOmitted += ranked[key].length - breakdowns[key].length;
    const tradesByExample = new Map<Example, string>();
    const evidence = buildEvidence(trades, metrics, tradesByExample);
    for (const pattern of evidence) coverage.examplesOmitted += pattern.trades - pattern.examples.length;
    const exitExamples = evidence.find(({ id }) => id === "exit-below-target")?.examples ?? [];
    for (const example of exitExamples) {
      const tradeId = tradesByExample.get(example);
      if (!tradeId) continue;
      const executions = await tx.tradeExecution.findMany({ where: { userId, tradeId, kind: "PARTIAL_CLOSE" },
        take: 3, orderBy: [{ executedAt: "desc" }, { id: "desc" }], select: { executedAt: true, price: true, quantity: true } });
      if (executions.length) example.partialCloses = executions.reverse().map((execution) => ({
        at: execution.executedAt.toISOString(), price: String(execution.price), lot: String(execution.quantity),
      }));
    }
    const payload = { schemaVersion: 1, scope, coverage, metrics, breakdowns, evidence, riskSettings };
    let json = JSON.stringify(payload);
    while (Buffer.byteLength(json, "utf8") > MAX_EXPORT_BYTES) {
      const pattern = evidence.reduce<Pattern | undefined>((longest, item) =>
        item.examples.length > (longest?.examples.length ?? 0) ? item : longest, undefined);
      if (pattern) {
        pattern.examples.shift();
        coverage.examplesOmitted++;
      } else {
        const key = BREAKDOWNS.reduce((longest, current) =>
          breakdowns[current].length > breakdowns[longest].length ? current : longest);
        if (!breakdowns[key].pop()) throw new Error("AI journal summary exceeds the export size limit");
        coverage.breakdownGroupsOmitted++;
      }
      json = JSON.stringify(payload);
    }
    return { json, payload, labels };
  }, { isolationLevel: "RepeatableRead" });
}

export type AiJournalExport = Awaited<ReturnType<typeof loadAiJournalExport>>;
