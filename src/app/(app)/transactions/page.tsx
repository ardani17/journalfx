import { requireUser } from "@/server/auth";
import { listAccounts } from "@/server/services/accounts";
import { listTransactionsQuery } from "@/lib/validation/ledger";
import { canReverseLedgerEntry, listTransactions } from "@/server/services/ledger";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { TransactionsClient } from "./transactions-client";

export const metadata = { title: "Transaksi Ledger" };

export default async function TransactionsPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; accountId?: string }>;
}) {
  const [user, params] = await Promise.all([requireUser(), searchParams]);
  const parsedType = listTransactionsQuery.shape.type.safeParse(params.type);
  const type = parsedType.success ? parsedType.data : undefined;
  const accountId = typeof params.accountId === "string" ? params.accountId : undefined;
  const [accounts, { items, total }] = await Promise.all([
    listAccounts(user.id),
    listTransactions(user.id, { type, accountId, limit: 100 }),
  ]);

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
          canReverse: t.reversals.length === 0 && canReverseLedgerEntry(t),
        }))}
        total={total}
        activeType={type ?? ""}
        activeAccountId={accountId ?? ""}
      />
    </PageShell>
  );
}
