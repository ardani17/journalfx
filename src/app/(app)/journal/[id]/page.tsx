import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getTrade } from "@/server/services/trades";
import { ApiError } from "@/lib/api";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Badge } from "@/components/ui/badge";
import { TradeDetail } from "./trade-detail";
import { fmtDateID } from "@/lib/dates";
import { D, fmtDecimal, fmtUSD } from "@/lib/money";

export const metadata = { title: "Detail Trade" };

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
        title={`${t.instrument.symbol} · ${t.direction === "LONG" ? "Buy" : "Sell"} ${fmtDecimal(t.lot)}`}
        subtitle={`${fmtDateID(t.entryAt, "d MMM yyyy, HH:mm")} · ${t.account.name}${t.ticket ? ` · #${t.ticket}` : ""}`}
        actions={
          <div className="flex items-center gap-2">
            <Badge tone={t.status === "CLOSED" ? "success" : t.status === "OPEN" ? "info" : t.status === "PARTIAL" ? "warn" : "neutral"}>
              {t.status}
            </Badge>
            {t.realizedPnl !== null ? (
              <Badge tone={D(t.realizedPnl).isPositive() ? "success" : "danger"}>
                {fmtUSD(D(t.realizedPnl))}
              </Badge>
            ) : null}
          </div>
        }
      />
      <TradeDetail
        trade={{
          id: t.id,
          status: t.status,
          direction: t.direction,
          symbol: t.instrument.symbol,
          pricePrecision: t.instrument.pricePrecision,
          requiresReportedPnl: t.instrument.contractSize === null,
          lot: t.lot.toString(),
          entryPrice: t.entryPrice.toString(),
          exitPrice: t.exitPrice?.toString() ?? null,
          initialStopLoss: t.initialStopLoss?.toString() ?? null,
          initialTakeProfit: t.initialTakeProfit?.toString() ?? null,
          initialRisk: t.initialRisk ? Number(t.initialRisk) : null,
          plannedRR: t.plannedRR ? Number(t.plannedRR) : null,
          actualR: t.actualR ? Number(t.actualR) : null,
          realizedPnl: t.realizedPnl ? Number(t.realizedPnl) : null,
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
            realizedPnl: e.realizedPnl ? Number(e.realizedPnl) : null,
            executedAt: e.executedAt.toISOString(),
          })),
          journal: t.journal
            ? {
                marketContext: t.journal.marketContext,
                entryReason: t.journal.entryReason,
                exitReason: t.journal.exitReason,
                emotionBefore: t.journal.emotionBefore,
                emotionDuring: t.journal.emotionDuring,
                emotionAfter: t.journal.emotionAfter,
                confidence: t.journal.confidence,
                stressLevel: t.journal.stressLevel,
                fomo: t.journal.fomo,
                revenge: t.journal.revenge,
                overtrading: t.journal.overtrading,
                compliant: t.journal.compliant,
                mistakes: t.journal.mistakes,
                lessons: t.journal.lessons,
                improvement: t.journal.improvement,
                tags: t.journal.tags,
                preChecklist: (t.journal.preChecklist ?? null) as Record<string, boolean> | null,
                postChecklist: (t.journal.postChecklist ?? null) as Record<string, boolean> | null,
              }
            : null,
          attachments: t.attachments.map((a) => ({
            id: a.id,
            kind: a.kind,
            fileName: a.fileName,
            createdAt: a.createdAt.toISOString(),
          })),
        }}
      />
    </PageShell>
  );
}
