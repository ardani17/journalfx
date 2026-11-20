import Link from "next/link";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { listTrades } from "@/server/services/trades";
import { coreMetrics } from "@/server/services/analytics";
import { listAccounts } from "@/server/services/accounts";
import { listStrategies } from "@/server/services/journal";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import {
  EmptyRow,
  Table,
  TableWrap,
  TBody,
  TD,
  THead,
  TH,
  TR,
} from "@/components/ui/table";
import { JournalToolbar } from "./journal-toolbar";
import { getJournalPageSize, journalDateRange, journalHref } from "./journal-query";
import { D, fmtDecimal, fmtNum, fmtTradingDelta } from "@/lib/money";
import { listTradesQuery } from "@/lib/validation/trades";
import { tradeDirectionLabel, tradeStatusLabel } from "@/lib/trading-labels";
import { BarChart3, BookOpen, Percent, TrendingUp } from "lucide-react";

export const metadata = { title: "Jurnal Trading" };

function PageLink({ href, children }: { href?: string; children: string }) {
  const className = "inline-flex h-10 items-center rounded-lg border border-line bg-panel px-3 text-xs text-ink";

  return href ? (
    <Link href={href} className={`${className} hover:bg-panel-2 focus-visible:outline-2 focus-visible:outline-primary`}>
      {children}
    </Link>
  ) : (
    <button type="button" disabled className={`${className} opacity-50`}>{children}</button>
  );
}

