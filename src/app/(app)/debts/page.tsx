import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Hutang" };

export default function Page() {
  return (
    <ComingSoon
      title="Hutang"
      subtitle="Kelola dan lunasi hutang dengan disiplin."
      release="v0.4.0"
      features={["Pokok, bunga, dan biaya terpisah","Proyeksi pelunasan","Pembayaran mengurangi pokok saja"]}
    />
  );
}
