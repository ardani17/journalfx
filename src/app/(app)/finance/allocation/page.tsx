import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Alokasi Profit" };

export default function Page() {
  return (
    <ComingSoon
      title="Alokasi Profit"
      subtitle="Bagi profit ke bucket sesuai prioritas."
      release="v0.4.0"
      features={["Bucket: hidup, hutang, darurat, tabungan, trading","Alokasi berbasis periode profit","Tidak ada alokasi ganda"]}
    />
  );
}
