import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Laporan" };

export default function Page() {
  return (
    <ComingSoon
      title="Laporan"
      subtitle="Raporan periodik lengkap."
      release="v0.5.0"
      features={["Review harian/mingguan/bulanan","Snapshot periode tertutup","Ekspor & riwayat"]}
    />
  );
}
