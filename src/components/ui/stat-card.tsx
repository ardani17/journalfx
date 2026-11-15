import type { LucideIcon } from "lucide-react";
import { Card } from "./card";
import { cn } from "@/lib/utils";

type Tone = "primary" | "info" | "indigo" | "warn" | "loss";

const iconTones: Record<Tone, string> = {
  primary: "bg-primary/15 text-primary",
  info: "bg-info/15 text-info",
  indigo: "bg-indigo-soft/20 text-indigo-soft",
  warn: "bg-warn/15 text-warn",
  loss: "bg-loss/15 text-loss",
};

export function StatCard({
  label,
  value,
  sub,
  icon: Icon,
  tone = "primary",
  valueClass,
}: {
  label: string;
  value: string;
  sub?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  valueClass?: string;
}) {
  return (
    <Card className="flex items-start justify-between gap-3 p-4">
      <div className="flex min-w-0 flex-col gap-1">
        <span className="text-xs text-muted">{label}</span>
        <span className={cn("tnum truncate text-xl font-bold text-ink", valueClass)}>{value}</span>
        {sub ? <span className="tnum text-xs text-muted">{sub}</span> : null}
      </div>
      {Icon ? (
        <span className={cn("flex h-9 w-9 shrink-0 items-center justify-center rounded-full", iconTones[tone])}>
          <Icon className="h-4.5 w-4.5" aria-hidden />
        </span>
      ) : null}
    </Card>
  );
}
