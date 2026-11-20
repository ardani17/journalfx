import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Field, Input } from "@/components/ui/field";
import { Progress } from "@/components/ui/misc";
import { PageHeader, PageShell } from "@/components/ui/page-header";
import { addUTCDays, calendarDate, fmtCalendarDateID } from "@/lib/dates";
import { taskDateSchema } from "@/lib/validation/tasks";
import { requireUser } from "@/server/auth";
import { listStrategies } from "@/server/services/journal";
import { getTaskDay } from "@/server/services/tasks";
import { ActivityList } from "./activity-list";
import { ReflectionForm } from "./task-forms";

const monthFormatter = new Intl.DateTimeFormat("id-ID", { month: "long", year: "numeric", timeZone: "UTC" });
const percentFormatter = new Intl.NumberFormat("id-ID", { style: "percent", maximumFractionDigits: 1 });

export const metadata = { title: "Task / Jadwal" };

export default async function TasksPage({ searchParams }: { searchParams: Promise<{ date?: string | string[] }> }) {
  const user = await requireUser();
  const wallNow = calendarDate(new Date(), user.timezone);
  const today = wallNow.toISOString().slice(0, 10);
  const tomorrow = addUTCDays(wallNow, 1).toISOString().slice(0, 10);
  const requestedDate = taskDateSchema.safeParse((await searchParams).date ?? today);
  if (!requestedDate.success) redirect("/tasks");
  const date = requestedDate.data;

  const [{ activities, reflection, previousReflection, history }, strategies] = await Promise.all([
    getTaskDay(user.id, date),
    listStrategies(user.id),
  ]);
  const total = activities.length;
  const completed = activities.filter((activity) => activity.status === "COMPLETED").length;
  const completion = total ? completed / total : 0;

  return (
    <PageShell>
      <PageHeader title="Task / Jadwal" />
      <Card className="grid gap-5 p-4 md:grid-cols-2 md:items-center md:p-5">
        <div className="space-y-3">
          <form key={date} action="/tasks" className="flex flex-wrap items-end gap-2">
            <Field label="Tanggal rencana" htmlFor="task-date">
              <Input id="task-date" name="date" type="date" defaultValue={date} required className="[color-scheme:dark]" />
            </Field>
            <Button type="submit" variant="secondary">Lihat</Button>
          </form>
          <nav aria-label="Pintasan tanggal" className="flex gap-2 text-xs">
            <Link className="rounded-md border border-line px-3 py-1.5 text-muted hover:text-ink aria-current:border-primary/50 aria-current:text-primary" href={`/tasks?date=${today}`} aria-current={date === today ? "date" : undefined}>Hari ini</Link>
            <Link className="rounded-md border border-line px-3 py-1.5 text-muted hover:text-ink aria-current:border-primary/50 aria-current:text-primary" href={`/tasks?date=${tomorrow}`} aria-current={date === tomorrow ? "date" : undefined}>Besok</Link>
          </nav>
        </div>
        <section className="min-w-0 rounded-xl border border-line bg-panel-2/60 p-4" aria-labelledby="completion-heading">
          <h2 id="completion-heading" className="text-xs font-medium text-muted">Keterlaksanaan harian</h2>
          {total ? (
            <>
              <div className="my-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                <p className="tnum text-2xl font-bold text-primary">{percentFormatter.format(completion)}</p>
                <p className="text-xs text-muted">{completed} dari {total} kegiatan terlaksana</p>
              </div>
              <Progress value={completion * 100} label="Persentase keterlaksanaan" className="h-1.5" />
            </>
          ) : <p className="mt-2 text-sm font-medium text-ink">Belum ada rencana</p>}
        </section>
      </Card>
      {previousReflection && (
        <aside className="flex min-w-0 gap-3 rounded-xl border border-primary/30 bg-primary/5 p-4" aria-labelledby="previous-reflection-heading">
          <CalendarDays className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden />
          <div className="min-w-0">
            <h2 id="previous-reflection-heading" className="text-sm font-semibold text-ink">Langkah dari hari sebelumnya</h2>
            <p className="mt-1 whitespace-pre-wrap text-sm text-muted [overflow-wrap:anywhere]">{previousReflection}</p>
          </div>
        </aside>
      )}
      <div className="grid items-start gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(17rem,22rem)]">
        <ActivityList
          key={date}
          date={date}
          activities={activities}
          strategies={strategies.map(({ id, name }) => ({ id, name }))}
        />
        <div className="flex min-w-0 flex-col gap-4">
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-ink">1% lebih produktif setiap hari</h2>
              <p className="text-xs text-muted">Pilih satu langkah kecil yang akan kamu lakukan besok.</p>
            </CardHeader>
            <CardContent>
              <ReflectionForm key={date} date={date} reflection={reflection} />
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <h2 className="text-sm font-semibold text-ink">Riwayat rencana</h2>
              <p className="text-xs text-muted">{monthFormatter.format(new Date(date))}</p>
            </CardHeader>
            <CardContent>
              {history.length ? (
                <ul className="divide-y divide-line">
                  {history.map((entry) => (
                    <li key={entry.date}>
                      <Link
                        className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 rounded-md px-2 py-2.5 text-sm text-ink hover:bg-panel-2 aria-current:bg-panel-2 aria-current:text-primary"
                        href={`/tasks?date=${entry.date}`}
                        aria-current={date === entry.date ? "date" : undefined}
                      >
                        <time dateTime={entry.date}>{fmtCalendarDateID(entry.date)}</time>
                        <span className="text-xs text-muted">{entry.count ? `${entry.count} kegiatan` : "Refleksi"}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : <p className="py-2 text-sm text-muted">Belum ada riwayat bulan ini.</p>}
            </CardContent>
          </Card>
        </div>
      </div>
    </PageShell>
  );
}
