import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  BookOpen,
  CalendarDays,
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
    items: [{ label: "Jurnal Trading", href: "/journal", icon: BookOpen, since: "v0.2.0" }],
  },
  {
    label: "Plan & Strategi",
    items: [
      { label: "Compounding", href: "/simulator", icon: TrendingUp, since: "v0.3.0" },
      { label: "Withdrawal (WD)", href: "/withdrawals", icon: Wallet, since: "v0.4.0" },
      { label: "Target Project", href: "/roadmap", icon: Target, since: "v0.3.0" },
    ],
  },
  {
    label: "Keuangan Pribadi",
    items: [
      { label: "Kebutuhan Bulanan", href: "/expenses", icon: PiggyBank, since: "v0.4.0" },
      { label: "Hutang", href: "/debts", icon: CreditCard, since: "v0.4.0" },
      { label: "Arus Kas", href: "/finance/cashflow", icon: Landmark, since: "v0.4.0" },
    ],
  },
  {
    label: "",
    items: [
      { label: "Laporan & Analisis", href: "/analytics", icon: BarChart3, since: "v0.5.0" },
      { label: "Kalender", href: "/calendar", icon: CalendarDays, since: "v0.2.0" },
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
