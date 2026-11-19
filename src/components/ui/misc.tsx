"use client";

import { useEffect, useId, useRef, useState } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "./button";

/* ───────────────────────── Tabs ───────────────────────── */

export interface TabItem {
  value: string;
  label: string;
}

export function Tabs({
  items,
  value,
  onChange,
  className,
  tone = "primary",
}: {
  items: TabItem[];
  value: string;
  onChange: (v: string) => void;
  className?: string;
  tone?: "primary" | "purple";
}) {
  return (
    <div
      role="tablist"
      className={cn("inline-flex gap-1 rounded-xl border border-line bg-panel-2 p-1", className)}
    >
      {items.map((t) => {
        const active = t.value === value;
        return (
          <button
            key={t.value}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(t.value)}
            className={cn(
              "rounded-lg px-3.5 py-1.5 text-xs font-medium transition-colors",
              active
                ? tone === "purple"
                  ? "bg-indigo-soft text-white"
                  : "bg-primary text-[#06281a]"
                : "text-muted hover:text-ink",
            )}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}

/* ───────────────────────── Dialog (native <dialog>) ───────────────────────── */

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
  dismissible = true,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  wide?: boolean;
  dismissible?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    if (open && !dlg.open) dlg.showModal();
    if (!open && dlg.open) dlg.close();
  }, [open]);

  useEffect(() => {
    const dlg = ref.current;
    if (!dlg) return;
    const handler = (e: Event) => {
      if (dismissible && e.target === dlg) onClose();
    };
    dlg.addEventListener("click", handler);
    return () => dlg.removeEventListener("click", handler);
  }, [dismissible, onClose]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onCancel={(event) => { if (!dismissible) event.preventDefault(); }}
      className={cn(
        "m-auto w-[calc(100vw-2rem)] rounded-[14px] border border-line bg-panel p-0 text-ink backdrop:bg-black/60",
        wide ? "max-w-2xl" : "max-w-md",
      )}
    >
      <div className="flex items-center justify-between border-b border-line px-4 py-3">
        <h2 id={titleId} className="text-sm font-semibold">{title}</h2>
        <Button variant="ghost" size="icon" onClick={onClose} aria-label="Tutup" disabled={!dismissible}>
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="p-4">{children}</div>
    </dialog>
  );
}

// These dialogs close on success. Keep uncontrolled input values available for retries.
export function MutationForm(props: Omit<React.ComponentProps<"form">, "onReset">) {
  return <form {...props} onReset={(event) => event.preventDefault()} />;
}

/* ───────────────────────── Progress ───────────────────────── */

export function Progress({
  value,
  className,
  tone = "primary",
  label,
}: {
  value: number; // 0..100
  className?: string;
  tone?: "primary" | "loss" | "indigo" | "info";
  label?: string;
}) {
  const v = Math.max(0, Math.min(100, value));
  const bg =
    tone === "loss"
      ? "bg-loss"
      : tone === "indigo"
        ? "bg-indigo-soft"
        : tone === "info"
          ? "bg-info"
          : "bg-primary";
  return (
    <div
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-label={label}
      className={cn("h-2 w-full overflow-hidden rounded-full bg-panel-2", className)}
    >
      <div className={cn("h-full rounded-full transition-[width]", bg)} style={{ width: `${v}%` }} />
    </div>
  );
}

/* ───────────────────────── Empty state ───────────────────────── */

export function EmptyState({
  icon,
  title,
  description,
  action,
  className,
}: {
  icon?: React.ReactNode;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col items-center gap-2 px-6 py-12 text-center", className)}>
      {icon ? <div className="mb-1 text-faint">{icon}</div> : null}
      <p className="text-sm font-medium text-muted">{title}</p>
      {description ? <p className="max-w-sm text-xs text-faint">{description}</p> : null}
      {action ? <div className="mt-3">{action}</div> : null}
    </div>
  );
}

/* ───────────────────────── Collapsible group ───────────────────────── */

export function useExpanded(initial: Record<string, boolean> = {}) {
  return useState<Record<string, boolean>>(initial);
}
