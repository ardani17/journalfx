import { randomInt } from "node:crypto";
import { redirect } from "next/navigation";
import { requireUser } from "@/server/auth";
import { getDefaultProject } from "@/server/services/projects";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { calendarDate } from "@/lib/dates";
import { defaultExplorationInput } from "@/lib/finance/exploration-monte-carlo";
import { ExplorationPanel } from "./exploration-panel";

const title = "Simulasi Compounding";
export const metadata = { title };

export default async function SimulatorPage({ searchParams }: {
  searchParams: Promise<{ scenarioId?: string | string[]; mode?: string | string[] }>;
}) {
  const user = await requireUser();
  const { scenarioId, mode } = await searchParams;
  if (scenarioId !== undefined || mode !== undefined) redirect("/simulator");

  const project = await getDefaultProject(user.id);
  const initial = defaultExplorationInput(Number(project.initialCapital), Number(project.targetAmount));
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
      />
    </PageShell>
  );
}
