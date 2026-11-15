import { requireUser } from "@/server/auth";
import { getDefaultProject } from "@/server/services/projects";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { SettingsClient } from "./settings-client";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const user = await requireUser();
  const project = await getDefaultProject(user.id);
  return (
    <PageShell>
      <PageHeader title="Pengaturan" subtitle="Profil, preferensi tampilan, dan konfigurasi project." />
      <SettingsClient
        user={{ name: user.name, email: user.email, timezone: user.timezone, locale: user.locale }}
        project={{
          name: project.name,
          targetAmount: Number(project.targetAmount),
          initialCapital: Number(project.initialCapital),
        }}
      />
    </PageShell>
  );
}
