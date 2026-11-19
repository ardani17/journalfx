"use client";

import Image from "next/image";
import Link from "next/link";
import Script from "next/script";
import { useEffect, useRef, useState } from "react";
import googleLogo from "@/assets/google-g.png";
import { BrandLogo } from "@/components/layout/brand-logo";
import { APP_NAME } from "@/lib/brand";

interface TurnstileWidget {
  ready(callback: () => void): void;
  render(container: HTMLElement, options: {
    sitekey: string;
    action: string;
    size: "compact" | "flexible";
    retry: "never";
    "response-field": false;
    "refresh-expired": "manual";
    "refresh-timeout": "manual";
    callback: (token: string) => void;
    "expired-callback": () => void;
    "timeout-callback": () => void;
    "error-callback": () => void;
  }): string;
  reset(widgetId: string): void;
  remove(widgetId: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileWidget;
  }
}

const challengeMessages = {
  expired: "Verifikasi keamanan kedaluwarsa. Ulangi verifikasi untuk masuk.",
  failed: "Verifikasi keamanan gagal. Silakan ulangi.",
  script: "Verifikasi keamanan gagal dimuat. Muat ulang halaman untuk mencoba lagi.",
};

export function LoginForm({ turnstileSiteKey, initialError }: { turnstileSiteKey?: string; initialError?: string }) {
  const [error, setError] = useState(initialError);
  const [loading, setLoading] = useState(false);
  const [scriptReady, setScriptReady] = useState(false);
  const [challengeIssue, setChallengeIssue] = useState<keyof typeof challengeMessages>();
  const [token, setToken] = useState<string>();
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const submitting = useRef(false);

  useEffect(() => {
    const widget = window.turnstile;
    const container = containerRef.current;
    if (!scriptReady || !turnstileSiteKey || !widget || !container) return;

    let mounted = true;
    function invalidate(issue: "expired" | "failed") {
      if (!mounted || submitting.current) return;
      setToken(undefined);
      setChallengeIssue(issue);
    }

    widget.ready(() => {
      if (!mounted) return;
      try {
        widgetId.current = widget.render(container, {
          sitekey: turnstileSiteKey,
          action: "google_login",
          size: container.clientWidth < 300 ? "compact" : "flexible",
          retry: "never",
          "response-field": false,
          "refresh-expired": "manual",
          "refresh-timeout": "manual",
          callback: (nextToken) => {
            if (!mounted || submitting.current) return;
            setToken(nextToken);
            setChallengeIssue(undefined);
          },
          "expired-callback": () => invalidate("expired"),
          "timeout-callback": () => invalidate("expired"),
          "error-callback": () => invalidate("failed"),
        });
      } catch {
        setChallengeIssue("script");
      }
    });

    return () => {
      mounted = false;
      if (widgetId.current !== null) widget.remove(widgetId.current);
      widgetId.current = null;
    };
  }, [scriptReady, turnstileSiteKey]);

  function resetChallenge() {
    setToken(undefined);
    setChallengeIssue(undefined);
    if (widgetId.current !== null) window.turnstile?.reset(widgetId.current);
  }

  async function startGoogleLogin() {
    if (!token || submitting.current) return;
    submitting.current = true;
    setError(undefined);
    setLoading(true);
    setToken(undefined);
    try {
      const res = await fetch("/api/auth/google/start", {
        method: "POST",
        cache: "no-store",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ turnstileToken: token }),
      });
      const body = await res.json();
      if (res.ok && body.ok) {
        window.location.assign(body.data.authorizationUrl);
        return;
      }
      setError(body.error ?? "Login Google gagal dimulai.");
    } catch {
      setError("Tidak dapat menghubungi layanan login.");
    }
    submitting.current = false;
    setLoading(false);
    resetChallenge();
  }

  const message = challengeIssue ? challengeMessages[challengeIssue] : error;

  return (
    <main className="flex min-h-screen items-center justify-center bg-bg px-4">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-2 text-center">
          <BrandLogo />
          <h1 className="text-xl font-extrabold tracking-wide">{APP_NAME}</h1>
          <p className="text-sm text-muted">Catat trade, pantau performa, dan rencanakan keuangan dalam jurnal pribadi Anda.</p>
        </div>

        <div className="space-y-4 rounded-[14px] border border-line bg-panel p-5 text-center">
          {turnstileSiteKey && (
            <>
              <Script
                src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
                strategy="afterInteractive"
                onReady={() => {
                  if (window.turnstile) setScriptReady(true);
                  else setChallengeIssue("script");
                }}
                onError={() => setChallengeIssue("script")}
              />
              <div ref={containerRef} className="flex min-h-[65px] justify-center" />
            </>
          )}
          <button
            type="button"
            onClick={startGoogleLogin}
            disabled={!token || loading}
            className="inline-flex h-10 items-center justify-center gap-3 rounded border border-[#747775] bg-white px-3 text-sm font-medium text-[#1f1f1f] hover:bg-[#f8f9fa] disabled:cursor-not-allowed disabled:opacity-60"
          >
            <Image src={googleLogo} width={18} height={18} alt="" />
            {loading ? "Membuka Google…" : "Masuk dengan Google"}
          </button>
          {message ? (
            <p className="text-xs text-loss" role="alert">{message}</p>
          ) : null}
          {challengeIssue && (
            <button
              type="button"
              className="text-sm font-medium text-ink underline underline-offset-2"
              onClick={challengeIssue === "script" ? () => window.location.reload() : resetChallenge}
            >
              {challengeIssue === "script" ? "Muat ulang halaman" : "Ulangi verifikasi"}
            </button>
          )}
          {!turnstileSiteKey ? <p className="text-xs text-muted">Login Google menunggu konfigurasi server.</p> : null}
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
