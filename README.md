# Horizon Journal

Horizon Journal adalah aplikasi web berbahasa Indonesia untuk mencatat trading, mengevaluasi disiplin dan risiko, serta merencanakan penggunaan laba trading untuk kebutuhan pribadi. Jurnal ini berfokus pada XAUUSD dan mendukung instrumen lain, beberapa akun broker, serta akun dalam USD dan USC (US cent).

Setiap pengguna masuk dengan Google dan mendapat ruang kerja privat. Dashboard menampilkan saldo aktual dari ledger. Simulator menghasilkan proyeksi ilustratif berdasarkan parameter skenario. Penempatan order dan penarikan dana tetap dilakukan di broker.

## Fitur utama

| Modul | Kegunaan |
| --- | --- |
| **Dashboard dan akun trading** | Pantau saldo, P&L terealisasi, riwayat deposit dan penarikan, serta progres target. Kelola akun USD dan USC, koreksi transaksi melalui pembalikan ledger, dan lihat estimasi konversi rupiah dengan kurs JISDOR Bank Indonesia. |
| **Jurnal Trading dan MetaTrader 5** | Catat eksekusi, termasuk penutupan sebagian, beserta strategi, kondisi psikologis, dan lampiran privat. Filter riwayat per akun, strategi, status, atau tanggal entri. Isi jurnal secara manual atau unggah laporan MT5. |
| **Task / Jadwal** | Susun rencana harian, atur jenis kegiatan pribadi, dan kaitkan kegiatan trading dengan strategi. Catat hasil dan persentase keterlaksanaan, lalu simpan satu langkah perbaikan untuk hari berikutnya. |
| **Compounding dan Target Project** | Eksplorasi peluang mencapai target, lalu buka **Rencana tersimpan dan Monte Carlo lanjutan** pada halaman yang sama untuk membandingkan proyeksi per siklus dan risiko per trade. Gunakan rencana tersimpan sebagai skenario aktif di Roadmap. |
| **Manajemen risiko** | Hitung ukuran posisi berdasarkan jarak stop loss, spesifikasi kontrak, dan biaya. Pantau risiko posisi terbuka, batas kerugian harian dan mingguan, serta drawdown. |
| **Withdrawal (WD)** | Hitung rekomendasi penarikan dari laba yang memenuhi syarat setelah pemulihan drawdown berdasarkan high-water mark. Perhitungan mempertimbangkan kebutuhan, dana yang tersedia, dan penarikan yang masih tertunda. Rekonsiliasi dana yang diterima untuk memperbarui ledger trading dan arus kas pribadi. |
| **Keuangan pribadi** | Kelola anggaran, pemasukan, pengeluaran, jadwal pembayaran utang, dan alokasi dana penarikan ke pos keuangan. |
| **Laporan, kalender, dan review** | Tinjau win rate, P&L, performa strategi dan portofolio, serta progres aturan prop firm. Catat agenda ekonomi secara manual untuk memberi konteks pada trade. Simpan review harian, mingguan, atau bulanan dengan skor disiplin dan snapshot saat review ditutup. |
| **Notifikasi dan akses mobile** | Lihat pengingat di aplikasi, hubungkan notifikasi Telegram, atau tambahkan Horizon Journal ke layar utama Android maupun iPhone. |

## Alur penggunaan

1. **Siapkan akun.** Setelah login, pilih **Akun Trading** dari menu profil dan gunakan mata uang yang sesuai dengan akun broker.
2. **Bangun riwayat.** Masuk ke **Jurnal Trading** untuk mencatat trade atau mengimpor riwayat MT5. Tambahkan konteks dan strategi agar hasil bisa ditinjau kembali.
3. **Tinjau performa.** Gunakan **Laporan & Analisis**, lalu catat evaluasi dan rencana berikutnya di **Review Periodik**.
4. **Rencanakan penarikan.** Perbarui kebutuhan bulanan dan kewajiban, tinjau rekomendasi di **Withdrawal (WD)**, lalu catat kurs dan nominal yang benar-benar diterima setelah dana cair.

## Menjalankan secara lokal

Gunakan Node.js 22 seperti yang digunakan CI, npm, serta Docker dengan Compose. Siapkan kredensial Google OAuth dan Cloudflare Turnstile untuk mencoba login.

Jalankan dari direktori repositori. Jika belum memiliki `.env`, salin templatnya dengan `Copy-Item .env.example .env` di PowerShell atau `cp .env.example .env` di Bash.

```sh
npm ci
docker compose up -d --wait postgres
docker compose exec -T postgres createdb -U mdtp horizon_journal_google_local
```

Jalankan `createdb` sekali untuk setiap database baru. PostgreSQL lokal tersedia di `127.0.0.1:5433`. Pastikan `DATABASE_URL` mengarah ke `horizon_journal_google_local` di port tersebut.

