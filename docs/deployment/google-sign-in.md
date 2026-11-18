# Login Google dan deployment Horizon Journal

## Google Auth Platform

1. Gunakan proyek Google Auth Platform yang berbeda untuk lokal dan produksi. Buat client OAuth bertipe **Web application** di masing-masing proyek.
2. Daftarkan `http://localhost:3000/api/auth/google/callback` untuk lokal dan `https://journalfx.my.id/api/auth/google/callback` untuk produksi. Isi origin aplikasi dengan skema dan host yang sama, tanpa path.
3. Untuk produksi pilih audiens **External**, isi nama Horizon Journal dan email bantuan, serta daftarkan `https://journalfx.my.id/` dan `https://journalfx.my.id/privacy` pada branding. Tinjau juga `https://journalfx.my.id/terms` sebelum publikasi. Lengkapi verifikasi domain dan branding yang diminta Google, lalu ubah status menjadi **In production**. Gunakan scope `openid email profile`.
4. Set `APP_ORIGIN`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `AUTH_SECRET` dan `PUBLIC_SUPPORT_EMAIL` di lingkungan server. Buat `AUTH_SECRET` berbeda untuk setiap lingkungan dengan `openssl rand -base64 32`. Simpan rahasia di `.env` privat atau pengelola rahasia VPS.

[Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect) · [Persyaratan produksi Google](https://developers.google.com/identity/verification/authentication-policy-compliance)

## Lokal dan database pengujian

- Buat database kosong `horizon_journal_google_local` di PostgreSQL lokal. Arahkan `DATABASE_URL` ke database tersebut, gunakan direktori lampiran baru, jalankan `npm run db:deploy`, `npm run db:seed:reference`, dan `npm run dev`. Login pertama membuat jurnal dengan saldo nol.
- Untuk data contoh, buat database loopback `horizon_journal_google_test`, jalankan migrasi, lalu `npm run db:seed:demo`. Fixture ini memiliki identitas Google sintetis. Playwright membuat sesi dari fixture melalui helper pengujian dengan `AUTH_SECRET` dari server pengujian. Tes OAuth memverifikasi respons dari provider tiruan dengan ID token bertanda tangan.

## Produksi di aaPanel

1. Catat project Compose, DNS, pengaturan reverse proxy, serta volume database dan lampiran lama. Simpan backup dan pertahankan volume lama sebagai arsip. Migrasi Google-only memakai database kosong dan menolak database yang sudah memiliki pengguna.
2. Buat deployment terpisah dengan project Compose `horizon-journal-google`. Di `.env` produksi, set `POSTGRES_DB=horizon_journal_google`, buat `POSTGRES_PASSWORD` dengan `openssl rand -hex 32`, dan set konfigurasi Google di atas. Pastikan port loopback `8080` tersedia atau set `PUBLISHED_PORT` ke port yang disiapkan di aaPanel.
3. Dari direktori rilis jalankan perintah di bawah. Compose memberi volume baru dengan nama project terpisah.

   ```sh
   docker compose -p horizon-journal-google -f docker-compose.prod.yml up -d --wait postgres
   docker compose -p horizon-journal-google -f docker-compose.prod.yml build app
   docker compose -p horizon-journal-google -f docker-compose.prod.yml run --rm app npm run db:deploy
   docker compose -p horizon-journal-google -f docker-compose.prod.yml run --rm app npm run db:seed:reference
   docker compose -p horizon-journal-google -f docker-compose.prod.yml up -d --wait
   ```

4. Di aaPanel, arahkan reverse proxy `journalfx.my.id` ke port loopback deployment dan pasang sertifikat origin valid. Hilangkan query callback OAuth dari access log reverse proxy. Di Cloudflare, periksa origin, TLS, dan rule cache. Gunakan HTTPS hingga origin dan lewati cache untuk halaman serta API dinamis.
5. Verifikasi `/api/health` dari loopback dan dari `https://journalfx.my.id`, lalu uji login Google, jurnal kosong, login ulang, dan logout. Jika cutover gagal, pulihkan konfigurasi reverse proxy dan deployment yang dicatat di langkah pertama. Simpan volume baru untuk diagnosis.
