"use client";

import { useState } from "react";
import { Plus } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { FieldError } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";
import { fmtCalendarDateID } from "@/lib/dates";
import type { TaskActivity } from "@/server/services/tasks";
import { PlanForm, RealizationForm, statusLabels, useTaskMutation, type TaskStrategy } from "./task-forms";

const statusTones = { PENDING: "neutral", COMPLETED: "success", NOT_COMPLETED: "danger" } as const;

export function ActivityList({ date, activities, strategies }: {
  date: string;
  activities: TaskActivity[];
  strategies: TaskStrategy[];
}) {
  const [adding, setAdding] = useState(false);

  return (
    <Card className="min-w-0">
      <CardHeader className="flex-row flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-ink">Rencana kegiatan</h2>
          <time dateTime={date} className="text-xs text-muted">{fmtCalendarDateID(date)}</time>
        </div>
        {!adding && (
          <Button onClick={() => setAdding(true)}>
            <Plus className="h-4 w-4" aria-hidden /> Tambah kegiatan
          </Button>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {adding && <PlanForm date={date} strategies={strategies} onClose={() => setAdding(false)} />}
        {activities.length > 0 && (
          <ul className="divide-y divide-line">
            {activities.map((activity) => (
              <ActivityRow key={activity.id} date={date} activity={activity} strategies={strategies} />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function ActivityRow({ date, activity, strategies }: {
  date: string;
  activity: TaskActivity;
  strategies: TaskStrategy[];
}) {
  const [mode, setMode] = useState<"edit" | "realization" | "delete" | null>(null);
  const close = () => setMode(null);

  return (
    <li className="min-w-0 space-y-3 py-4">
      <div className="flex flex-wrap items-center gap-2">
        <Badge tone={statusTones[activity.status]}>{statusLabels[activity.status]}</Badge>
        {activity.kind === "TRADING" && <Badge tone="purple">Trading</Badge>}
      </div>
      <p className="whitespace-pre-wrap text-sm font-medium text-ink [overflow-wrap:anywhere]">{activity.plan}</p>
      {(activity.strategy || activity.entryConditions || activity.actualNotes) && (
        <dl className="space-y-2 text-xs [overflow-wrap:anywhere]">
          {activity.strategy && <ActivityDetail label="Strategi" text={activity.strategy.name} />}
          {activity.entryConditions && <ActivityDetail label="Kondisi masuk" text={activity.entryConditions} />}
          {activity.actualNotes && <ActivityDetail label="Realisasi" text={activity.actualNotes} />}
        </dl>
      )}
      {mode === "edit" && <PlanForm date={date} activity={activity} strategies={strategies} onClose={close} />}
      {mode === "realization" && <RealizationForm activity={activity} onClose={close} />}
      {(mode === null || mode === "delete") && (
        <div className="flex flex-wrap items-center gap-1">
          <Button variant="secondary" size="sm" onClick={() => setMode("realization")}>Catat realisasi</Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("edit")}>Edit rencana</Button>
          <Button variant="ghost" size="sm" onClick={() => setMode("delete")}>Hapus</Button>
        </div>
      )}
      {mode === "delete" && <DeleteActivityDialog id={activity.id} onClose={close} />}
    </li>
  );
}

function ActivityDetail({ label, text }: { label: string; text: string }) {
  return (
    <div>
      <dt className="font-semibold text-muted">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-ink">{text}</dd>
    </div>
  );
}

function DeleteActivityDialog({ id, onClose }: { id: string; onClose: () => void }) {
  const { save, pending, error } = useTaskMutation();
  return (
    <Dialog open={true} dismissible={!pending} onClose={onClose} title="Hapus kegiatan?">
      <p className="mb-3 text-sm text-muted">Rencana dan catatan realisasi kegiatan ini akan dihapus.</p>
      <FieldError message={error} />
      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <Button variant="ghost" disabled={pending} onClick={onClose}>Batal</Button>
        <Button variant="danger" disabled={pending} onClick={async () => {
          if (await save(`/api/tasks/${id}`, "DELETE")) onClose();
        }}>Hapus kegiatan</Button>
      </div>
    </Dialog>
  );
}
