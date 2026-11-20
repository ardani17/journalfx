"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Bell, Send } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Field, Input } from "@/components/ui/field";
import type { ChannelConfig } from "@/server/services/notify-channels";

const CHANNEL_ENDPOINT = "/api/notifications/channels";

async function channelRequest<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  const result = await response.json().catch(() => null);
  if (!response.ok || !result?.ok) throw new Error(result?.error ?? "Permintaan Telegram gagal.");
  return result.data;
}

const testMessages: Record<string, string> = {
  "quiet-hours": "Pesan tes ditahan selama jam tenang.",
  inactive: "Aktifkan dan simpan pengaturan sebelum mengirim tes.",
  "not-configured": "Hubungkan Telegram sebelum mengirim tes.",
};

export function NotifyChannelSection({ userId, initial }: { userId: string; initial: ChannelConfig }) {
  const [cfg, setCfg] = useState(initial);
  const [chatId, setChatId] = useState(initial.telegramChatId ?? "");
  const [link, setLink] = useState<{ url: string; expiresAt: string; chatId: string } | null>(null);
  const [botUrl, setBotUrl] = useState<string | null>(null);
  const [linkExpired, setLinkExpired] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<"link" | "bot" | "save" | "test" | null>(null);

  useEffect(() => {
    if (!link) return;
    const timer = window.setTimeout(() => setLinkExpired(true), Math.max(0, Date.parse(link.expiresAt) - Date.now()));
    return () => window.clearTimeout(timer);
  }, [link]);

  const connection = useQuery({
    queryKey: ["telegram-connection", userId],
    queryFn: ({ signal }) => channelRequest<ChannelConfig>(CHANNEL_ENDPOINT, { signal, cache: "no-store" }),
    initialData: initial,
    staleTime: 0,
    gcTime: 0,
    refetchOnWindowFocus: true,
    refetchIntervalInBackground: true,
    refetchInterval: (query) => {
      if (!link || linkExpired || query.state.data?.telegramChatId === link.chatId) return false;
      return 2000;
    },
  });
  const { telegramChatId: verifiedChatId, telegramAvailable } = connection.data;
  const enteredChatId = chatId.trim();
  const connected = verifiedChatId !== null;
  const canLink = telegramAvailable && enteredChatId !== "" && enteredChatId !== verifiedChatId;
  const awaitingConfirmation = link && verifiedChatId !== link.chatId;

  async function openTelegram(chatId?: string) {
    setPending(chatId ? "link" : "bot");
    setError(null);
    setMsg(null);
    const tab = window.open("about:blank", "_blank");
    if (tab) tab.opener = null;
    try {
      const endpoint = `${CHANNEL_ENDPOINT}/telegram-link`;
      if (!chatId) {
        const bot = await channelRequest<{ url: string }>(endpoint, { cache: "no-store" });
        setBotUrl(bot.url);
        tab?.location.replace(bot.url);
        return;
      }
      const next = await channelRequest<{ url: string; expiresAt: string }>(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ chatId }),
      });
      setLinkExpired(false);
      setLink({ ...next, chatId });
      tab?.location.replace(next.url);
    } catch (error) {
      tab?.close();
      setError(error instanceof Error ? error.message : "Tautan Telegram gagal dibuat.");
    } finally {
      setPending(null);
    }
  }

  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending("save");
    setError(null);
    setMsg(null);
    try {
      const { quietStartHour, quietEndHour, isActive } = cfg;
      const updated = await channelRequest<ChannelConfig>(CHANNEL_ENDPOINT, {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ quietStartHour, quietEndHour, isActive }),
      });
      setCfg(updated);
      setMsg("Pengaturan notifikasi tersimpan.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Gagal menyimpan pengaturan.");
    } finally {
      setPending(null);
    }
  }

  async function test() {
    setPending("test");
    setError(null);
    setMsg(null);
    try {
      const result = await channelRequest<{ delivered: boolean; suppressed: string | null }>(CHANNEL_ENDPOINT, { method: "POST" });
      if (result.delivered) setMsg("Pesan tes terkirim ke Telegram.");
      else setError((result.suppressed && testMessages[result.suppressed]) || "Pesan tes gagal dikirim. Coba lagi.");
    } catch (error) {
      setError(error instanceof Error ? error.message : "Pesan tes gagal dikirim.");
    } finally {
      setPending(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-center gap-2">
          <Bell className="h-4 w-4 text-primary" aria-hidden /> Notifikasi Telegram
          <span aria-live="polite">
            {connected ? <Badge tone="success">Terhubung</Badge> : <Badge tone="neutral">Belum terhubung</Badge>}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <form aria-label="Hubungkan Chat ID Telegram" className="space-y-2" onSubmit={(event) => {
          event.preventDefault();
          if (canLink) void openTelegram(enteredChatId);
        }}>
          <Field label="Chat ID Telegram" htmlFor="nc-chat-id">
            <Input id="nc-chat-id" autoComplete="off" inputMode="numeric" required
              aria-describedby="nc-chat-id-hint" value={chatId} onChange={(event) => setChatId(event.target.value)} />
          </Field>
          <p id="nc-chat-id-hint" className="text-xs text-muted">Di chat pribadi bot, kirim <strong>/id</strong>, lalu masukkan angka yang dikirim bot.</p>
          {verifiedChatId ? <p className="text-xs text-muted">Chat ID aktif {verifiedChatId}</p> : null}
          {!telegramAvailable ? (
            <p className="text-xs text-muted">Bot Telegram belum tersedia.</p>
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="secondary" onClick={() => openTelegram()} disabled={pending !== null}>
                {pending === "bot" ? "Membuka bot…" : "Temukan Chat ID"}
              </Button>
              <Button type="submit" variant="secondary" disabled={pending !== null || !canLink}>
                {pending === "link" ? "Membuat tautan…" : linkExpired && awaitingConfirmation ? "Buat Tautan Baru" : "Hubungkan Telegram"}
              </Button>
              {botUrl ? <a className="text-xs text-primary underline" href={botUrl} target="_blank" rel="noreferrer">Buka chat bot</a> : null}
            </div>
          )}
          {awaitingConfirmation && (linkExpired ? (
              <p className="text-xs text-muted" role="status">Tautan kedaluwarsa. Buat tautan baru untuk melanjutkan.</p>
            ) : (
              <p className="text-xs text-muted" role="status">
                Tekan <strong>Start</strong> di chat pribadi bot untuk memverifikasi ID {link.chatId}.{" "}
                <a className="text-primary underline" href={link.url} target="_blank" rel="noreferrer">Buka Telegram</a>
              </p>
          ))}
        </form>
        <form onSubmit={save} className="space-y-3">
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
                Aktifkan notifikasi Telegram
              </label>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={pending !== null}>{pending === "save" ? "Menyimpan…" : "Simpan Pengaturan"}</Button>
            <Button variant="secondary" type="button" onClick={test} disabled={pending !== null || !connected || !telegramAvailable}>
              <Send className="h-4 w-4" aria-hidden /> {pending === "test" ? "Mengirim…" : "Kirim Tes"}
            </Button>
          </div>
        </form>
        {error ? <p className="text-xs text-loss" role="alert">{error}</p> : null}
        {msg ? <p className="text-xs text-primary" role="status">{msg}</p> : null}
      </CardContent>
    </Card>
  );
}
