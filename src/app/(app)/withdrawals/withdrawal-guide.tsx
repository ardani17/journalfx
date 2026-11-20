import { Card, CardContent, CardHeader } from "@/components/ui/card";

const summaryClassName = "cursor-pointer rounded py-2 font-medium text-ink focus-visible:outline-2 focus-visible:outline-primary";

export function WithdrawalGuide() {
  return (
    <section id="panduan-wd" aria-labelledby="panduan-wd-title" className="scroll-mt-20">
      <Card>
        <CardHeader>
          <h2 id="panduan-wd-title" className="text-sm font-semibold text-ink">Panduan Withdrawal (WD)</h2>
        </CardHeader>
        <CardContent className="divide-y divide-line-soft text-sm leading-relaxed text-muted">
          <details open>
            <summary className={summaryClassName}>Cara mengajukan dan mencatat WD</summary>
            <ol className="list-decimal space-y-2 pb-3 pl-5">
              <li>
                <strong className="text-ink">Ajukan di Horizon Journal.</strong> Saat rekomendasi positif, klik <strong>Ajukan WD</strong>,
                pilih akun trading aktif sebagai sumber, lalu masukkan nominal USD. Batasnya adalah yang lebih kecil antara rekomendasi dan saldo sumber setelah pengajuan yang masih menunggu.
                Pengajuan masuk ke riwayat dengan status <strong>REQUESTED</strong>.
              </li>
              <li>
                <strong className="text-ink">Tarik dana secara manual di broker.</strong> Gunakan akun sumber yang dipilih.
                Jika penarikan batal dilakukan, pilih <strong>Batalkan</strong> di riwayat WD.
              </li>
              <li>
                <strong className="text-ink">Catat pencairan setelah dana masuk.</strong> Klik <strong>Selesai</strong> pada riwayat,
                lalu isi kurs USD/IDR aktual, nominal IDR yang benar-benar diterima, dan biaya transfer jika ada.
                Setelah disimpan, Horizon Journal mencatat pengurangan saldo akun trading dan pemasukan pribadi.
              </li>
            </ol>
          </details>
          <details>
            <summary className={summaryClassName}>Cara membaca rekomendasi WD</summary>
            <div className="space-y-2 pb-3">
              <p>
                <strong>Profit Minggu Ini</strong> harus positif. Perhitungan memakai laba atau rugi yang sudah direalisasikan
                dari posisi yang ditutup sebagian atau penuh, setelah biaya trading yang tercatat. Deposit dan laba mengambang
                berada di luar perhitungan.
              </p>
              <p>
                <strong>Profit Eligibel</strong> adalah bagian laba kumulatif yang melampaui <strong>High-Water Mark</strong>,
                yaitu puncak laba kumulatif dari minggu yang sudah ditutup. Jika laba kumulatif masih di bawah puncak itu,
                laba baru digunakan untuk memulihkan selisihnya dulu.
              </p>
              <p>
                Rekomendasi mengikuti batas terkecil antara <strong>Cap Rasio</strong>, <strong>Cap Kebutuhan Mingguan</strong>,
                dan <strong>Cap Kas di Atas Reserve</strong>. Pengajuan yang masih menunggu penyelesaian dan WD yang selesai minggu ini
                mengurangi sisa batas rasio dan kebutuhan. Pengajuan yang masih menunggu juga mengurangi kas di atas cadangan dan saldo sumber.
              </p>
              <p>
                Contoh, jika profit eligibel $100, rasio 50%, batas kebutuhan $40, dan kas di atas reserve $80,
                rekomendasinya $40. Jika sudah ada pengajuan $10, rekomendasinya tinggal $30.
              </p>
            </div>
          </details>
          <details>
            <summary className={summaryClassName}>Apa yang perlu dicek jika Ajukan WD nonaktif?</summary>
            <ul className="list-disc space-y-2 pb-3 pl-5">
              <li>
                Baca alasan di bawah <strong>Rekomendasi WD Minggu Ini</strong>, lalu cocokkan dengan angka di <strong>Dasar Perhitungan</strong>.
              </li>
              <li>
                Buka <strong>Edit Aturan</strong> untuk meninjau persentase <strong>Cap WD</strong>,
                target <strong>Kebutuhan Bulanan (IDR)</strong>, dan <strong>Reserve Kas (USD)</strong> yang harus tersisa.
                Batas kebutuhan mingguan juga memperhitungkan anggaran, cicilan berkala, dan kebutuhan yang sudah didanai.
              </li>
              <li>
                Jika kurs acuan <strong>JISDOR</strong> belum tersedia, coba lagi saat kurs tersedia.
                Estimasi IDR saat pengajuan memakai kurs acuan. Saat menyelesaikan WD, pakai kurs aktual pencairan.
              </li>
            </ul>
          </details>
        </CardContent>
      </Card>
    </section>
  );
}
