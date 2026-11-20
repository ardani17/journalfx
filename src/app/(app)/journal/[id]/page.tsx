import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getTrade } from "@/server/services/trades";
import { ApiError } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { TradeDetail, type TradeDTO } from "./trade-detail";
import { fmtDateTimeID } from "@/lib/dates";
import { D, fmtDecimal, fmtTradingMoney } from "@/lib/money";
import { tradeDirectionLabel, tradeStatusLabel } from "@/lib/trading-labels";

export const metadata = { title: "Detail Transaksi" };

export default async function TradeDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  let trade;
  try {
    trade = await getTrade(user.id, id);
  } catch (e) {
    if (e instanceof ApiError && e.status === 404) notFound();
    throw e;
  }

  const t = trade;
  return (
    <PageShell>
      <PageHeader
        title={`${t.instrument.symbol} · ${tradeDirectionLabel[t.direction]} ${fmtDecimal(t.lot)}`}
        subtitle={`${fmtDateTimeID(t.entryAt, user.timezone)} · ${t.account.name}${t.ticket ? ` · #${t.ticket}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={tradeStatusTone[t.status]}>{tradeStatusLabel[t.status]}</Badge>
            <RealizedPnlBadge value={t.realizedPnl} currency={t.account.currency} />
          </div>
        }
      />
      <TradeDetail trade={serializeTrade(t, user.timezone)} />
    </PageShell>
  );
}

type SavedTrade = Awaited<ReturnType<typeof getTrade>>;

const tradeStatusTone = {
  CLOSED: "success", OPEN: "info", PARTIAL: "warn", PLANNED: "neutral", CANCELLED: "neutral",
} as const;

function RealizedPnlBadge({ value, currency }: { value: SavedTrade["realizedPnl"]; currency: string }) {
  if (value === null) return null;
  const pnl = D(value);
  return <Badge tone={pnl.gt(0) ? "success" : pnl.lt(0) ? "danger" : "neutral"}>{fmtTradingMoney(pnl, currency)}</Badge>;
}

function decimalNumber(value: SavedTrade["realizedPnl"]) {
  return value === null ? null : Number(value);
}

function serializeTrade(t: SavedTrade, timezone: string): TradeDTO {
  return {
    timezone,
    id: t.id,
    status: t.status,
    direction: t.direction,
    symbol: t.instrument.symbol,
    currency: t.account.currency,
    pricePrecision: t.instrument.pricePrecision,
    requiresReportedPnl: t.instrument.contractSize === null,
    lot: t.lot.toString(),
    entryPrice: t.entryPrice.toString(),
    exitPrice: t.exitPrice?.toString() ?? null,
    initialStopLoss: t.initialStopLoss?.toString() ?? null,
    initialTakeProfit: t.initialTakeProfit?.toString() ?? null,
    initialRisk: decimalNumber(t.initialRisk),
    plannedRR: decimalNumber(t.plannedRR),
    actualR: decimalNumber(t.actualR),
    realizedPnl: decimalNumber(t.realizedPnl),
    commission: Number(t.commission),
    swap: Number(t.swap),
    fees: Number(t.fees),
    session: t.session,
    timeframe: t.timeframe,
    strategy: t.strategy?.name ?? null,
    entryAt: t.entryAt.toISOString(),
    exitAt: t.exitAt?.toISOString() ?? null,
    executions: t.executions.map((e) => ({
      id: e.id,
      kind: e.kind,
      quantity: e.quantity.toString(),
      price: e.price.toString(),
      commission: Number(e.commission),
      swap: Number(e.swap),
      fees: Number(e.fees),
      realizedPnl: decimalNumber(e.realizedPnl),
      executedAt: e.executedAt.toISOString(),
    })),
    journal: serializeJournal(t.journal),
    attachments: t.attachments.map((a) => ({
      id: a.id,
      kind: a.kind,
      fileName: a.fileName,
      createdAt: a.createdAt.toISOString(),
    })),
  };
}

function serializeJournal(journal: SavedTrade["journal"]): TradeDTO["journal"] {
  if (!journal) return null;
  return {
    marketContext: journal.marketContext,
    entryReason: journal.entryReason,
    exitReason: journal.exitReason,
    emotionBefore: journal.emotionBefore,
    emotionDuring: journal.emotionDuring,
    emotionAfter: journal.emotionAfter,
    confidence: journal.confidence,
    stressLevel: journal.stressLevel,
    fomo: journal.fomo,
    revenge: journal.revenge,
    overtrading: journal.overtrading,
    compliant: journal.compliant,
    mistakes: journal.mistakes,
    lessons: journal.lessons,
    improvement: journal.improvement,
    tags: journal.tags,
    preChecklist: (journal.preChecklist ?? null) as Record<string, boolean> | null,
    postChecklist: (journal.postChecklist ?? null) as Record<string, boolean> | null,

  };
}
