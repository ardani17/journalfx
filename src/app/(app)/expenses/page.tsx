import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Kebutuhan Bulanan" };

export default function Page() {
  return (
    <ComingSoon
      title="Kebutuhan Bulanan"
      subtitle="Anggaran bulanan dari hasil trading."
      release="v0.4.0"
      features={["Kategori anggaran & progress terdanai","Pengeluaran & pemasukan","Cakupan kebutuhan mingguan"]}
    />
  );
}
