"use client";

import { useId, useState, type FormEvent } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Field, FieldError, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";
import type { TaskActivityType } from "@/server/services/task-types";
import { useTaskMutation } from "./task-forms";

export function ActivityTypeManager({ types, onClose }: {
  types: TaskActivityType[];
  onClose: () => void;
}) {
  const inputId = useId();
  const { save, pending, error } = useTaskMutation();
  const [action, setAction] = useState<{ id: string; mode: "rename" | "delete" } | null>(null);
  const [name, setName] = useState("");
  const [trading, setTrading] = useState(false);

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (await save("/api/tasks/types", "POST", { name, kind: trading ? "TRADING" : "GENERAL" })) {
      setName("");
      setTrading(false);
    }
  }

  async function rename(event: FormEvent<HTMLFormElement>, id: string) {
    event.preventDefault();
    const name = new FormData(event.currentTarget).get("name");
    if (await save(`/api/tasks/types/${encodeURIComponent(id)}`, "PATCH", { name })) setAction(null);
  }

  async function remove(id: string) {
    if (await save(`/api/tasks/types/${encodeURIComponent(id)}`, "DELETE")) setAction(null);
  }

  return (
    <Dialog open={true} onClose={onClose} title="Kelola jenis kegiatan" dismissible={!pending}>
      <div className="max-h-[72dvh] space-y-4 overflow-y-auto">
        <FieldError message={error} />
        {types.length ? (
          <ul className="divide-y divide-line">
            {types.map((type) => (
              <li key={type.id} className="space-y-2 py-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="min-w-0 space-y-1">
                    <p className="text-sm text-ink [overflow-wrap:anywhere]">{type.name}</p>
                    {type.kind === "TRADING" && <Badge tone="purple">Strategi trading</Badge>}
                  </div>
                  {action?.id !== type.id && (
                    <div className="flex gap-1">
                      <Button size="sm" variant="secondary" disabled={pending} onClick={() => setAction({ id: type.id, mode: "rename" })}>Ubah nama</Button>
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAction({ id: type.id, mode: "delete" })}>Hapus jenis</Button>
                    </div>
                  )}
                </div>
                {action?.id === type.id && action.mode === "rename" && (
                  <form className="space-y-2" onSubmit={(event) => rename(event, type.id)}>
                    <Field label="Nama baru" htmlFor={`${inputId}-rename`}>
                      <Input id={`${inputId}-rename`} name="name" defaultValue={type.name} maxLength={60} required disabled={pending} />
                    </Field>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAction(null)}>Batal</Button>
                      <Button size="sm" type="submit" disabled={pending}>Simpan nama</Button>
                    </div>
                  </form>
                )}
                {action?.id === type.id && action.mode === "delete" && (
                  <div className="space-y-2">
                    <p className="text-xs text-muted">Jenis ini akan hilang dari pilihan baru. Kegiatan lama tetap tersimpan.</p>
                    <div className="flex flex-wrap justify-end gap-2">
                      <Button size="sm" variant="ghost" disabled={pending} onClick={() => setAction(null)}>Batal</Button>
                      <Button size="sm" variant="danger" disabled={pending} onClick={() => remove(type.id)}>Konfirmasi hapus jenis</Button>
                    </div>
                  </div>
                )}
              </li>
            ))}
          </ul>
        ) : <p className="text-sm text-muted">Belum ada jenis kegiatan.</p>}
        <form className="space-y-3 border-t border-line pt-3" onSubmit={add}>
          <Field label="Nama jenis baru" htmlFor={inputId}>
            <Input
              id={inputId}
              value={name}
              onChange={(event) => setName(event.target.value)}
              maxLength={60}
              required
              disabled={pending}
            />
          </Field>
          <label className="flex items-center gap-2 text-sm text-muted">
            <input
              type="checkbox"
              checked={trading}
              onChange={(event) => setTrading(event.target.checked)}
              disabled={pending}
              className="h-4 w-4 accent-primary"
            />
            Gunakan strategi trading
          </label>
          <div className="flex justify-end">
            <Button type="submit" disabled={pending}>Tambah jenis</Button>
          </div>
        </form>
      </div>
    </Dialog>
  );
}
