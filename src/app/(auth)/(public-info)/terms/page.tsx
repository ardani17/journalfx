import Link from "next/link";

export const metadata = { title: "Ketentuan Penggunaan" };

export default function TermsPage() {
  return (
    <>
      <h1 className="text-xl font-bold text-ink">Ketentuan Penggunaan Horizon Journal</h1>
      <p>Gunakan Horizon Journal untuk mencatat aktivitas trading dan merencanakan keuangan Anda. Jaga akses akun Google Anda dan unggah hanya data serta lampiran yang berhak Anda gunakan.</p>
      <p>Hasil simulasi, estimasi kurs, dan perhitungan jurnal bersifat informatif. Periksa angka aktual dan catatan broker sebelum mengambil keputusan atau mencatat pencairan.</p>
      <Link href="/privacy" className="text-primary underline">Kebijakan Privasi</Link>
    </>
  );
}
