"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import googleLogo from "@/assets/google-g.png";
import { BrandLogo } from "@/components/layout/brand-logo";
import { APP_NAME } from "@/lib/brand";

export function LoginForm({ enabled, initialError }: { enabled: boolean; initialError?: string }) {
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);

  async function startGoogleLogin() {
    setError(undefined);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/google/start", { method: "POST", cache: "no-store" });
      const body = await res.json();
      if (!res.ok || !body.ok) {
        setError(body.error ?? "Login Google gagal dimulai.");
        return;
      }
      window.location.assign(body.data.authorizationUrl);
    } catch {
      setError("Tidak dapat menghubungi layanan login.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo />
          <h1 className="text-xl font-extrabold tracking-wide">{APP_NAME}</h1>
          <p className="text-sm text-muted">Catat trade, pantau performa, dan rencanakan keuangan dalam jurnal pribadi Anda.</p>
        </div>

        <div className="space-y-4 rounded-[14px] border border-line bg-panel p-5 text-center">
          <button
            type="button"
            onClick={startGoogleLogin}
            disabled={!enabled || loading}
            className="inline-flex h-10 items-center justify-center gap-3 rounded border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Image src={googleLogo} width={18} height={18} alt="" />
            {loading ? "Membuka Google…" : "Masuk dengan Google"}
          </button>
          {error ? (
            <p className="text-xs text-loss" role="alert">{error}</p>
          ) : null}
          {!enabled ? <p className="text-xs text-muted">Login Google menunggu konfigurasi server.</p> : null}
        </div>

        <nav aria-label="Informasi layanan" className="mt-4 flex justify-center gap-4 text-xs text-muted">
          <Link href="/privacy" className="underline underline-offset-2">Kebijakan Privasi</Link>
          <Link href="/terms" className="underline underline-offset-2">Ketentuan Penggunaan</Link>
        </nav>
        <details className="mt-3 rounded-lg border border-line px-3 py-2 text-xs text-muted">
          <summary className="cursor-pointer font-medium text-ink">Pasang Horizon Journal</summary>
          <ul className="mt-2 list-disc space-y-1.5 pl-4">
            <li><strong>Android Chrome</strong> · Buka menu ⋮, pilih <em>Tambahkan ke layar utama</em>, lalu pilih <em>Instal</em>.</li>
            <li><strong>iPhone Safari</strong> · Ketuk <em>Bagikan</em>, pilih <em>Tambah ke Layar Utama</em>, aktifkan <em>Buka sebagai App Web</em> jika tersedia, lalu ketuk <em>Tambah</em>.</li>
          </ul>
        </details>
      </div>
    </main>
  );
}
