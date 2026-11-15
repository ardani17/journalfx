import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Manajemen Risiko" };

export default function Page() {
  return (
    <ComingSoon
      title="Manajemen Risiko"
      subtitle="Batas risiko dan disiplin eksekusi."
      release="v0.3.0"
      features={["Batas risiko/trade, harian, mingguan","Drawdown review & max open risk","Peringatan saat batas tersentuh"]}
    />
  );
}
