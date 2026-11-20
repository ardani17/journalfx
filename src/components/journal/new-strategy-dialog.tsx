"use client";

import { useId, useState, type FormEvent } from "react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";
import { Dialog } from "@/components/ui/misc";

export type StrategyOption = { id: string; name: string };

export function NewStrategyDialog({ onClose, onCreated }: {
  onClose: () => void;
  onCreated: (strategy: StrategyOption) => void;
}) {
  const inputId = useId();
  const [draftName, setDraftName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving) return;
    const name = draftName.trim();
    if (name.length < 2) {
      setError("Nama strategi minimal 2 karakter");
      return;
    }

    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/strategies", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Gagal menambah strategi");
        return;
      }
      onCreated({ id: body.data.id, name: body.data.name });
      onClose();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open={true} onClose={onClose} title="Tambah strategi" dismissible={!saving}>
      <form onSubmit={submit} className="space-y-3">
        <Field label="Nama strategi" htmlFor={inputId}>
          <Input
            id={inputId}
            value={draftName}
            onChange={(event) => { setDraftName(event.target.value); setError(null); }}
            maxLength={60}
            autoFocus
            readOnly={saving}
            aria-required="true"
            aria-invalid={Boolean(error)}
            aria-describedby={error ? `${inputId}-error` : undefined}
          />
          {error && <p id={`${inputId}-error`} className="text-xs text-loss" role="alert">{error}</p>}
        </Field>
        <div className="flex justify-end gap-2">
          <Button variant="secondary" disabled={saving} onClick={onClose}>Batal</Button>
          <Button type="submit" disabled={saving}>{saving ? "Menyimpan…" : "Simpan strategi"}</Button>
        </div>
      </form>
    </Dialog>
  );
}
