import { ComingSoon } from "@/components/layout/coming-soon";

export const metadata = { title: "Jurnal Trading" };

export default function Page() {
  return (
    <ComingSoon
      title="Jurnal Trading"
      subtitle="Catat, evaluasi, dan tingkatkan performa trading Anda."
      release="v0.2.0"
      features={["CRUD trade & eksekusi parsial","Jurnal psikologi + checklist pre/post","Impor CSV/MT4/MT5 dengan dedup"]}
    />
  );
}
