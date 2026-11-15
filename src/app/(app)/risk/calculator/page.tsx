import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Kalkulator Position Size" };

export default function Page() {
  return (
    <ComingSoon
      title="Kalkulator Position Size"
      subtitle="Hitung lot berbasis risiko dan spesifikasi broker."
      release="v0.3.0"
      features={["Rumus: risk amount / (SL distance × contract size + cost/lot)","Pembulatan lot step broker","Validasi tick value, margin, dan minimum lot"]}
    />
  );
}
