import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Withdrawal Plan (WD)" };

export default function Page() {
  return (
    <ComingSoon
      title="Withdrawal Plan (WD)"
      subtitle="Atur aturan penarikan profit-only."
      release="v0.4.0"
      features={["Mesin WD dinamis + high-water mark","Pemulihan loss sebelum WD","Cap berbasis kebutuhan & rasio"]}
    />
  );
}
