import { notFound } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getScenario, listScenarios, savedScenarioParameters } from "@/server/services/scenarios";
import { getDefaultProject } from "@/server/services/projects";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { SimulatorClient } from "./simulator-client";
import { parseMonteCarloEquity } from "@/lib/finance/trading-capital";

export const metadata = { title: "Simulasi Pemajemukan" };

export default async function SimulatorPage({ searchParams }: {
  searchParams: Promise<{ scenarioId?: string | string[]; monteCarloEquity?: string | string[] }>;
}) {
  const user = await requireUser();
  const { scenarioId, monteCarloEquity } = await searchParams;
  if (scenarioId !== undefined && typeof scenarioId !== "string") notFound();
  const [project, scenarios, selected] = await Promise.all([
    getDefaultProject(user.id),
    listScenarios(user.id),
    typeof scenarioId === "string" ? getScenario(user.id, scenarioId) : null,
  ]);
  if (scenarioId !== undefined && !selected) notFound();

  return (
    <PageShell>
      <PageHeader
        title="Simulasi Pemajemukan"
        subtitle="Atur parameter lalu simulasikan target — hasil adalah proyeksi ilustratif, bukan janji imbal hasil."
      />
      <SimulatorClient
        key={selected?.id ?? "new"}
        defaults={{
          initialCapital: Number(project.initialCapital),
          targetAmount: Number(project.targetAmount),
          returnPerCycle: 5,
          frequency: "WEEKLY",
          wdMode: "DYNAMIC",
          wdRatio: 50,
        }}
        saved={scenarios.map((s) => ({
          id: s.id,
          name: s.name,
          returnPerCycle: Number(s.returnPerCycle),
          wdMode: s.wdMode,
          wdRatio: s.wdRatio ? Number(s.wdRatio) : null,
        }))}
        selected={selected && { id: selected.id, name: selected.name, ...savedScenarioParameters(selected) }}
        monteCarloEquity={parseMonteCarloEquity(monteCarloEquity)}
      />
    </PageShell>
  );
}
