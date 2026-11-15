import { requireUser } from "@/server/auth";
import { listScenarios } from "@/server/services/scenarios";
import { getDefaultProject } from "@/server/services/projects";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { SimulatorClient } from "./simulator-client";

export const metadata = { title: "Compounding Plan" };

export default async function SimulatorPage() {
  const user = await requireUser();
  const [project, scenarios] = await Promise.all([
    getDefaultProject(user.id),
    listScenarios(user.id),
  ]);

  return (
    <PageShell>
      <PageHeader
        title="Compounding Plan"
        subtitle="Atur parameter lalu simulasikan target — hasil adalah proyeksi ilustratif, bukan janji imbal hasil."
      />
      <SimulatorClient
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
      />
    </PageShell>
  );
}
