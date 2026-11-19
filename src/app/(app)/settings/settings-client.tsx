"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

interface Props {
  user: { name: string; email: string; timezone: string; locale: string };
  project: { name: string; targetAmount: number; initialCapital: number };
}

export function SettingsClient({ user, project }: Props) {
  const router = useRouter();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(section: "profile" | "project", e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setMsg(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload: Record<string, unknown> = { [section]: Object.fromEntries(fd.entries()) };
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      setMsg(
        res.ok && body.ok
          ? { ok: true, text: "Perubahan tersimpan." }
          : { ok: false, text: body.error ?? "Gagal menyimpan" },
      );
      if (res.ok && body.ok) router.refresh();
    } catch {
      setMsg({ ok: false, text: "Tidak dapat menghubungi server" });
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <Card>
        <CardHeader>
          <CardTitle>Profil & Preferensi</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => save("profile", e)} className="space-y-3">
            <Field label="Nama" htmlFor="s-name">
              <Input id="s-name" name="name" defaultValue={user.name} required minLength={2} />
            </Field>
            <Field label="Email" htmlFor="s-email">
              <Input id="s-email" value={user.email} disabled />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Zona Waktu" htmlFor="s-tz">
                <Select id="s-tz" name="timezone" defaultValue={user.timezone}>
                  <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                  <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                  <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                  <option value="UTC">UTC</option>
                </Select>
              </Field>
              <Field label="Bahasa" htmlFor="s-locale">
                <Select id="s-locale" name="locale" defaultValue={user.locale}>
                  <option value="id">Bahasa Indonesia</option>
                  <option value="en">English</option>
                </Select>
              </Field>
            </div>
            <Button type="submit" disabled={loading}>Simpan Profil</Button>
          </form>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Project</CardTitle>
        </CardHeader>
        <CardContent>
          <form onSubmit={(e) => save("project", e)} className="space-y-3">
            <Field label="Nama Project" htmlFor="p-name">
              <Input id="p-name" name="name" defaultValue={project.name} required />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Modal Awal (USD)" htmlFor="p-capital">
              <Input id="p-capital" name="initialCapital" type="number" step="0.01" min="0" defaultValue={project.initialCapital} required />
              </Field>
              <Field label="Target (USD)" htmlFor="p-target">
                <Input id="p-target" name="targetAmount" type="number" step="1" min="1" defaultValue={project.targetAmount} required />
              </Field>
            </div>
            <p className="text-[11px] leading-relaxed text-faint">
              Perubahan target memengaruhi progress dan milestone. Modal awal hanya metadata — saldo
              ledger tidak berubah otomatis.
            </p>
            <Button type="submit" disabled={loading}>Simpan Project</Button>
          </form>
        </CardContent>
      </Card>

      {msg ? (
        <p
          role="status"
          className={`lg:col-span-2 rounded-lg border px-3 py-2 text-xs ${
            msg.ok
              ? "border-primary/30 bg-primary/10 text-primary"
              : "border-loss/30 bg-loss/10 text-loss"
          }`}
        >
          {msg.text}
        </p>
      ) : null}
    </div>
  );
}
