import Link from "next/link";
import { calendarHref } from "@/lib/review-period";
import { cn } from "@/lib/utils";

export function CalendarReviewTabs({ active, date }: { active: "calendar" | "reports"; date?: string }) {
  const items = [
    { id: "calendar", label: "Kalender", href: calendarHref(date) },
    { id: "reports", label: "Review Periodik", href: date ? `/reports?calendar=${date}` : "/reports" },
  ] as const;
  return (
    <nav aria-label="Kalender dan review" className="flex w-fit gap-1 rounded-lg border border-line bg-panel p-1">
      {items.map((item) => (
        <Link
          key={item.id}
          aria-current={active === item.id ? "page" : undefined}
          href={item.href}
          className={cn("rounded-md px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-primary",
            active === item.id ? "bg-primary/15 font-semibold text-primary" : "text-muted hover:bg-panel-2 hover:text-ink")}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
