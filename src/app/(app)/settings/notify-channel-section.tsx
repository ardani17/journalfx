"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Bell, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";

interface Config {
  telegramConfigured: boolean;
  telegramBotTokenMasked: string | null;
  telegramChatIdMasked: string | null;
  quietStartHour: number;
  quietEndHour: number;
  isActive: boolean;
}

export function NotifyChannelSection({ initial }: { initial: Config }) {
  const router = useRouter();
  const [cfg, setCfg] = useState<Config>(initial);
  const [token, setToken] = useState("");
  const [chatId, setChatId] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/channels", {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          ...(token ? { telegramBotToken: token } : {}),
          ...(chatId ? { telegramChatId: chatId } : {}),
          quietStartHour: cfg.quietStartHour,
          quietEndHour: cfg.quietEndHour,
          isActive: cfg.isActive,
        }),
      });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Gagal menyimpan");
        return;
      }
      setCfg(json.data);
      setToken("");
      setChatId("");
      setMsg("Konfigurasi channel tersimpan (token hanya tersimpan di server).");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }

  async function test() {
    setError(null);
    setMsg(null);
    setLoading(true);
    try {
      const res = await fetch("/api/notifications/channels", { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.ok) {
        setError(json.error ?? "Tes gagal");
        return;
      }
      const { direct, dispatched } = json.data;
      setMsg(
        direct
          ? "Tes terkirim ke Telegram ✅"
          : dispatched.suppressed === "quiet-hours"
            ? "Ditahan karena jam tenang — coba di luar jam tenang, atau sesuaikan jendela."
            : dispatched.suppressed === "not-configured"
              ? "Channel belum lengkap — isi token & chat ID dulu."
              : "Pengiriman gagal — periksa token/chat ID (bot harus memulai chat dengan Anda dulu).",
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Bell className="h-4 w-4 text-primary" aria-hidden /> Notifikasi Telegram
          {cfg.telegramConfigured ? (
            cfg.isActive ? <Badge tone="success">Aktif</Badge> : <Badge tone="neutral">Nonaktif</Badge>
          ) : (
            <Badge tone="warn">Belum dikonfigurasi</Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-xs leading-relaxed text-muted">
          Opt-in. Token bot hanya disimpan di server Anda dan tidak pernah ditampilkan kembali
          ({cfg.telegramBotTokenMasked ?? "—"}). Notifikasi tetap muncul di dalam aplikasi;
          Telegram adalah saluran tambahan dengan jam tenang dan anti-duplikat.
        </p>
        <form onSubmit={save} className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Bot Token" htmlFor="nc-token" hint={cfg.telegramBotTokenMasked ? `Tersimpan: ${cfg.telegramBotTokenMasked}` : "@BotFather"}>
              <Input id="nc-token" value={token} onChange={(e) => setToken(e.target.value)} placeholder="123456:ABC-DEF..." autoComplete="off" />
            </Field>
            <Field label="Chat ID" htmlFor="nc-chat" hint={cfg.telegramChatIdMasked ? `Tersimpan: ${cfg.telegramChatIdMasked}` : "kirim /start ke bot Anda"}>
              <Input id="nc-chat" value={chatId} onChange={(e) => setChatId(e.target.value)} placeholder="123456789" autoComplete="off" />
            </Field>
          </div>
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Jam Tenang Mulai" htmlFor="nc-qs">
              <Input id="nc-qs" type="number" min="0" max="23" value={cfg.quietStartHour} onChange={(e) => setCfg({ ...cfg, quietStartHour: Number(e.target.value) })} />
            </Field>
            <Field label="Jam Tenang Selesai" htmlFor="nc-qe">
              <Input id="nc-qe" type="number" min="0" max="23" value={cfg.quietEndHour} onChange={(e) => setCfg({ ...cfg, quietEndHour: Number(e.target.value) })} />
            </Field>
            <div className="flex items-end">
              <label className="flex cursor-pointer items-center gap-2.5 rounded-lg border border-line-soft bg-panel-2/50 px-3 py-2.5 text-xs text-muted">
                <input type="checkbox" checked={cfg.isActive} onChange={(e) => setCfg({ ...cfg, isActive: e.target.checked })} className="h-4 w-4 accent-[#22e69a]" />
                Aktifkan channel
              </label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="submit" disabled={loading}>{loading ? "Menyimpan…" : "Simpan Channel"}</Button>
            <Button variant="secondary" type="button" onClick={test} disabled={loading || !cfg.telegramConfigured}>
              <Send className="h-4 w-4" aria-hidden /> Kirim Tes
            </Button>
          </div>
        </form>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {msg ? <p className="text-xs text-primary" role="status">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
