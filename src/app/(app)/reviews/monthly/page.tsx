import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Review Bulan" };

export default function Page() {
  return (
    <ComingSoon
      title="Review Bulan"
      subtitle="Evaluasi bulanan lengkap."
      release="v0.5.0"
      features={["Cakupan anggaran & hutang","Progress milestone","Rencana bulan berikutnya"]}
    />
  );
}
