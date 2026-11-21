import { fmtDateTimeID } from "@/lib/dates";
import { D, fmtNum, fmtUSDdelta, type Decimal } from "@/lib/money";
import type { DailyTradeBreakdown } from "@/server/services/analytics";

export function DailyReviewTrades({ breakdown, timezone, netPnl, liveLedger }: {
  breakdown: DailyTradeBreakdown;
  timezone: string;
  netPnl: Decimal | string;
  liveLedger: boolean;
}) {
  const { trades, additionalPnl } = breakdown;
  const adjustments = [
    { label: "Realisasi trade lain (termasuk penutupan sebagian)", amount: additionalPnl.otherTrades },
    { label: "Biaya akun", amount: additionalPnl.accountFees },
    { label: "P&L tanpa trade terkait", amount: additionalPnl.unlinkedPnl },
  ];

  return (
    <details className="group/trades rounded-[14px] border border-line bg-panel">
      <summary className="cursor-pointer rounded-[14px] px-4 py-3 text-sm font-semibold text-ink hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-primary">
        <span className="group-open/trades:hidden">Tampilkan Daftar Trade</span>
        <span className="hidden group-open/trades:inline">Tutup Daftar Trade</span>
      </summary>
      <div className="space-y-3 border-t border-line px-4 py-3 text-sm">
        {liveLedger ? <p className="text-xs text-muted">Rincian berdasarkan ledger terkini</p> : null}
        <p className="font-semibold">{fmtNum(trades.length, 0)} trade</p>
        {trades.length ? (
          <ul aria-label="Trade selesai" className="divide-y divide-line rounded-lg border border-line">
            {trades.map((trade) => (
              <li key={trade.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2">
                <div className="min-w-0">
                  <p className="wrap-anywhere font-medium">{trade.symbol} · {trade.direction === "LONG" ? "Beli" : "Jual"}</p>
                  {trade.closedAt ? (
                    <time className="text-xs text-muted" dateTime={trade.closedAt}>{fmtDateTimeID(trade.closedAt, timezone)}</time>
                  ) : null}
                </div>
                <span className={`tnum font-medium ${D(trade.netPnl).lt(0) ? "text-loss" : "text-ink"}`}>
                  {fmtUSDdelta(trade.netPnl)}
                </span>
              </li>
            ))}
          </ul>
        ) : <p className="text-muted">Tidak ada trade pada tanggal ini</p>}
        <dl className="space-y-1">
          {adjustments.map(({ label, amount }) => amount !== null ? (
            <div key={label} className="flex items-baseline justify-between gap-4 text-muted">
              <dt>{label}</dt>
              <dd className="tnum shrink-0">{fmtUSDdelta(amount)}</dd>
            </div>
          ) : null)}
          <div className="flex items-baseline justify-between gap-4 border-t border-line pt-2 font-semibold">
            <dt>{liveLedger ? "P&L Neto ledger terkini" : "P&L Neto"}</dt>
            <dd className="tnum shrink-0">{fmtUSDdelta(netPnl)}</dd>
          </div>
        </dl>
      </div>
    </details>
  );
}
