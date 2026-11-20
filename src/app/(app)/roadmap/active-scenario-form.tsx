"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Field, Select } from "@/components/ui/field";

interface ScenarioOption {
  id: string;
  name: string;
}

export function ActiveScenarioForm({ active, options }: { active: ScenarioOption | null; options: ScenarioOption[] }) {
  const router = useRouter();
  const [selection, setSelection] = useState(active?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [refreshing, startRefresh] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function apply(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSaving(true);
    try {
      const response = await fetch("/api/roadmap", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ scenarioId: selection || null }),
      });
      const body = await response.json();
      if (!response.ok || !body.ok) {
        setError(body.error ?? "Gagal menerapkan skenario");
        return;
      }
      startRefresh(() => router.refresh());
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setSaving(false);
    }
  }

  const pending = saving || refreshing;
  return (
    <Card>
      <CardContent className="space-y-3 p-4">
        <p className="text-xs text-muted">Rencana aktif <strong className="ml-1 text-ink">{active?.name ?? "Pengaturan project"}</strong></p>
        <form onSubmit={apply} className="flex flex-wrap items-end gap-3">
          <Field label="Skenario Pemajemukan" htmlFor="roadmap-scenario" className="w-full sm:w-auto sm:min-w-56">
            <Select id="roadmap-scenario" value={selection} disabled={pending}
              onChange={(event) => setSelection(event.target.value)}>
              <option value="">Gunakan pengaturan proyek</option>
              {options.map((option) => <option key={option.id} value={option.id}>{option.name}</option>)}
            </Select>
          </Field>
          <Button type="submit" disabled={pending || selection === (active?.id ?? "")}>
            {pending ? "Menerapkan…" : "Terapkan"}
          </Button>
          {active ? (
            <Link className="inline-flex min-h-10 items-center text-xs text-primary hover:underline"
              href={`/simulator?scenarioId=${encodeURIComponent(active.id)}`}>Buka skenario aktif</Link>
          ) : (
            <Link className="inline-flex min-h-10 items-center text-xs text-primary hover:underline"
              href="/simulator">Buka Simulasi Pemajemukan</Link>
          )}
        </form>
        {error && <p className="text-xs text-loss" role="alert">{error}</p>}
      </CardContent>
    </Card>
  );
}
