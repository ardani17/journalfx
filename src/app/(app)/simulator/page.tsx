import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Compounding Plan" };

export default function Page() {
  return (
    <ComingSoon
      title="Compounding Plan"
      subtitle="Atur parameter lalu simulasikan target."
      release="v0.3.0"
      features={["Simulator deterministik (return variabel & stress)","Perbandingan skenario","Estimasi durasi & jumlah siklus"]}
    />
  );
}
