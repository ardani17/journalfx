import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Target Project" };

export default function Page() {
  return (
    <ComingSoon
      title="Target Project"
      subtitle="Gambaran milestone menuju target."
      release="v0.3.0"
      features={["Timeline milestone 200 → 1jt USD","Riwayat pencapaian tersimpan","Progress ring & metrik ringkas"]}
    />
  );
}
