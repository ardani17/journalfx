import Link from "next/link";
import { requireUser } from "@/server/auth";
import { listFinancialTransactions } from "@/server/services/finance";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { StatCard } from "@/components/ui/stat-card";
import { Badge } from "@/components/ui/badge";
import { Table, TableWrap, TBody, TD, THead, TH, TR, EmptyRow } from "@/components/ui/table";
import { D, Decimal, fmtIDR } from "@/lib/money";
import { fmtDateID } from "@/lib/dates";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { CashflowActions } from "./cashflow-actions";
import { ReverseTxButton } from "./reverse-tx-button";

export const metadata = { title: "Arus Kas" };

export default async function CashflowPage() {
  const user = await requireUser();
  const txs = await listFinancialTransactions(user.id);

  let income = new Decimal(0);
  let expense = new Decimal(0);
  for (const t of txs) {
    if (t.reversalOfId) continue;
    if (t.kind === "INCOME") income = income.add(D(t.amount));
    if (t.kind === "EXPENSE") expense = expense.add(D(t.amount));
  }

  return (
    <PageShell>
      <PageHeader
        title="Keuangan Pribadi"
        subtitle="Kelola kebutuhan bulanan, hutang, dan arus kas dari hasil trading"
        actions={
          <nav aria-label="Tab keuangan" className="inline-flex gap-1 rounded-xl border border-line bg-panel-2 p-1">
            <Link href="/expenses" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Kebutuhan Bulanan</Link>
            <Link href="/debts" className="rounded-lg px-3.5 py-1.5 text-xs text-muted hover:text-ink">Hutang</Link>
            <span className="rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-[#06281a]">Arus Kas</span>
          </nav>
        }
      />

      <div className="grid gap-3 sm:grid-cols-3">
        <StatCard label="Total Pemasukan" value={fmtIDR(income)} icon={ArrowDownLeft} tone="primary" />
        <StatCard label="Total Pengeluaran" value={fmtIDR(expense)} icon={ArrowUpRight} tone="loss" />
        <StatCard label="Arus Kas Bersih" value={fmtIDR(income.minus(expense))} icon={ArrowUpRight} tone={income.minus(expense).gte(0) ? "primary" : "loss"} />
      </div>

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">Riwayat Transaksi</h2>
        <CashflowActions />
      </div>

      <TableWrap>
        <Table>
          <THead>
            <TR><TH>Waktu</TH><TH>Jenis</TH><TH>Kategori</TH><TH className="text-right">Jumlah</TH><TH>Keterangan</TH><TH /></TR>
          </THead>
          <TBody>
            {txs.length === 0 ? (
              <EmptyRow colSpan={6}>Belum ada transaksi keuangan pribadi.</EmptyRow>
            ) : (
              txs.map((t) => (
                <TR key={t.id}>
                  <TD className="tnum whitespace-nowrap text-xs">{fmtDateID(t.occurredAt, "d MMM yyyy, HH:mm")}</TD>
                  <TD>
                    {t.kind === "INCOME" ? <Badge tone="success">Pemasukan</Badge>
                      : t.kind === "EXPENSE" ? <Badge tone="danger">Pengeluaran</Badge>
                      : <Badge tone="warn">Pembatalan</Badge>}
                  </TD>
                  <TD className="text-xs text-muted">{t.category?.name ?? (t.debtId ? "Hutang" : t.withdrawalId ? "WD Trading" : "—")}</TD>
                  <TD className={`tnum text-right text-xs font-semibold ${t.kind === "INCOME" || t.kind === "REVERSAL" ? "text-primary" : "text-loss"}`}>
                    {t.kind === "INCOME" || t.kind === "REVERSAL" ? "+" : "−"}{fmtIDR(t.amount)}
                  </TD>
                  <TD className="max-w-56 truncate text-xs text-faint">{t.description ?? "—"}</TD>
                  <TD className="text-right">
                    {(t.kind === "INCOME" || t.kind === "EXPENSE") && !t.reversalOfId ? (
                      <ReverseTxButton id={t.id} />
                    ) : null}
                  </TD>
                </TR>
              ))
            )}
          </TBody>
        </Table>
      </TableWrap>
    </PageShell>
  );
}