Isi konfigurasi login di `.env`. Untuk membuat `AUTH_SECRET` acak, jalankan `node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"`. Daftarkan `http://localhost:3000/api/auth/google/callback` pada client Google OAuth bertipe **Web application** dan gunakan widget Turnstile pengembangan untuk hostname `localhost`. [Panduan Google OAuth dan Turnstile](docs/deployment/google-sign-in.md)

```sh
npx prisma generate
npm run db:deploy
npm run db:seed:reference
npm run dev
```

Buka [http://localhost:3000](http://localhost:3000). Login pertama membuat jurnal baru dengan saldo nol.

### Variabel lingkungan

| Variabel | Fungsi |
| --- | --- |
| `DATABASE_URL` | Koneksi PostgreSQL. Stack produksi Compose membentuk URL dari `POSTGRES_USER`, `POSTGRES_PASSWORD`, dan `POSTGRES_DB`. |
| `APP_ORIGIN` | Origin yang dipakai browser, misalnya `http://localhost:3000` saat pengembangan. Gunakan origin HTTPS tanpa path di produksi. |
| `AUTH_SECRET` | Rahasia penandatanganan sesi dengan minimal 32 karakter. Gunakan nilai berbeda di setiap lingkungan. |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | Kredensial client OAuth untuk login Google. |
| `TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Kunci widget dan verifikasi Turnstile. Keduanya diperlukan agar login aktif. |
| `UPLOAD_DIR` | Direktori lampiran privat. Bawaan lokalnya `./uploads`. |
| `PUBLIC_SUPPORT_EMAIL` | Alamat kontak opsional yang ditampilkan pada kebijakan privasi. |
| `TELEGRAM_BOT_TOKEN` | Token bot bersama yang opsional untuk pengiriman notifikasi. |
| `AI_BASE_URL`, `AI_API_KEY`, `AI_MODEL` | Konfigurasi opsional penyedia AI Journal Insights. |

Simpan rahasia di lingkungan server atau di `.env` privat. [Templat konfigurasi](.env.example)

## Integrasi

### MetaTrader 5

Di **Jurnal Trading** atau bagian **Sinkronisasi MT5** di **Pengaturan**, unggah laporan **Trade History** berformat `.xlsx` berukuran maksimal 5 MB. Pilih akun tujuan dengan mata uang yang sesuai dengan laporan. Importer mencatat posisi tertutup, deposit, penarikan, dan biaya yang dikenali. Entri yang sudah tercatat pada akun tujuan dilewati saat file dengan riwayat yang sama diunggah kembali. Periksa ringkasan impor untuk melihat entri yang dilewati atau perlu dikoreksi.

### Telegram

Isi `TELEGRAM_BOT_TOKEN` pada server. Untuk deployment dengan origin HTTPS publik, daftarkan webhook dari lingkungan yang memuat token dan `APP_ORIGIN`. Ulangi pendaftaran setelah rotasi token.

```sh
node --env-file=.env scripts/register-telegram-webhook.mjs
```

Di **Pengaturan → Notifikasi Telegram**, pilih **Temukan Chat ID** untuk membuka chat pribadi bot. Tekan **Start**, lalu pilih **Lihat Chat ID**. Masukkan angka yang diberikan, pilih **Hubungkan Telegram**, dan tekan **Start** pada tautan verifikasi. Setelah terhubung, gunakan pesan tes untuk memeriksa pengiriman. Jam tenang mengikuti zona waktu profil.

Bot menampilkan tombol **Ringkasan Trading** dan **Tugas Hari Ini** setelah akun terhubung. Tekan **Menu Utama** untuk kembali dari ringkasan atau daftar tugas, atau pilih **Buka Menu Bot** di Pengaturan untuk membuka menu kembali di Telegram. Tombol **Tandai selesai** menyimpan status tugas di aplikasi. Jika sebuah tombol lama kedaluwarsa, bot mengirim menu baru. Pastikan webhook menerima `message` dan `callback_query` dengan menjalankan skrip pendaftaran di atas.

Untuk pengujian lokal, jalankan aplikasi dengan `APP_ORIGIN` loopback. Di terminal kedua, jalankan `node --env-file=.env scripts/poll-telegram-local.mjs` dan biarkan berjalan selama pengujian. Jika menjalankan beberapa checkout, arahkan `APP_ORIGIN` poller ke port checkout yang ingin diuji. Gunakan satu poller per bot dan hentikan poller sebelum mendaftarkan webhook HTTPS.

### AI Journal Insights

Jalankan migrasi, lalu isi `AI_BASE_URL`, `AI_API_KEY`, dan `AI_MODEL` untuk penyedia dengan API Chat Completions non-streaming. Gunakan base URL yang menyertakan path versi API, misalnya `https://provider.example/v1`, atau URL endpoint lengkap yang berakhir dengan `/chat/completions`. Mulai ulang proses aplikasi setelah mengubah konfigurasi.

Di **Laporan & Analisis**, pilih **Buat insight AI** setelah tersedia minimal tiga trade tertutup dengan P&L tercatat. Trade yang belum memiliki catatan jurnal tetap berkontribusi pada statistik performa. Aplikasi mengirim statistik agregat dan label tetap ke penyedia AI. Analisis berbasis aturan tersedia tanpa konfigurasi AI. Jika pembuatan insight gagal, periksa tahap kegagalan di log server bertanda `[ai-journal]`.

## Arsitektur

Aplikasi menggunakan Next.js App Router, React, TypeScript, Tailwind CSS, dan Recharts. Route handler meneruskan operasi ke layanan server. PostgreSQL dan Prisma menyimpan data, Zod memvalidasi masukan, dan `decimal.js` menjaga presisi perhitungan uang. Waktu transaksi disimpan dalam UTC, dengan periode laporan mengikuti zona waktu profil.

Layanan server membatasi data privat berdasarkan pengguna yang sedang masuk. Sesi menggunakan cookie bertanda tangan dengan atribut `HttpOnly`. Akses lampiran diperiksa oleh rute privat, dan koreksi ledger memiliki jejak audit.

| Lokasi | Tanggung jawab |
| --- | --- |
| [`src/app/`](src/app) | Halaman, rute API, autentikasi, dan manifest aplikasi web. |
| [`src/components/`](src/components) | Komponen antarmuka, navigasi, dan grafik. |
| [`src/lib/finance/`](src/lib/finance) | Perhitungan trade, risiko, compounding, Monte Carlo, utang, dan withdrawal. |
| [`src/server/`](src/server) | Layanan domain, transaksi database, autentikasi, impor MT5, dan integrasi. |
| [`prisma/`](prisma) | Skema, migrasi, seed instrumen referensi, dan data demo untuk pengujian. |
| [`tests/`](tests) dan [`e2e/`](e2e) | Tes unit dan integrasi Vitest serta pengujian browser Playwright. |

## Pengujian

```sh
npm run lint
npm run typecheck
npm run test
npm run build
```

Set `RUN_DB_TESTS=1` dan arahkan `DATABASE_URL` ke database PostgreSQL pengujian yang telah dimigrasikan untuk menyertakan tes integrasi database.

Untuk Playwright, gunakan database loopback terpisah bernama `horizon_journal_google_test`. Setelah build tersedia, contoh berikut menjalankan suite dengan PostgreSQL dari Compose lokal. Jalankan `createdb` saat membuat database uji untuk pertama kali.

```powershell
docker compose exec -T postgres createdb -U mdtp horizon_journal_google_test
$env:DATABASE_URL = 'postgresql://mdtp:mdtp@127.0.0.1:5433/horizon_journal_google_test?schema=public'
$env:APP_ORIGIN = 'http://localhost:3210'
$env:AUTH_SECRET = node -e "console.log(require('node:crypto').randomBytes(32).toString('base64'))"
npm run db:deploy
npm run db:seed:demo
npx playwright install chromium
npm run e2e
```

Playwright menjalankan build produksi pada port `3210` dan membuat sesi dari fixture sintetis. Suite visual juga menulis tangkapan layar ke `e2e/visual/`.

Jalankan `npm run e2e -- e2e/ai-journal.spec.ts` untuk memeriksa AI Journal Insights dengan penyedia tiruan. Set `AI_JOURNAL_E2E_MODE=disabled` untuk memeriksa kondisi tanpa konfigurasi AI, atau `AI_JOURNAL_E2E_MODE=live` untuk menguji akun sintetis dengan penyedia yang dikonfigurasi.

GitHub Actions menjalankan lint, pemeriksaan tipe, tes Vitest dengan PostgreSQL, serta build. Pipeline rilis turut menjalankan Playwright.

## Deployment dan pemeliharaan

Deploy dengan [`docker-compose.prod.yml`](docker-compose.prod.yml), yang menjalankan aplikasi, PostgreSQL 16, dan Nginx. Siapkan kredensial database dan login pada server, gunakan volume persisten untuk database dan lampiran, lalu jalankan migrasi dan seed referensi sebelum membuka akses publik. Nginx dipublikasikan ke loopback pada port `8080` secara default. Reverse proxy di host menangani HTTPS.

Gunakan `GET /api/health` untuk memeriksa koneksi database. Endpoint mengembalikan HTTP `200` saat database dapat diakses dan `503` saat koneksi gagal. Untuk deployment baru atau migrasi dari sistem login lama, ikuti panduan deployment yang menjelaskan penggunaan database kosong dan prosedur cutover. [Panduan deployment](docs/deployment/google-sign-in.md)

- [Skema database, backup, dan restore](DATABASE.md)
- [Changelog](CHANGELOG.md), [proses rilis](RELEASES.md), dan [rilis GitHub](https://github.com/ardani17/journalfx/releases)
