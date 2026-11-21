import { randomInt } from "node:crypto";
import { notFound, redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getJisdorQuote } from "@/server/services/jisdor";
import { getDefaultProject } from "@/server/services/projects";
import { getScenario, listScenarios, savedScenarioParameters } from "@/server/services/scenarios";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { calendarDate } from "@/lib/dates";
import { defaultExplorationInput } from "@/lib/finance/exploration-monte-carlo";
import { ExplorationPanel } from "./exploration-panel";
import { SimulatorClient } from "./simulator-client";

const title = "Simulasi Compounding";
export const metadata = { title };

export default async function SimulatorPage({ searchParams }: {
  searchParams: Promise<{ scenarioId?: string | string[]; mode?: string | string[] }>;
}) {
  const user = await requireUser();
  const { scenarioId, mode } = await searchParams;
  if (scenarioId !== undefined && typeof scenarioId !== "string") notFound();
  if (scenarioId === undefined && mode !== undefined) redirect("/simulator");

  const [project, scenarios, selected, quote] = await Promise.all([
    getDefaultProject(user.id),
    listScenarios(user.id),
    scenarioId === undefined ? null : getScenario(user.id, scenarioId),
    getJisdorQuote(),
  ]);
  if (scenarioId !== undefined && !selected) notFound();

  const initial = defaultExplorationInput(project.initialCapital.toString(), project.targetAmount.toString());
  return (
    <PageShell>
      <PageHeader
        className="[&_h1]:text-[clamp(1.75rem,3vw,2.5rem)] [&_h1]:leading-tight [&_p]:mt-2 [&_p]:text-sm"
        title={title}
        subtitle="Lihat peluang mencapai target saat setiap trade bisa menang atau kalah."
      />
      <ExplorationPanel
        initial={initial}
        initialSeed={randomInt(2 ** 32)}
        initialDate={calendarDate(new Date(), user.timezone).toISOString().slice(0, 10)}
        userId={user.id}
        quote={quote}
      />
      <details key={selected?.id ?? "new"} id="rencana-tersimpan" open={Boolean(selected)} className="scroll-mt-20 rounded-lg border border-line bg-panel">
        <summary className="cursor-pointer px-4 py-3 text-sm font-semibold">Rencana tersimpan dan Monte Carlo lanjutan</summary>
        <div className="min-w-0 space-y-4 px-4 pb-4">
          <SimulatorClient
            defaults={{
              initialCapital: Number(project.initialCapital), targetAmount: Number(project.targetAmount),
              returnPerCycle: 5, frequency: "WEEKLY", wdMode: "DYNAMIC", wdRatio: 50,
            }}
            saved={scenarios.map((scenario) => ({
              id: scenario.id, name: scenario.name, returnPerCycle: Number(scenario.returnPerCycle),
              wdMode: scenario.wdMode, wdRatio: scenario.wdRatio === null ? null : Number(scenario.wdRatio),
            }))}
            selected={selected && { id: selected.id, name: selected.name, ...savedScenarioParameters(selected) }}
          />
        </div>
      </details>
    </PageShell>
  );
}
