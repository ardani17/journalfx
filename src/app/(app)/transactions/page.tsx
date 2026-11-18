import { requireUser } from "@/server/auth";
import { listAccounts } from "@/server/services/accounts";
import { listTransactions } from "@/server/services/ledger";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { TransactionsClient } from "./transactions-client";

export const metadata = { title: "Transaksi Ledger" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; accountId?: string }>;
}) {
  const user = await requireUser();
  const { type, accountId } = await searchParams;
  const accounts = await listAccounts(user.id);
  const filter = {
    ...(type ? { type: type as never } : {}),
    ...(accountId ? { accountId } : {}),
    limit: 100,
  };
  const { items, total } = await listTransactions(user.id, filter);

  return (
    <PageShell>
      <PageHeader
        title="Transaksi Ledger"
        subtitle="Sumber kebenaran saldo: deposit, withdrawal, P&L realisasi, dan adjustment."
      />
      <TransactionsClient
        accounts={accounts.map((a) => ({ id: a.id, name: a.name }))}
        rows={items.map((t) => ({
          id: t.id,
          accountId: t.accountId,
          accountName: t.account.name,
          type: t.type,
          amount: Number(t.amount),
          occurredAt: t.occurredAt.toISOString(),
          note: t.note,
          mt5DealId: t.mt5DealId,
          reversalOfId: t.reversalOfId,
        }))}
        total={total}
        activeType={type ?? ""}
        activeAccountId={accountId ?? ""}
      />
    </PageShell>
  );
}
