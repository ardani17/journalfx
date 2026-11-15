import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Arus Kas" };

export default function Page() {
  return (
    <ComingSoon
      title="Arus Kas"
      subtitle="Arus kas pribadi dari hasil trading."
      release="v0.4.0"
      features={["Transaksi keuangan pribadi","Rekonsiliasi WD → kebutuhan","Riwayat kurs historis"]}
    />
  );
}
