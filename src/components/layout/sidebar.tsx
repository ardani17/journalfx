"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { ChevronDown, TrendingUp } from "lucide-react";
import { NAV } from "./nav";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/misc";
import { appVersion } from "@/lib/version";

export interface SidebarUser {
  name: string;
  email: string;
}

export function SidebarContent({
  progressPct,
  progressLabel,
  onNavigate,
}: {
  progressPct: number;
  progressLabel: string;
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const [expanded, setExpanded] = useState<Record<string, boolean>>({
    "Plan & Strategi": true,
    "Keuangan Pribadi": true,
  });

  return (
    <div className="flex h-full flex-col bg-surface">
      {/* Brand */}
      <Link
        href="/dashboard"
        onClick={onNavigate}
        className="flex items-center gap-2.5 px-4 py-4"
      >
        <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#0d9488] shadow-[0_0_16px_rgba(34,230,154,0.35)]">
          <TrendingUp className="h-5 w-5 text-[#06281a]" aria-hidden />
        </span>
        <span className="leading-tight">
          <span className="block text-sm font-extrabold tracking-wide text-ink">MDTP</span>
          <span className="block text-[10px] text-faint">Million Dollar Trading Project</span>
        </span>
      </Link>

      {/* Nav */}
      <nav aria-label="Navigasi utama" className="flex-1 space-y-4 overflow-y-auto px-3 py-2">
        {NAV.map((group, gi) => {
          const hasLabel = group.label !== "";
          const isOpen = expanded[group.label] ?? true;
          return (
            <div key={group.label || gi}>
              {hasLabel ? (
                <button
                  onClick={() => setExpanded((s) => ({ ...s, [group.label]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="flex w-full items-center justify-between px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wider text-faint hover:text-muted"
                >
                  {group.label}
                  <ChevronDown
                    className={cn("h-3 w-3 transition-transform", !isOpen && "-rotate-90")}
                    aria-hidden
                  />
                </button>
              ) : null}
              {(!hasLabel || isOpen) && (
                <ul className="mt-0.5 space-y-0.5">
                  {group.items.map((item) => {
                    const active = pathname === item.href || pathname.startsWith(item.href + "/");
                    const Icon = item.icon;
                    return (
                      <li key={item.href}>
                        <Link
                          href={item.href}
                          onClick={onNavigate}
                          aria-current={active ? "page" : undefined}
                          className={cn(
                            "flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-[13px] transition-colors",
                            active
                              ? "bg-indigo/70 font-semibold text-white shadow-[inset_0_0_0_1px_rgba(129,140,248,0.25)]"
                              : "text-muted hover:bg-panel hover:text-ink",
                          )}
                        >
                          <Icon className="h-4 w-4 shrink-0" aria-hidden />
                          <span className="truncate">{item.label}</span>
                          {item.since ? (
                            <span
                              className="ml-auto rounded-full border border-line px-1.5 text-[9px] text-faint"
                              title={`Tersedia di ${item.since}`}
                            >
                              {item.since}
                            </span>
                          ) : null}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          );
        })}
      </nav>

      {/* Project progress card */}
      <div className="p-3">
        <div className="rounded-xl border border-line bg-panel p-3">
          <p className="text-[11px] font-medium text-muted">Project Progress</p>
          <p className="tnum mt-1 text-lg font-bold text-primary">{progressLabel}</p>
          <Progress value={progressPct} className="mt-2 h-1.5" label="Progress project" />
          <p className="tnum mt-1.5 text-[10px] text-faint">{progressLabel} dari target</p>
        </div>
        <p className="mt-2 text-center text-[10px] text-faint">MDTP v{appVersion} · single source: ledger</p>
      </div>
    </div>
  );
}

export function Sidebar(props: { progressPct: number; progressLabel: string }) {
  return (
    <aside className="fixed inset-y-0 left-0 z-40 hidden w-[clamp(220px,21vw,300px)] border-r border-line lg:block">
      <SidebarContent {...props} />
    </aside>
  );
}