export default async function JournalPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const user = await requireUser();
  const sp = await searchParams;
  const filters = {
    status: listTradesQuery.shape.status.safeParse(sp.status).data,
    result: listTradesQuery.shape.result.safeParse(sp.result).data,
    strategyId: typeof sp.strategyId === "string" ? sp.strategyId : undefined,
    accountId: typeof sp.accountId === "string" ? sp.accountId : undefined,
    sort: listTradesQuery.shape.sort.safeParse(sp.sort).data,
    dateFrom: typeof sp.dateFrom === "string" ? sp.dateFrom : undefined,
    dateTo: typeof sp.dateTo === "string" ? sp.dateTo : undefined,
  };
  const rangeFilter = journalDateRange(filters.dateFrom, filters.dateTo, user.timezone);
  const hasDateRange = Boolean(rangeFilter.from || rangeFilter.to);
  const tradeFilters = { ...filters, from: rangeFilter.from, to: rangeFilter.to };
  const dateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "medium", timeZone: user.timezone });
  const pageSize = getJournalPageSize(sp.pageSize);
  const requestedPage = typeof sp.page === "string" && /^[1-9]\d*$/.test(sp.page) ? Number(sp.page) : 1;
  const page = Number.isSafeInteger((requestedPage - 1) * pageSize) ? requestedPage : 1;
  const offset = (page - 1) * pageSize;
  const [{ items, total }, metrics, accounts, strategies] = await Promise.all([
    listTrades(user.id, { ...tradeFilters, limit: pageSize, offset }, { includeJournalCompletion: true }),
    coreMetrics(user.id, { accountId: filters.accountId, journal: hasDateRange ? tradeFilters : undefined }),
    listAccounts(user.id),
    listStrategies(user.id),
  ]);
  if (page > 1 && offset >= total) redirect(journalHref(filters, 1, pageSize));

  const range = items.length ? `${fmtNum(offset + 1, 0)}–${fmtNum(offset + items.length, 0)}` : "0";
  const summaryCurrency = accounts.find((account) => account.id === filters.accountId)?.currency ?? "USD";

  return (
    <PageShell>
      <PageHeader
        title="Jurnal Trading"
        subtitle="Catat, evaluasi, dan tingkatkan performa trading Anda"
      />

      <JournalToolbar
        accounts={accounts.map(({ id, name, isActive, currency }) => ({ id, name, isActive, currency }))}
        strategies={strategies.map((s) => ({ id: s.id, name: s.name }))}
        active={filters}
        pageSize={pageSize}
        dateError={rangeFilter.error}
      />

      {/* KPI strip */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total Transaksi" value={fmtNum(metrics.totalTrades, 0)} icon={BookOpen} />
        <StatCard
          label="Tingkat Kemenangan"
          value={metrics.winRate !== null ? `${fmtNum(metrics.winRate, 1)}%` : "N/A"}
          tone="primary"
          icon={Percent}
          sub={`${metrics.wins}W / ${metrics.losses}L${metrics.breakEven ? ` / ${metrics.breakEven}BE` : ""}`}
        />
        <StatCard
          label="P&L Neto"
          value={fmtTradingDelta(metrics.netPnl, summaryCurrency)}
          tone={metrics.netPnl.isPositive() ? "primary" : "loss"}
          icon={TrendingUp}
        />
        <StatCard
          label="Rata-rata R"
          value={metrics.avgR !== null ? `${metrics.avgR >= 0 ? "+" : ""}${fmtNum(metrics.avgR, 2)}R` : "N/A"}
          tone="indigo"
          icon={BarChart3}
        />
      </div>
      {metrics.sampleWarning && metrics.totalTrades > 0 ? (
        <p className="rounded-lg border border-warn/30 bg-warn/10 px-3 py-2 text-xs text-warn" role="status">
          Sampel kecil ({metrics.totalTrades} &lt; 30 transaksi). Metrik belum signifikan secara statistik.
        </p>
      ) : null}

      {/* Trades table */}
      <TableWrap>
        <Table>
          <THead>
            <TR>
              <TH aria-sort={filters.sort === "asc" ? "ascending" : "descending"}>Tanggal</TH>
              <TH>Instrumen</TH>
              <TH>Arah</TH>
              <TH className="text-right">Lot</TH>
              <TH className="text-right">Pembukaan</TH>
              <TH className="text-right">Penutupan</TH>
              <TH className="text-right">R</TH>
              <TH className="text-right">P/L</TH>
              <TH>Strategi</TH>
              <TH>Psikologi dan Jurnal</TH>
            </TR>
          </THead>
          <TBody>
            {items.length === 0 ? (
              <EmptyRow colSpan={10}>
                {hasDateRange ? "Tidak ada transaksi pada periode tersebut." : Object.values(filters).some(Boolean)
                  ? "Tidak ada transaksi yang cocok dengan filter."
                  : "Belum ada transaksi. Pilih “Tambah Transaksi” untuk mencatat posisi pertama Anda."}
              </EmptyRow>
            ) : (
              items.map((t) => {
                const pnl = t.realizedPnl !== null ? D(t.realizedPnl) : null;
                const entryDate = dateFormatter.format(t.entryAt);
                return (
                  <TR key={t.id} className="relative hover:bg-panel-2/80 focus-within:bg-panel-2/80">
                    <TD className="tnum whitespace-nowrap text-xs">
                      <Link
                        href={`/journal/${t.id}`}
                        aria-label={`Lihat transaksi ${t.instrument.symbol}, ${entryDate}`}
                        className="after:absolute after:inset-0 after:cursor-pointer hover:text-primary focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary"
                      >
                        {entryDate}
                      </Link>
                    </TD>
                    <TD className="text-xs font-medium">{t.instrument.symbol}</TD>
                    <TD>
                      <Badge tone={t.direction === "LONG" ? "buy" : "sell"}>
                        {tradeDirectionLabel[t.direction]}
                      </Badge>
                    </TD>
                    <TD className="tnum text-right text-xs">{fmtDecimal(t.lot)}</TD>
                    <TD className="tnum text-right text-xs">{fmtDecimal(t.entryPrice, t.instrument.pricePrecision)}</TD>
                    <TD className="tnum text-right text-xs">
                      {t.exitPrice ? (
                        fmtDecimal(t.exitPrice, t.instrument.pricePrecision)
                      ) : (
                        <Badge tone={t.status === "OPEN" ? "info" : "neutral"}>{tradeStatusLabel[t.status]}</Badge>
                      )}
                    </TD>
                    <TD className="tnum text-right text-xs">
                      {t.actualR !== null ? `${D(t.actualR).gte(0) ? "+" : ""}${fmtNum(D(t.actualR), 1)}R` : "—"}
                    </TD>
                    <TD
                      className={`tnum text-right font-semibold ${
                        pnl === null
                          ? "text-faint"
                          : pnl.isPositive()
                            ? "text-primary"
                            : pnl.isNegative()
                              ? "text-loss"
                              : "text-muted"
                      }`}
                    >
                      {pnl === null ? "—" : fmtTradingDelta(pnl, t.account.currency)}
                    </TD>
                    <TD className="text-xs text-muted">{t.strategy?.name ?? "—"}</TD>
                    <TD>
                      <Badge tone={t.journalComplete ? "success" : "neutral"}>
                        {t.journalComplete ? "Sudah diisi" : "Belum diisi"}
                      </Badge>
                    </TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </TableWrap>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="tnum text-xs text-muted" aria-live="polite">
          Menampilkan {range} dari {fmtNum(total, 0)} transaksi
        </p>
        <nav aria-label="Paginasi jurnal" className="flex flex-wrap gap-2">
          <PageLink href={page > 1 ? journalHref(filters, page - 1, pageSize) : undefined}>
            Sebelumnya
          </PageLink>
          <PageLink href={offset + pageSize < total ? journalHref(filters, page + 1, pageSize) : undefined}>
            Berikutnya
          </PageLink>
        </nav>
      </div>
    </PageShell>
  );
}
