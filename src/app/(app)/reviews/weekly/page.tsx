import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Review Mingguan" };

export default function Page() {
  return (
    <ComingSoon
      title="Review Mingguan"
      subtitle="Evaluasi minggu: WD, compounding, disiplin."
      release="v0.5.0"
      features={["WD aktual vs rekomendasi","Jumlah compounding & cakupan kebutuhan","Audited corrections"]}
    />
  );
}
