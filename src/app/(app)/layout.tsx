import { redirect } from "next/navigation";
import { getSessionUser } from "@/server/auth";
import { getDefaultProject } from "@/server/services/projects";
import { computeBalance } from "@/server/services/ledger";
import { prisma } from "@/server/db";
import { Sidebar } from "@/components/layout/sidebar";
import { Header, MobileBottomNav } from "@/components/layout/header";
import { AppProviders, UnreadProvider } from "@/components/providers";
import { D, fmtNum } from "@/lib/money";
import { calendarDate } from "@/lib/dates";

const headerDateFormatter = new Intl.DateTimeFormat("id-ID", { dateStyle: "long", timeZone: "UTC" });

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await getSessionUser();
  if (!user) redirect("/login");

  const [project, balances, unread] = await Promise.all([
    getDefaultProject(user.id),
    computeBalance(user.id),
    prisma.notification.count({ where: { userId: user.id, readAt: null } }),
  ]);
  const dateLabel = headerDateFormatter.format(calendarDate(new Date(), user.timezone));

  const target = D(project.targetAmount);
  const progressPct = target.isZero()
    ? 0
    : Math.min(100, Number(balances.balance.div(target).times(100).toFixed(4)));
  const progressLabel = fmtNum(progressPct < 0.01 && progressPct > 0 ? 0.01 : progressPct, progressPct < 0.1 ? 2 : 1);

  return (
    <AppProviders>
      <UnreadProvider count={unread}>
        <div className="min-h-screen bg-bg">
          <Sidebar progressPct={progressPct} progressLabel={`${progressLabel}%`} />
          <div className="flex min-h-screen flex-col lg:pl-[clamp(220px,21vw,300px)]">
            <Header
              user={{ name: user.name, email: user.email }}
              dateLabel={dateLabel}
              progressPct={progressPct}
              progressLabel={`${progressLabel}%`}
            />
            <main className="flex-1 px-4 pb-24 pt-4 md:px-6 lg:px-8 lg:pb-10">{children}</main>
          </div>
          <MobileBottomNav />
        </div>
      </UnreadProvider>
    </AppProviders>
  );
}
