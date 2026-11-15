import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Review Harian" };

export default function Page() {
  return (
    <ComingSoon
      title="Review Harian"
      subtitle="Tutup hari dengan evaluasi disiplin."
      release="v0.5.0"
      features={["Performa, risiko, refleksi, rencana besok","Snapshot periode immutable","Discipline score harian"]}
    />
  );
}
