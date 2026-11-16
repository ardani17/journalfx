# Prompt handoff untuk GLM — Google login JournalFX

Salin teks berikut ke AI agent GLM yang mempunyai akses repository.

```text
Tugasmu adalah mengimplementasikan Google login untuk repository
https://github.com/ardani17/journalfx berdasarkan dokumen:
docs/superpowers/plans/2026-11-16-google-oauth-glm.md

Baca dokumen itu lengkap, instruksi repository, dan kode auth yang dirujuk.
Mulai dengan ringkasan desain untuk persetujuan pemilik sebelum mengubah kode.
Setelah disetujui, kerjakan Task 1 sampai Task 8 secara berurutan.

Pertahankan custom session JWT existing dan login email/password.
Personal workspace hanya dapat diakses owner yang telah diizinkan.
Penautan Google pertama membutuhkan session owner dan konfirmasi password.
Gunakan stable provider issuer+subject; jangan auto-link berdasarkan email.
Login Google tidak membuat User/Project/ledger baru.

Untuk setiap task: tulis tes yang menguji perilaku nyata, jalankan hingga gagal,
implementasikan perubahan minimum, jalankan hingga lulus, review diff,
dan commit hanya file yang termasuk task tersebut. Update checklist kemajuan.
Jika konteks habis, tulis task terakhir, bukti tes, keputusan dan langkah
berikutnya dalam catatan handoff; lanjutkan tanpa mengulang pekerjaan selesai.

Gunakan mock provider lokal untuk automated OAuth E2E dan database fixture
terisolasi. Lakukan cleanup hanya pada fixture yang kamu buat.
Kredensial Google Cloud dan domain VPS diperoleh dari operator lewat env,
bukan ditebak atau ditulis di source/Linear/log. Real Google consent dan MFA
dilakukan operator. Pisahkan hasil automated test dari real Google/VPS smoke.

Jika dokumen dan kode terbaru berbeda, catat perbedaannya lalu sesuaikan
implementasi dengan kontrak dan tujuan yang sama; jelaskan keputusan itu.
Jangan mengganti seluruh auth stack atau mengubah modul finansial tanpa alasan
yang dibuktikan tes. Jangan menonaktifkan Secure cookie produksi untuk tes.

Hasil akhir: daftar commit/file, migration, jumlah dan hasil tes aktual,
screenshot tanpa data pribadi, runbook env/deploy/rollback, serta item
operator yang masih pending. Update ARD-256 bila akses Linear tersedia.
Push/release/deploy membutuhkan otorisasi sesi pelaksanaan yang sesuai.
```
