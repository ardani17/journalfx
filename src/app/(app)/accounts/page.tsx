import { requireUser } from "@/server/auth";
import { listAccounts } from "@/server/services/accounts";
import { computeBalance } from "@/server/services/ledger";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtUSD } from "@/lib/money";

import { AccountsClient } from "./accounts-client";

export const metadata = { title: "Akun Trading" };

export default async function AccountsPage() {
  const user = await requireUser();
  const accounts = await listAccounts(user.id);
  const withBalance = await Promise.all(
    accounts.map(async (a) => ({
      ...a,
      balance: await computeBalance(user.id, a.id),
    })),
  );

  return (
    <PageShell>
      <PageHeader
        title="Akun Trading"
        subtitle="Kelola akun broker dan sumber dana. Semua perubahan saldo tercatat di ledger."
        actions={<AccountsClient />}
      />

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {withBalance.map((a) => (
          <Card key={a.id} className="panel-gradient">
            <CardContent className="flex flex-col gap-3 p-4">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-sm font-semibold">{a.name}</p>
                  <p className="text-xs text-faint">
                    {[a.broker, a.accountNumber].filter(Boolean).join(" · ") || "Tanpa broker"}
                  </p>
                </div>
                {a.isActive ? (
                  <Badge tone="success">Aktif</Badge>
                ) : (
                  <Badge tone="neutral">Nonaktif</Badge>
                )}
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <Metric label="Balance" value={fmtUSD(a.balance.balance)} strong />
                <Metric label="Deposit" value={fmtUSD(a.balance.deposits)} />
                <Metric label="P&L Realisasi" value={fmtUSD(a.balance.realizedPnl)} />
                <Metric label="Withdrawal" value={fmtUSD(a.balance.withdrawals)} />
              </div>
              {a.notes ? <p className="text-[11px] text-faint">{a.notes}</p> : null}
            </CardContent>
          </Card>
        ))}
        {accounts.length === 0 ? (
          <Card className="md:col-span-2 xl:col-span-3">
            <CardContent className="py-10 text-center text-sm text-faint">
              Belum ada akun trading. Tambahkan akun pertama Anda.
            </CardContent>
          </Card>
        ) : null}
      </div>
    </PageShell>
  );
}

function Metric({ label, value, strong }: { label: string; value: string; strong?: boolean }) {
  return (
    <div className="rounded-lg border border-line-soft bg-panel-2/50 px-2.5 py-2">
      <p className="text-[10px] text-faint">{label}</p>
      <p className={`tnum ${strong ? "text-sm font-bold text-primary" : "text-xs text-ink"}`}>{value}</p>
    </div>
  );
}
