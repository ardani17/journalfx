import { prisma } from "@/server/db";
import { requireUser } from "@/server/auth";
import { computeBalance } from "@/server/services/ledger";
import { getRiskSettings } from "@/server/services/risk";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { CalculatorClient } from "./calculator-client";

export const metadata = { title: "Kalkulator Position Size" };

export default async function CalculatorPage() {
  const user = await requireUser();
  const [balances, settings, instruments] = await Promise.all([
    computeBalance(user.id),
    getRiskSettings(user.id),
    prisma.instrument.findMany({ orderBy: { symbol: "asc" } }),
  ]);
  return (
    <PageShell>
      <PageHeader
        title="Kalkulator Position Size"
        subtitle="Lot = risiko / (jarak SL × contract size + biaya/lot), dibulatkan ke bawah ke lot step broker"
      />
      <CalculatorClient
        balance={Number(balances.balance.toFixed(2))}
        defaultRiskPct={Number(settings.riskPerTrade)}
        instruments={instruments.map((i) => ({
          symbol: i.symbol,
          contractSize: Number(i.contractSize),
          lotStep: Number(i.lotStep),
          lotMin: Number(i.lotMin),
          lotMax: Number(i.lotMax),
          pricePrecision: i.pricePrecision,
        }))}
      />
    </PageShell>
  );
}
