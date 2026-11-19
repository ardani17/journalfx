import { requireUser } from "@/server/auth";
import { getDefaultProject } from "@/server/services/projects";
import { listAccounts } from "@/server/services/accounts";
import { mt5SyncStatus } from "@/server/services/mt5-sync";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { SettingsClient } from "./settings-client";
import { Mt5SyncSection } from "./mt5-sync-section";
import { NotifyChannelSection } from "./notify-channel-section";
import { channelConfig } from "@/server/services/notify-channels";

export const metadata = { title: "Pengaturan" };

export default async function SettingsPage() {
  const user = await requireUser();
  const [project, accounts, syncStatus, channels] = await Promise.all([
    getDefaultProject(user.id),
    listAccounts(user.id),
    mt5SyncStatus(user.id),
    channelConfig(user.id),
  ]);
  return (
    <PageShell>
      <PageHeader title="Pengaturan" subtitle="Profil, preferensi tampilan, integrasi, dan konfigurasi project." />
      <SettingsClient
        user={{ name: user.name, email: user.email, timezone: user.timezone, locale: user.locale }}
        project={{
          name: project.name,
          targetAmount: Number(project.targetAmount),
          initialCapital: Number(project.initialCapital),
        }}
      />
      <Mt5SyncSection
        accounts={accounts.filter((a) => a.isActive).map(({ id, name, currency }) => ({ id, name, currency }))}
        status={{
          lastSyncAt: syncStatus.lastSyncAt?.toISOString() ?? null,
          lastSyncResult: syncStatus.lastSyncResult,
          stale: syncStatus.stale,
          staleHours: syncStatus.staleHours,
        }}
      />
      <NotifyChannelSection initial={channels} />
    </PageShell>
  );
}
