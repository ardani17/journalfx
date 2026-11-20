import Link from "next/link";
import { Bell } from "lucide-react";
import { requireUser } from "@/server/auth";
import { prisma } from "@/server/db";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { fmtDateTimeID } from "@/lib/dates";

export const metadata = { title: "Notifikasi" };
const kindLabel: Record<string, string> = {
  review: "Review", debt: "Utang", risk: "Risiko", milestone: "Pencapaian", wd: "Penarikan", journal: "Jurnal",
};

export default async function NotificationsPage() {
  const user = await requireUser();
  const items = await prisma.notification.findMany({
    where: { userId: user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  return (
    <PageShell>
      <PageHeader
        title="Notifikasi"
        subtitle="Pengingat review, risiko, tonggak pencapaian, penarikan, dan kelengkapan jurnal."
      />
      <Card>
        <CardContent className="p-0">
          {items.length === 0 ? (
            <div className="flex flex-col items-center gap-2 px-6 py-12 text-center">
              <Bell className="h-8 w-8 text-faint" aria-hidden />
              <p className="text-sm text-muted">Belum ada notifikasi</p>
              <p className="text-xs text-faint">
                Notifikasi muncul saat tonggak tercapai, review belum diisi, atau batas risiko terlampaui.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-line-soft">
              {items.map((n) => (
                <li key={n.id} className="flex items-start gap-3 px-4 py-3">
                  <Badge
                    tone={
                      n.severity === "CRITICAL" ? "danger" : n.severity === "WARNING" ? "warn" : "info"
                    }
                  >
                    {kindLabel[n.kind] ?? "Informasi"}
                  </Badge>
                  <div className="min-w-0 flex-1">
                    <p className={`text-sm ${n.readAt ? "text-muted" : "font-semibold text-ink"}`}>
                      {n.title}
                    </p>
                    {n.body ? <p className="mt-0.5 text-xs text-faint">{n.body}</p> : null}
                    <p className="mt-0.5 text-[10px] text-faint">{fmtDateTimeID(n.createdAt, user.timezone)}</p>
                  </div>
                  {n.link ? (
                    <Link href={n.link} className="shrink-0 text-xs text-primary hover:underline">
                      Lihat
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </PageShell>
  );
}
