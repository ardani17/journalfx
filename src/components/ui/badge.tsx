import type { HTMLAttributes } from "react";
import { cn } from "@/lib/utils";

type Tone = "success" | "danger" | "warn" | "info" | "neutral" | "purple" | "buy" | "sell";

const tones: Record<Tone, string> = {
  success: "bg-primary/15 text-primary border-primary/30",
  danger: "bg-loss/15 text-loss border-loss/30",
  warn: "bg-warn/15 text-warn border-warn/30",
  info: "bg-info/15 text-info border-info/30",
  neutral: "bg-panel-2 text-muted border-line",
  purple: "bg-indigo-soft/20 text-indigo-soft border-indigo-soft/40",
  buy: "bg-primary/15 text-primary border-primary/30",
  sell: "bg-loss/15 text-loss border-loss/30",
};

export function Badge({
  tone = "neutral",
  className,
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium leading-4",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}
