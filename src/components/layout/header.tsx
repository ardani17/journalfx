"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Bell, ChevronDown, LogOut, Menu, Settings, User } from "lucide-react";
import { MOBILE_NAV } from "./nav";
import { SidebarContent } from "./sidebar";
import { BrandLogo } from "./brand-logo";
import { APP_NAME } from "@/lib/brand";
import { cn } from "@/lib/utils";
import { useUnreadNotifications } from "@/components/providers";

export function Header({
  user,
  dateLabel,
  progressPct,
  progressLabel,
}: {
  user: { name: string; email: string };
  dateLabel: string;
  progressPct: number;
  progressLabel: string;
}) {
  const [logoutError, setLogoutError] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const drawerRef = useRef<HTMLDialogElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const unread = useUnreadNotifications();

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  async function logout() {
    setLogoutError(false);
    try {
      const response = await fetch("/api/auth/logout", { method: "POST" });
      if (response.ok) {
        window.location.replace("/login");
        return;
      }
    } catch {
      // Keep the account menu available to retry.
    }
    setLogoutError(true);
  }

  const initials = (user.name || "A").trim().charAt(0).toUpperCase();

  return (
    <>
      <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-line bg-surface/95 px-4 backdrop-blur lg:px-6">
        <button
          className="rounded-lg p-2 text-muted hover:bg-panel hover:text-ink lg:hidden"
          onClick={() => drawerRef.current?.showModal()}
          aria-haspopup="dialog"
          aria-label="Buka menu navigasi"
        >
          <Menu className="h-5 w-5" />
        </button>

        <Link href="/dashboard" className="flex min-w-0 items-center gap-2 lg:hidden">
          <BrandLogo mark />
          <span className="truncate text-sm font-bold">{APP_NAME}</span>
        </Link>

        <div className="ml-auto flex items-center gap-2">
          <span className="tnum hidden rounded-lg border border-line bg-panel px-3 py-1.5 text-xs text-muted sm:block">
            {dateLabel}
          </span>

          <Link
            href="/notifications"
            className="relative rounded-lg p-2 text-muted hover:bg-panel hover:text-ink"
            aria-label={`Notifikasi${unread > 0 ? ` (${unread} belum dibaca)` : ""}`}
          >
            <Bell className="h-4.5 w-4.5" />
            {unread > 0 ? (
              <span className="absolute right-1.5 top-1.5 h-2 w-2 rounded-full bg-loss" aria-hidden />
            ) : null}
          </Link>

          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setMenuOpen((v) => !v)}
              aria-label="Menu akun"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              className="flex items-center gap-2 rounded-lg p-1 pr-2 hover:bg-panel"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-indigo to-indigo-soft text-sm font-bold text-white">
                {initials}
              </span>
              <ChevronDown className="h-3.5 w-3.5 text-faint" aria-hidden />
            </button>
            {menuOpen ? (
              <div
                role="menu"
                className="absolute right-0 mt-2 w-52 rounded-xl border border-line bg-panel py-1.5 shadow-xl"
              >
                <div className="border-b border-line-soft px-3 py-2">
                  <p className="truncate text-sm font-semibold">{user.name}</p>
                  <p className="truncate text-[11px] text-faint">{user.email}</p>
                </div>
                <Link
                  href="/settings"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink"
                >
                  <Settings className="h-4 w-4" /> Pengaturan
                </Link>
                <Link
                  href="/accounts"
                  role="menuitem"
                  onClick={() => setMenuOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-muted hover:bg-panel-2 hover:text-ink"
                >
                  <User className="h-4 w-4" /> Akun Trading
                </Link>
                <button
                  role="menuitem"
                  onClick={logout}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-loss hover:bg-loss/10"
                >
                  <LogOut className="h-4 w-4" /> Keluar
                </button>
                {logoutError && <p role="alert" className="px-3 py-2 text-xs text-loss">Gagal keluar. Coba lagi.</p>}
              </div>
            ) : null}
          </div>
        </div>
      </header>

      <dialog
        ref={drawerRef}
        aria-label="Menu navigasi"
        className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none bg-transparent p-0 text-ink backdrop:bg-black/60 lg:hidden"
      >
        <div className="relative z-10 h-full w-[260px] border-r border-line">
          <SidebarContent
            progressPct={progressPct}
            progressLabel={progressLabel}
            onNavigate={() => drawerRef.current?.close()}
          />
        </div>
        <button
          type="button"
          aria-label="Tutup menu navigasi"
          className="absolute inset-y-0 left-[260px] right-0"
          onClick={() => drawerRef.current?.close()}
        />
      </dialog>
    </>
  );
}

export function MobileBottomNav() {
  const pathname = usePathname();
  return (
    <nav
      aria-label="Navigasi bawah"
      className="fixed inset-x-0 bottom-0 z-30 flex border-t border-line bg-surface/95 backdrop-blur lg:hidden"
    >
      {MOBILE_NAV.map((item) => {
        const active = pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;
        return (
          <Link
            key={item.href}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex flex-1 flex-col items-center gap-0.5 py-2 text-[10px]",
              active ? "text-primary" : "text-faint",
            )}
          >
            <Icon className="h-4.5 w-4.5" aria-hidden />
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
