"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { TrendingUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input } from "@/components/ui/field";

export function LoginForm() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Login gagal");
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
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#0d9488] shadow-[0_0_24px_rgba(34,230,154,0.35)]">
            <TrendingUp className="h-6 w-6 text-[#06281a]" aria-hidden />
          </span>
          <h1 className="text-xl font-extrabold tracking-wide">MDTP</h1>
          <p className="text-xs text-muted">Million Dollar Trading Project</p>
        </div>

        <form
          onSubmit={submit}
          className="space-y-4 rounded-[14px] border border-line bg-panel p-5"
          aria-label="Formulir login"
        >
          <Field label="Email" htmlFor="email">
            <Input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="nama@email.com"
            />
          </Field>
          <Field label="Password" htmlFor="password">
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
            />
          </Field>
          {error ? (
            <p className="rounded-lg border border-loss/30 bg-loss/10 px-3 py-2 text-xs text-loss" role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" size="lg" disabled={loading}>
            {loading ? "Memproses…" : "Masuk"}
          </Button>
        </form>

        <p className="mt-4 text-center text-[11px] leading-relaxed text-faint">
          Aplikasi pribadi. Protect Capital. Trade with Discipline.
          <br />
          Withdraw Based on Needs. Compound the Rest.
        </p>
      </div>
    </main>
  );
}
