import Link from "next/link";

export const metadata = { title: "Kebijakan Privasi" };
export const dynamic = "force-dynamic";

export default function PrivacyPage() {
  const contact = process.env.PUBLIC_SUPPORT_EMAIL;

  return (
    <>
      <h1 className="text-xl font-bold text-ink">Kebijakan Privasi Horizon Journal</h1>
      <p>Horizon Journal adalah aplikasi untuk mencatat trading, meninjau performa, dan merencanakan keuangan pribadi.</p>
      <h2 className="font-semibold text-ink">Data akun dan jurnal</h2>
      <p>Saat Anda masuk, kami menerima identitas akun, email terverifikasi, dan nama profil dari Google. Informasi ini dipakai untuk membuat akun, mengenali Anda ketika masuk kembali, dan menampilkan profil. Cookie sesi menjaga Anda tetap masuk.</p>
      <p>Trade, transaksi, laporan, dan lampiran yang Anda masukkan tersimpan di layanan dan tersedia di akun Anda. Data tersebut diproses untuk menyediakan fungsi jurnal. Jika Anda mengaktifkan notifikasi Telegram, isi notifikasi yang dikirim akan diproses juga oleh Telegram.</p>
      <h2 className="font-semibold text-ink">Pilihan dan kontak</h2>
      <p>Anda dapat memperbarui profil di Pengaturan dan mencabut akses login dari pengaturan akun Google. Untuk meminta akses, koreksi, atau penghapusan data akun dari layanan, hubungi pengelola Horizon Journal{contact ? <> di <a href={`mailto:${contact}`} className="text-primary underline">{contact}</a></> : null}.</p>
      <Link href="/terms" className="text-primary underline">Ketentuan Penggunaan</Link>
    </>
  );
}
