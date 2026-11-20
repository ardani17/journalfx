"use client";

import { useRouter } from "next/navigation";
import { useId, useRef, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Select, Textarea } from "@/components/ui/field";
import type { TaskActivity } from "@/server/services/tasks";

export type TaskStrategy = { id: string; name: string };

export const statusLabels = {
  PENDING: "Menunggu",
  COMPLETED: "Terlaksana",
  NOT_COMPLETED: "Tidak terlaksana",
} satisfies Record<TaskActivity["status"], string>;

export function useTaskMutation() {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");

  async function save(url: string, method: "POST" | "PATCH" | "PUT" | "DELETE", body?: object) {
    setPending(true);
    setError("");
    try {
      const response = await fetch(url, {
        method,
        ...(body && { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) {
        setError(result.error ?? "Perubahan gagal disimpan");
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError("Tidak dapat menghubungi server. Coba lagi.");
      return false;
    } finally {
      setPending(false);
    }
  }

  return { save, pending, error };
}

export function PlanForm({ date, activity, strategies, onClose }: {
  date: string;
  activity?: TaskActivity;
  strategies: TaskStrategy[];
  onClose: () => void;
}) {
  const id = useId();
  const submissionId = useRef<string>(null);
  const [trading, setTrading] = useState(activity?.kind === "TRADING");
  const { save, pending, error } = useTaskMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const fields = {
      plan: data.get("plan"),
      kind: trading ? "TRADING" : "GENERAL",
      strategyId: data.get("strategyId") || null,
      entryConditions: data.get("entryConditions"),
    };
    if (activity) {
      if (await save(`/api/tasks/${activity.id}`, "PATCH", { section: "plan", ...fields })) onClose();
    } else {
      submissionId.current ??= crypto.randomUUID();
      if (await save("/api/tasks", "POST", { requestId: submissionId.current, date, ...fields })) onClose();
    }
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-panel-2/45 p-3">
      <fieldset disabled={pending} className="space-y-3">
        <Field label="Rencana kegiatan" htmlFor={`${id}-plan`}>
          <Textarea id={`${id}-plan`} name="plan" defaultValue={activity?.plan} required maxLength={2000} rows={2} />
        </Field>
        <Field label="Jenis kegiatan" htmlFor={`${id}-kind`}>
          <Select id={`${id}-kind`} value={trading ? "TRADING" : "GENERAL"} onChange={(event) => setTrading(event.target.value === "TRADING")}>
            <option value="GENERAL">Umum</option>
            <option value="TRADING">Trading</option>
          </Select>
        </Field>
        {trading && (
          <>
            <Field label="Strategi (opsional)" htmlFor={`${id}-strategy`}>
              <Select id={`${id}-strategy`} name="strategyId" defaultValue={activity?.strategy?.id ?? ""}>
                <option value="">Pilih strategi</option>
                {strategies.map((strategy) => <option key={strategy.id} value={strategy.id}>{strategy.name}</option>)}
              </Select>
            </Field>
            <Field label="Kondisi masuk (opsional)" htmlFor={`${id}-entry`}>
              <Textarea id={`${id}-entry`} name="entryConditions" defaultValue={activity?.entryConditions ?? ""} maxLength={2000} rows={2} />
            </Field>
          </>
        )}
      </fieldset>
      <FieldError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
        <Button type="submit" disabled={pending}>Simpan rencana</Button>
      </div>
    </form>
  );
}

export function RealizationForm({ activity, onClose }: { activity: TaskActivity; onClose: () => void }) {
  const id = useId();
  const { save, pending, error } = useTaskMutation();

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    const saved = await save(`/api/tasks/${activity.id}`, "PATCH", {
      section: "realization",
      status: data.get("status"),
      actualNotes: data.get("actualNotes"),
    });
    if (saved) onClose();
  }

  return (
    <form onSubmit={submit} className="space-y-3 rounded-xl border border-line bg-panel-2/45 p-3">
      <fieldset disabled={pending} className="space-y-3">
        <Field label="Status" htmlFor={`${id}-status`}>
          <Select id={`${id}-status`} name="status" defaultValue={activity.status}>
            {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </Select>
        </Field>
        <Field label="Catatan realisasi" htmlFor={`${id}-actual`}>
          <Textarea
            id={`${id}-actual`}
            name="actualNotes"
            defaultValue={activity.actualNotes ?? ""}
            maxLength={2000}
            rows={2}
            aria-describedby={activity.kind === "TRADING" ? `${id}-trading-help` : undefined}
          />
          {activity.kind === "TRADING" && (
            <p id={`${id}-trading-help`} className="text-xs text-muted">
              Pilih Terlaksana jika keputusan untuk tidak membuka posisi sesuai rencana. Catat kondisi yang mendasarinya.
            </p>
          )}
        </Field>
      </fieldset>
      <FieldError message={error} />
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="ghost" onClick={onClose} disabled={pending}>Batal</Button>
        <Button type="submit" disabled={pending}>Simpan realisasi</Button>
      </div>
    </form>
  );
}

export function ReflectionForm({ date, reflection }: { date: string; reflection: string | null }) {
  const id = useId();
  const { save, pending, error } = useTaskMutation();
  const [saved, setSaved] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    setSaved(await save("/api/tasks/reflection", "PUT", { date, reflection: data.get("reflection") }));
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <Field label="Langkah perbaikan" htmlFor={id} error={error}>
        <Textarea
          id={id}
          name="reflection"
          defaultValue={reflection ?? ""}
          maxLength={2000}
          rows={3}
          onChange={() => setSaved(false)}
          disabled={pending}
        />
      </Field>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p role="status" className="text-xs text-primary">{saved ? "Refleksi tersimpan." : ""}</p>
        <Button type="submit" variant="secondary" disabled={pending}>Simpan refleksi</Button>
      </div>
    </form>
  );
}
