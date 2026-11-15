"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, Select } from "@/components/ui/field";

/**
 * Private onboarding — personal financial values entered here stay in the
 * user's private database and are never committed or shared.
 */
export function OnboardForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    const fd = new FormData(e.currentTarget);
    const payload = Object.fromEntries(fd.entries());
    try {
      const res = await fetch("/api/onboard", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Onboarding gagal");
        return;
      }
      router.push("/dashboard");
      router.refresh();
    } catch {
      setError("Tidak dapat menghubungi server");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4 py-8">
      <div className="w-full max-w-lg">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#0d9488] shadow-[0_0_24px_rgba(34,230,154,0.35)]">
            <TrendingUp className="h-6 w-6 text-[#06281a]" aria-hidden />
          </span>
          <h1 className="text-xl font-extrabold">Selamat datang di MDTP</h1>
          <p className="max-w-sm text-xs leading-relaxed text-muted">
            Buat akun pribadi Anda. Data finansial yang Anda masukkan hanya tersimpan di aplikasi
            pribadi Anda dan tidak dibagikan ke mana pun.
          </p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-[14px] border border-line bg-panel p-5"
          aria-label="Formulir onboarding"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama" htmlFor="name">
              <Input id="name" name="name" required minLength={2} placeholder="Nama Anda" />
            </Field>
            <Field label="Email" htmlFor="email">
              <Input id="email" name="email" type="email" required placeholder="nama@email.com" />
            </Field>
          </div>

          <Field
            label="Password"
            htmlFor="password"
            hint="Minimal 8 karakter, mengandung huruf dan angka"
          >
            <Input id="password" name="password" type="password" required minLength={8} />
          </Field>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Modal Awal (USD)" htmlFor="initialCapital">
              <Input
                id="initialCapital"
                name="initialCapital"
                type="number"
                step="0.01"
                min="1"
                required
                defaultValue={200}
              />
            </Field>
            <Field label="Target Project (USD)" htmlFor="targetAmount">
              <Input
                id="targetAmount"
                name="targetAmount"
                type="number"
                step="1"
                min="1"
                required
                defaultValue={1000000}
              />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Nama Akun Trading" htmlFor="accountName">
              <Input id="accountName" name="accountName" required defaultValue="Akun Utama" />
            </Field>
            <Field label="Broker (opsional)" htmlFor="broker">
              <Input id="broker" name="broker" placeholder="cth. Exness, IC Markets" />
            </Field>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Zona Waktu" htmlFor="timezone">
              <Select id="timezone" name="timezone" defaultValue="Asia/Jakarta">
                <option value="Asia/Jakarta">Asia/Jakarta (WIB)</option>
                <option value="Asia/Makassar">Asia/Makassar (WITA)</option>
                <option value="Asia/Jayapura">Asia/Jayapura (WIT)</option>
                <option value="UTC">UTC</option>
              </Select>
            </Field>
            <Field label="Bahasa" htmlFor="locale">
              <Select id="locale" name="locale" defaultValue="id">
                <option value="id">Bahasa Indonesia</option>
                <option value="en">English</option>
              </Select>
            </Field>
          </div>

          {error ? (
            <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">
              {error}
            </p>
          ) : null}

          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Menyiapkan…" : "Mulai Project"}
          </Button>
          <p className="text-center text-[10px] leading-relaxed text-faint">
            Angka target dan modal adalah konfigurasi pribadi Anda, bukan janji imbal hasil.
          </p>
        </form>
      </div>
    </main>
  );
}
