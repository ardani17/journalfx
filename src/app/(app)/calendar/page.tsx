import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Kalender Trading" };

export default function Page() {
  return (
    <ComingSoon
      title="Kalender Trading"
      subtitle="Peta aktivitas dan P&L harian."
      release="v0.2.0"
      features={["P&L harian/bulanan/tahunan","Drill-down aktivitas per hari","Highlight hari profit & loss"]}
    />
  );
}
