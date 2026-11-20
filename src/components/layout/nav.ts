import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarRange,
  BookOpen,
  CalendarDays,
  ListTodo,
  CreditCard,
  LayoutDashboard,
  PiggyBank,
  Settings,
  Target,
  TrendingUp,
  Wallet,
  Landmark,
} from "lucide-react";

export interface NavLeaf {
  label: string;
  href: string;
  icon: LucideIcon;
  /** release that fills this page — placeholder until then */
  since?: string;
}

export interface NavGroup {
  label: string;
  items: NavLeaf[];
}

export const NAV: NavGroup[] = [
  {
    label: "",
    items: [{ label: "Dashboard", href: "/dashboard", icon: LayoutDashboard }],
  },
  {
    label: "",
    items: [
      { label: "Jurnal Trading", href: "/journal", icon: BookOpen },
      { label: "Task / Jadwal", href: "/tasks", icon: ListTodo },
    ],
  },
  {
    label: "Plan & Strategi",
    items: [
      { label: "Compounding", href: "/simulator", icon: TrendingUp },
      { label: "Withdrawal (WD)", href: "/withdrawals", icon: Wallet },
      { label: "Target Project", href: "/roadmap", icon: Target },
    ],
  },
  {
    label: "Keuangan Pribadi",
    items: [
      { label: "Kebutuhan Bulanan", href: "/expenses", icon: PiggyBank },
      { label: "Hutang", href: "/debts", icon: CreditCard },
      { label: "Arus Kas", href: "/finance/cashflow", icon: Landmark },
    ],
  },
  {
    label: "",
    items: [
      { label: "Laporan & Analisis", href: "/analytics", icon: BarChart3 },
      { label: "Kalender", href: "/calendar", icon: CalendarDays },
      { label: "Review Periodik", href: "/reports", icon: CalendarRange },
      { label: "Pengaturan", href: "/settings", icon: Settings },
    ],
  },
];

export const MOBILE_NAV: NavLeaf[] = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Jurnal", href: "/journal", icon: BookOpen },
  { label: "Simulator", href: "/simulator", icon: TrendingUp },
  { label: "WD", href: "/withdrawals", icon: Wallet },
  { label: "Lainnya", href: "/settings", icon: Settings },
];
