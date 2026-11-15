# Verifikasi MDTP — 16 November 2026

Verifikasi dilakukan terhadap working tree lokal v1.4.0 dan PRD v1.0. Perubahan lokal yang sudah ada sebelum pemeriksaan dipertahankan. Task implementasi repositori mengarah ke Linear **Million Dollar Trading Project (MDTP), P-ARD-6**, issue ARD-254–ARD-279.

## Perbaikan

| Area | Masalah yang diperbaiki |
| --- | --- |
| Simulator | Dynamic WD kini menjaga reserve dan menunggu pemulihan kerugian sebelum profit eligible. |
| Withdrawal | HWM dihitung pada batas minggu; allowance yang telah dipesan tidak dipakai dua kali; kebutuhan mingguan memakai dana teralokasi, income non-trading, cicilan, dan kurs milik user. |
| Transaksi bersamaan | Advisory lock PostgreSQL per user melindungi request/complete/cancel WD, partial close, pembayaran utang, dan alokasi. Pembacaan ulang dilakukan dalam transaksi untuk mutasi saldo. |
| Akun sumber WD | Akun sumber disimpan, diverifikasi kepemilikannya, dan diperiksa saldonya. Akun tidak lagi dipilih sembarang saat completion. |
| Alokasi | Dana berasal dari WD yang benar-benar diterima; batas dana global mencegah pengulangan melalui periode tumpang tindih. Snapshot IDR dan sisa cost basis menjaga konsistensi saat kurs berubah. Pembulatan menjaga total pembagian. |
| Konfigurasi bucket | Persentase bucket kini bisa disimpan melalui UI/API dengan validasi total 100% dan ownership. |
| Arus kas / anggaran | Reversal membatalkan kontribusi transaksi asli. Total arus kas memakai seluruh transaksi efektif, bukan hanya 100 baris terbaru. Coverage memakai dana bucket living; pembayaran utang tidak mengurangi budget hidup. |
| Ownership / status | Kategori dan strategi diverifikasi terhadap user. Trade terealisasi tidak dapat dibatalkan sehingga ledger tidak tertinggal. Transaksi keuangan terhubung tidak boleh dibalik secara terpisah dari sumbernya. |
| Analitik | P&L partial close diakui per tanggal realisasi dari ledger. CLOSED dipisahkan dari PARTIAL untuk statistik trade selesai. Best/worst trade tidak lagi dipaksa nol pada dataset satu arah. |
| Risiko | Tanda withdrawal dan initial funding pada cash-flow-adjusted drawdown diperbaiki. Fee/reversal masuk atribusi ledger. |
| Jurnal / impor | Search memakai teks pencarian; desimal tiga digit tidak dianggap ribuan; tanggal/angka invalid ditolak; debit komisi/swap broker mengurangi profit; reimport open trade tidak menggandakan trade. |
| Utang | Bunga tidak diketahui menghasilkan proyeksi incomplete. Pembayaran yang melebihi pokok atau split yang tidak valid ditolak. |
| Review | Koreksi berulang dapat dibuka dan disimpan, sementara snapshot sebelumnya tetap immutable. Query kind invalid mengembalikan 400. |
| Timezone | Batas hari/minggu/bulan layanan finansial mengikuti timezone user; kalender mengikuti tanggal lokal. Zona waktu invalid ditolak dan DST diuji. |
| Build / container | Konfigurasi Next.js diperbaiki, root tracing dipastikan lokal, metadata optional 26 binary esbuild diperbaiki tanpa perubahan versi, public directory tersedia, dan .dockerignore mengecualikan data/runtime lokal. |
| CI | Tes integrasi PostgreSQL ikut diaktifkan melalui RUN_DB_TESTS=1. |

## Bukti verifikasi

- Baseline: 67 tes unit lulus; pemeriksaan tambahan menemukan kegagalan finansial dan race condition yang direproduksi sebelum diperbaiki.
- `$env:RUN_DB_TESTS='1'; npm run test`: **93/93 lulus**, 12 file, termasuk **8 tes integrasi PostgreSQL** dengan fixture sementara dan cleanup.
- `npm run lint`: lulus.
- `npm run typecheck`: lulus.
- `npx next build`: lulus, 58 halaman diproses. Pada Windows, prebuild prisma generate saat server lama aktif terkena DLL lock; full npm run build juga diuji di Linux melalui Docker.
- `npm run e2e`: **13/13 lulus** pada production build. Mencakup autentikasi, API tanpa session, proteksi attachment, halaman utama, konfigurasi alokasi, query invalid, dan screenshot dashboard/jurnal desktop/mobile.
- `docker build -t mdtp:verification .`: lulus, termasuk npm ci, prisma generate, dan npm run build di Linux.
- Runtime image diuji dalam container sementara: `/api/health` mengembalikan HTTP 200 dan `db: up` setelah DATABASE_URL disesuaikan ke port internal PostgreSQL. Container sementara dihentikan dan dihapus setelah uji.
- Uji pg_dump custom format dan pg_restore di dua database sementara: nilai Decimal 205.00 tetap persis sama. Database sementara dihapus setelah uji.
- Pemeriksaan read-only: 0 user QA tersisa, 0 alokasi lama tanpa receipt link, 0 trade CANCELLED dengan realized P&L.
- `git diff --check`: lulus. Tidak ada instrumentasi `[DEBUG-...]` yang tertinggal.

## Batasan yang masih berlaku

- Impor MT5 berisi rantai partial deal dengan volume entry/exit berbeda **ditolak dengan pesan eksplisit** untuk mencegah P&L salah. Partial close manual di jurnal sudah diuji. Rekonstruksi otomatis rantai deal memerlukan pengembangan terpisah.
- MT5 sync saat ini merupakan impor CSV, belum koneksi broker otomatis. Pengiriman Telegram nyata, provider kalender eksternal, dan deployment produksi tidak diuji atau dijalankan pada pemeriksaan ini.
- Uji backup/restore memakai database fixture terisolasi, bukan restore database pribadi atau pemulihan penuh stack produksi.
- Target performa 100.000 trade, PWA, keseluruhan lokalisasi Inggris, dan audit keamanan menyeluruh belum dibuktikan oleh suite ini.
- Build Linux masih memberi warning jose terkait compression API pada Edge Runtime; autentikasi aplikasi pada tes browser lulus.
- Perubahan belum dibuat menjadi commit/tag/release atau deployment produksi. Hasil ini membuktikan skenario yang diuji dan tidak menjamin seluruh kemungkinan bug sudah hilang.

## Pembaruan Linear

- [Laporan verifikasi](https://linear.app/ardani/document/verifikasi-and-bug-fix-16-november-2026-1d21c7ed89fb) tersimpan di proyek MDTP.
- 14 issue yang sudah ada ditambahkan catatan verifikasi: ARD-254, ARD-259, ARD-262, ARD-264, ARD-265, ARD-268, ARD-269, ARD-270, ARD-271, ARD-272, ARD-273, ARD-274, ARD-278, ARD-279.
- Project update diterbitkan dengan health `atRisk`; status proyek tetap In Progress karena batasan coverage di atas.
- Pembuatan issue baru ditolak oleh Linear karena workspace mencapai free issue limit. Pekerjaan tersisa dicatat dalam laporan ini dan project update.
