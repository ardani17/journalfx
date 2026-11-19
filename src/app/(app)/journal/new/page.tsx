import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { listAccounts } from "@/server/services/accounts";
import { listStrategies } from "@/server/services/journal";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { NewTradeForm } from "./new-trade-form";

export const metadata = { title: "Trade Baru" };

export default async function NewTradePage() {
  const user = await requireUser();
  const [accounts, strategies, instruments] = await Promise.all([
    listAccounts(user.id),
    listStrategies(user.id),
    prisma.instrument.findMany({
      where: { OR: [{ ownerId: null }, { ownerId: user.id }] },
      orderBy: { symbol: "asc" },
    }),
  ]);

  return (
    <PageShell>
      <PageHeader title="Trade Baru" subtitle="Catat posisi lengkap dengan konteks dan psikologi pra-trade" />
      <NewTradeForm
        accounts={accounts.filter((a) => a.isActive).map(({ id, name, currency }) => ({ id, name, currency }))}
        strategies={strategies.map((s) => ({ id: s.id, name: s.name }))}
        instruments={instruments.map((i) => ({
          id: i.id,
          symbol: i.symbol,
          pricePrecision: i.pricePrecision,
        }))}
      />
    </PageShell>
  );
}
