import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Laporan & Analisis" };

export default function Page() {
  return (
    <ComingSoon
      title="Laporan & Analisis"
      subtitle="Evaluasi performa trading dan project."
      release="v0.5.0"
      features={["Metrik: win rate, PF, expectancy, R","Breakdown per strategi/sesi/emosi","Drawdown teradjust arus kas"]}
    />
  );
}
