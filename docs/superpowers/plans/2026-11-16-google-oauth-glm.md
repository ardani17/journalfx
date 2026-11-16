# Google OAuth untuk JournalFX — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.
>
> Untuk GLM yang tidak menyediakan skill tersebut: kerjakan checklist secara berurutan dalam satu agent, dengan siklus tes gagal → implementasi → tes lulus → review diff → commit. Nama skill di atas bukan API yang harus dibuat. Dokumen ini adalah usulan implementasi untuk direview; persetujuan desain menjadi gate sebelum perubahan kode aplikasi.

**Goal:** Pemilik workspace dapat menautkan Google secara aman, kemudian login menggunakan Google tanpa memasukkan password lokal setiap kali login.

**Architecture:** Tambahkan Google OpenID Connect authorization-code flow menggunakan `openid-client` di Node runtime. Pertahankan cookie JWT `mdtp_session`, `requireUser()`, dan seluruh ownership berbasis `User.id`. Penautan pertama memerlukan session pemilik dan konfirmasi password; login berikutnya memakai pasangan issuer dan subject yang sudah tertaut.

**Tech Stack:** Next.js App Router 15, TypeScript, Prisma 6/PostgreSQL, jose, bcryptjs, Zod, openid-client 6.8.9, Vitest, Playwright, Docker Compose.

## Global Constraints

- Repository: https://github.com/ardani17/journalfx; Linear: ARD-256, proyek MDTP/P-ARD-6.
- Baseline yang diperiksa: commit `19eb3cc`; verifikasi ulang HEAD saat mulai karena repository dapat berubah.
- Implementasi ini menambah metode masuk untuk personal workspace; registrasi publik dan onboarding lewat Google berada di luar scope.
- Login email/password, data keuangan, ledger, timezone, dan `User.id` existing dipertahankan.
- Password lokal tetap menjadi jalur pemulihan. `User.passwordHash` tetap required; tidak ada akun baru otomatis dari callback Google.
- Identitas Google memiliki key `(issuer, subject)`; email hanya atribut dan kebijakan allowlist, bukan bukti penautan akun existing.
- Penautan pertama memerlukan pemilik sudah login, password valid, dan Google email terverifikasi dalam allowlist server.
- Token Google, code, password, client secret, cookie, PKCE verifier, dan raw callback URL tidak masuk log, audit JSON, commit, screenshot, atau Linear.
- Callback hanya membuat session setelah validasi protokol dan kebijakan aplikasi selesai.
- API provider hanya dijalankan di Node runtime, bukan Edge middleware. Middleware cukup mengizinkan dua path publik secara exact-match.
- Tidak mengubah dependency lain atau arsitektur autentikasi tanpa kebutuhan yang terbukti oleh tes.
- Tidak melakukan login Google nyata, konfigurasi Google Cloud, push Git, perubahan kredensial, atau deploy VPS tanpa otorisasi yang sesuai pada sesi pelaksanaan.

## 1. Konteks yang wajib dibaca GLM

| File | Fakta relevan |
| --- | --- |
| `src/lib/session.ts` | `signSession`, `verifySession`, cookie `mdtp_session`, TTL 30 hari, secure ketika production. |
| `src/server/auth.ts` | `getSessionUser()` membaca JWT lalu memuat user; `requireUser()` menolak tanpa autentikasi. |
| `src/server/services/users.ts` | Login bcrypt; onboarding ditutup setelah user pertama ada. |
| `prisma/schema.prisma` | `User.email` unique; `passwordHash` required; belum ada tabel provider identity. |
| `src/middleware.ts` | Public API memakai Set exact-match; callback OAuth saat ini akan ditolak. |
| `src/app/(auth)/login/page.tsx` | Redirect ke onboarding jika belum ada user, dan dashboard jika sudah login. |
| `src/app/(auth)/login/login-form.tsx` | Form email/password; belum menerima status/error Google. |
| `src/app/(app)/settings/page.tsx` | Server page yang dapat memuat status penautan Google. |
| `src/server/audit.ts` | Audit menangkap error internal; jangan mengirim objek provider/token sebagai `after`. |
| `next.config.mjs` | CSP same-origin; redirect top-level ke Google tidak memerlukan melonggarkan script-src. |
| `nginx/nginx.conf` | Host/forwarded headers; jangan membentuk callback URL dari header request. |
| `playwright.config.ts` | Production E2E port 3210; tes OAuth perlu origin dan fixture khusus. |
| `docs/verification-2026-11-16.md` | Baseline 93 tes unit/integrasi dan 13 E2E; keterbatasan coverage terdokumentasi. |

### Pilihan pendekatan

1. **Dipilih: openid-client + session existing.** Perubahan terbatas pada Google flow, persistence identity/attempt, UI login/settings, dan konfigurasi. Seluruh endpoint finansial tetap memakai session yang sama.
2. Migrasi keseluruhan ke Auth.js. Layak sebagai pekerjaan terpisah, tetapi memperbesar perubahan session, middleware, credentials, dan migration untuk kebutuhan satu provider.
3. Google Identity Services di browser. Memerlukan jalur browser/CSP dan validasi credential tambahan; tidak dipilih untuk rencana server authorization-code ini.

Ini keputusan desain usulan, bukan klaim bahwa aplikasi sudah memakai Auth.js. GLM harus mempertahankan keputusan ini kecuali reviewer meminta perubahan.

## 2. Perilaku produk dan keputusan akses

### Pertama kali menautkan

1. Pemilik login email/password seperti biasa.
2. Buka Settings → Akun Google → Hubungkan Google.
3. Masukkan password saat ini; submit POST same-origin ke link route.
4. Server memverifikasi session/password, menyiapkan flow intent `LINK`, dan redirect ke Google.
5. Callback memverifikasi state, browser binding, expiry, PKCE, nonce dan ID token.
6. Callback memastikan session masih session yang memulai proses, pemilik masih ada, password tidak berubah, Google email verified dan diizinkan.
7. Simpan identity untuk `User.id` yang sama secara atomik. Redirect ke `/settings?google=linked`; jangan membuat project, ledger, user, atau deposit baru.

### Login berikutnya

1. Klik “Masuk dengan Google” pada `/login`.
2. Google flow intent `LOGIN` dijalankan dengan transaksi sekali pakai.
3. Setelah verifikasi, cari identity berdasarkan issuer dan subject.
4. Identity yang sudah tertaut dan masih memenuhi kebijakan menghasilkan JWT existing melalui `signSession()`; redirect tetap `/dashboard`.
5. Identity belum tertaut ditolak. Tampilkan petunjuk login email/password lalu hubungkan Google di Settings.

### Putuskan koneksi

Pemilik memerlukan session aktif dan konfirmasi password lagi. DELETE link route menghapus identity, mengaudit metadata aman, dan membatalkan attempt LINK terkait. Password login tetap tersedia. Session aplikasi yang sudah ada mengikuti TTL existing; unlink mencegah login Google baru, bukan mencabut seluruh JWT existing. UI menjelaskan bahwa logout tetap diperlukan pada perangkat yang ingin ditutup.

### Batasan eksplisit

- Satu Google identity per user untuk rilis ini.
- Google email boleh berbeda dari email login lokal, selama pemilik melakukan penautan terautentikasi dan alamat Google ada dalam allowlist.
- Perubahan email Google tidak mengubah `User.email` secara otomatis.
- Allowlist berlaku saat link dan login; jika email provider berubah di luar allowlist, login Google ditolak dan password tetap dapat dipakai untuk pemulihan.
- Satu flow aktif per browser. Membuka flow kedua mengganti cookie flow pertama; callback pertama kemudian gagal secara terkendali.
- Callback tidak menerima return URL bebas. Tujuan hanya `/dashboard`, `/settings`, dan `/login` dengan kode pesan yang diketahui.

## 3. Kontrak antarmodul

Semua nama berikut adalah kontrak yang harus konsisten antar task.

```ts
type GoogleIntent = "LOGIN" | "LINK";
type GoogleConfig = {
  clientId: string; clientSecret: string; appOrigin: string;
  redirectUri: string; allowedEmails: ReadonlySet<string>;
};
type VerifiedGoogleIdentity = {
  issuer: "https://accounts.google.com";
  subject: string; email: string; emailVerified: true;
};
type GoogleFlow = {
  id: string; state: string; nonce: string; verifier: string;
  intent: GoogleIntent; ownerId: string | null;
};
type GoogleLinkStatus = { configured: boolean; linked: boolean; emailMasked: string | null };
type GoogleFailureCode =
  | "google_unavailable" | "google_cancelled" | "google_expired"
  | "google_invalid_response" | "google_not_allowed" | "google_not_linked"
  | "google_link_conflict" | "google_reauthentication_required";
```

| Module | Interface |
| --- | --- |
| `src/server/google/config.ts` | `getGoogleConfig(): GoogleConfig \| null`; `isGoogleEmailAllowed(email: string, config: GoogleConfig): boolean`. Null ketika konfigurasi disabled/tidak lengkap. |
| `src/server/google/oidc.ts` | `buildGoogleAuthorizationUrl(flow: GoogleFlow, config: GoogleConfig): Promise<URL>`; `exchangeGoogleCode(url: URL, flow: GoogleFlow, config: GoogleConfig): Promise<VerifiedGoogleIdentity>`. |
| `src/server/google/flow.ts` | `createGoogleFlow(input: { intent: GoogleIntent; ownerId: string \| null; sessionToken: string \| null; passwordHash: string \| null }, config: GoogleConfig): Promise<{ flow: GoogleFlow; browserSecret: string }>`; `consumeGoogleFlow(input: { state: string; browserSecret: string; sessionToken: string \| null }, config: GoogleConfig): Promise<GoogleFlow>`. |
| `src/server/google/identity.ts` | `linkGoogleIdentity(userId: string, identity: VerifiedGoogleIdentity, proof: { flowId: string; sessionToken: string }): Promise<void>`; `resolveGoogleUser(identity: VerifiedGoogleIdentity): Promise<{ id: string; email: string; name: string }>`; `unlinkGoogleIdentity(userId: string): Promise<void>`; `getGoogleLinkStatus(userId: string): Promise<GoogleLinkStatus>`. |
| `src/server/google/http.ts` | Exact-origin POST/DELETE guard, cookie set/clear helpers, dan mapping failure ke redirect aman. Jangan menaruh provider exchange di file ini. |
| `src/lib/google-auth-messages.ts` | Mapping kode kegagalan ke pesan Bahasa Indonesia, tanpa dependency server/secret. |

`types.ts` di folder `src/server/google/` mendefinisikan tipe shared server di atas. Gunakan `import type` ketika client hanya memerlukan tipe status; `GoogleConfig` tidak pernah dipass sebagai prop UI.

## 4. Task 1 — Konfigurasi dan adapter OIDC

**Create:** `src/server/google/types.ts`, `config.ts`, `oidc.ts`; `tests/auth/google-config.test.ts`, `google-oidc.test.ts`.
**Modify:** `package.json`, `package-lock.json`, `.env.example`.
**Consumes:** session existing tetap utuh; kontrak bagian 3.
**Produces:** config tervalidasi, URL authorize, identity provider tervalidasi.

- [ ] Catat `git status`, HEAD, versi Node, dan jalankan baseline tests sebelum mengubah dependency. Buat branch `feature/ARD-256-google-oauth` dari main terbaru; pertahankan perubahan lain jika workspace tidak bersih.
- [ ] Tulis tes config: disabled → null; config parsial → null; allowlist kosong → null; origin berpath/query/credentials atau HTTP produksi → null; localhost HTTP hanya non-production; email dibandingkan trim/lowercase exact, tanpa menghapus titik/plus pada Gmail.
- [ ] Jalankan `npx vitest run tests/auth/google-config.test.ts`; simpan hasil gagal sebagai baseline task.
- [ ] Tambah dependency exact dengan `npm install --save-exact openid-client@6.8.9`; review lockfile untuk platform optional dan unrelated version churn.
- [ ] Implementasikan config dari environment berikut. Jangan melakukan provider discovery saat `next build` atau module import.

```dotenv
GOOGLE_AUTH_ENABLED=false
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_ALLOWED_EMAILS=
APP_ORIGIN=http://localhost:3000
```

`APP_ORIGIN` adalah origin kanonis; redirect URI selalu `new URL('/api/auth/google/callback', APP_ORIGIN)`. Produksi wajib HTTPS. Endpoint issuer tetap `https://accounts.google.com`; tidak configurable lewat request. Config status boleh dimuat server page; nilai rahasia tetap server-only.

- [ ] Implementasikan adapter berdasarkan API versi yang dipin. Cache discovery dalam proses, timeout 10 detik, buang cache promise saat discovery gagal agar request selanjutnya bisa mencoba lagi. Jangan membuat fetch terhadap URL dari input user.

```ts
import * as client from "openid-client";
const configuration = await client.discovery(
  new URL("https://accounts.google.com"), config.clientId,
  undefined, client.ClientSecretPost(config.clientSecret),
  { timeout: 10, execute: [client.enableNonRepudiationChecks] },
);
const authorizationUrl = client.buildAuthorizationUrl(configuration, {
  redirect_uri: config.redirectUri,
  scope: "openid email profile", response_type: "code",
  state: flow.state, nonce: flow.nonce,
  code_challenge: await client.calculatePKCECodeChallenge(flow.verifier),
  code_challenge_method: "S256", prompt: "select_account",
});
const tokens = await client.authorizationCodeGrant(configuration, callbackUrl, {
  pkceCodeVerifier: flow.verifier,
  expectedState: flow.state,
  expectedNonce: flow.nonce,
  idTokenExpected: true,
});
const claims = tokens.claims();
```

Library harus memverifikasi signature/issuer/audience/expiry dan checks di atas; jangan decode JWT tanpa verifikasi. Adapter kemudian mensyaratkan `sub` nonempty, email string, `email_verified === true`. Canonicalize issuer Google yang tervalidasi ke konstanta identity. Token tidak disimpan atau dikembalikan ke route/client. Tidak meminta offline access/refresh token.

- [ ] Tes authorize URL memuat scope/state/nonce/S256/callback kanonis. Tes exchange menolak missing ID token, invalid signature/audience/issuer/expiry/nonce/state, verified=false, missing email/sub, serta timeout provider. Gunakan test transport/injection lokal; jangan menghubungi Google di unit test.
- [ ] Jalankan kedua file tes, typecheck, dan review dependency runtime Node. Commit task setelah lulus: `feat(auth): add Google OIDC configuration and verified identity adapter`.

## 5. Task 2 — Schema dan flow sekali pakai

**Modify:** `prisma/schema.prisma`; migration baru dalam `prisma/migrations/`.
**Create:** `src/server/google/flow.ts`, `tests/auth/google-flow.test.ts`, `tests/auth/google-flow.integration.test.ts`.
**Consumes:** config/types task 1; AUTH_SECRET existing.
**Produces:** attempt browser-bound yang bisa dikonsumsi tepat sekali, termasuk untuk beberapa instance VPS.

- [ ] Tulis tes yang menolak expired attempt, cookie hilang/salah, state salah, replay sequential/concurrent, intent LINK tanpa session yang sama, pemilik berganti, password berubah, dan attempt kedua yang mengganti browser cookie.
- [ ] Buat model berikut dan relasi `googleIdentities GoogleIdentity[]` serta `googleAttempts GoogleOAuthAttempt[]` pada User. `ownerId` attempt bersifat nullable untuk LOGIN.

```prisma
model GoogleIdentity {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  issuer    String
  subject   String
  email     String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@unique([issuer, subject])
  @@unique([userId, issuer])
}

model GoogleOAuthAttempt {
  id                     String   @id @default(cuid())
  stateHash              String   @unique
  browserHash            String
  nonce                  String
  verifierEncrypted      String
  intent                 String
  ownerId                String?
  owner                  User?    @relation(fields: [ownerId], references: [id], onDelete: Cascade)
  sessionHash            String?
  ownerPasswordHashProof String?
  expiresAt              DateTime
  consumedAt             DateTime?
  createdAt              DateTime @default(now())
  @@index([expiresAt])
  @@index([ownerId, intent])
}
```

- [ ] Generate migration di database development/test: `npx prisma migrate dev --name google_oauth_identity_attempt`. Review SQL: hanya tabel/constraint/index/relasi baru; semua tabel finansial tetap utuh. Gunakan `prisma migrate deploy` di staging/production; jangan reset database.
- [ ] Generate random state/nonce/browserSecret minimal 32 bytes entropy; gunakan `client.randomPKCECodeVerifier()` untuk verifier. TTL attempt **10 menit**; cookie `mdtp_google_flow`, HttpOnly, SameSite=Lax, Secure di production, Path=/api/auth/google, maxAge=600, tanpa Domain.
- [ ] Simpan SHA-256 state/browserSecret/sessionToken. Untuk LINK simpan hash ber-domain-separation dari passwordHash existing sebagai proof versi kredensial; password asli tidak disimpan. Encrypt verifier sebagai JWE `dir`/`A256GCM` menggunakan 32-byte SHA-256-derived key dari AUTH_SECRET dengan label `journalfx-google-oauth-v1` dan expiry yang sama.
- [ ] `consumeGoogleFlow` mencari stateHash, memeriksa browserHash dan expiry, dan untuk LINK memverifikasi JWT/session user serta password proof. Dalam transaksi gunakan `updateMany` dengan `id`, `consumedAt: null`, `expiresAt: { gt: now }`; hanya count=1 yang boleh melanjutkan. Mark consumed sebelum provider exchange; kegagalan provider berarti pengguna memulai flow baru.
- [ ] Callback dengan state/browser yang tidak cocok tidak boleh mengonsumsi flow lain. Hapus flow cookie hanya bila request merujuk flow browser yang sedang aktif, atau flow aktif itu expired. Jangan menghapus cookie session existing karena login Google gagal.
- [ ] Tambahkan cleanup bounded: pada create flow hapus maksimal batch 100 attempt yang expired lebih dari 24 jam atau consumed lebih dari 24 jam; data attempt aktif tetap utuh. Tes cleanup hanya memakai fixture.
- [ ] Jalankan unit+integration flow; dua consume bersamaan menghasilkan tepat satu keberhasilan. Commit: `feat(auth): persist one-time browser-bound Google OAuth attempts`.

## 6. Task 3 — Penautan identity dan kebijakan personal workspace

**Create:** `src/server/google/identity.ts`, `tests/auth/google-identity.integration.test.ts`.
**Consumes:** verified identity adapter dan schema baru.
**Produces:** resolve existing owner, link idempotent, unlink aman, masked status.

- [ ] Tulis test fixture dua user terisolasi, tanpa memakai akun pribadi. Cover same email/different subject, same subject/already-owned-other-user, duplicate concurrent link, unlinked login, perubahan email, allowlist dicabut, dan jumlah User/Project/AccountTransaction tetap sebelum/sesudah login.
- [ ] Terapkan allowlist exact normalized dan verified=true sebelum link maupun login. Identity lookup hanya `issuer_subject`, bukan fallback `User.email`.

```ts
const linked = await prisma.googleIdentity.findUnique({
  where: { issuer_subject: { issuer: identity.issuer, subject: identity.subject } },
  include: { user: { select: { id: true, email: true, name: true } } },
});
```

- [ ] Link memakai transaction dan unique constraints sebagai otoritas. Link subject sama ke user sama boleh idempotent; subject yang sudah milik user lain dan user yang sudah punya subject berbeda menghasilkan `google_link_conflict`, tanpa reassignment.
- [ ] Pada transaksi link, muat attempt menggunakan `proof.flowId`, pastikan intent LINK, ownerId cocok, consumedAt terisi dan belum expired; recheck hash session dan passwordHashProof dari user yang sama. Attempt yang dibatalkan/dihapus saat logout atau unlink tidak dapat dipakai untuk menyelesaikan link. Gunakan lock per owner yang sama untuk link/unlink agar kedua mutasi mempunyai urutan pasti.
- [ ] LOGIN gagal jika identity tidak ditemukan. Jangan memanggil `onboard()`, `user.create`, atau project/ledger initialization dari callback.
- [ ] Unlink hanya target `userId` dari `requireUser`; hapus attempt LINK milik user. Audit success menyimpan intent/userId/action dan provider saja; simpan email provider di tabel identity, bukan token response di audit.
- [ ] `getGoogleLinkStatus` hanya mengembalikan configured/linked/emailMasked. Contoh masking email `o***@example.com`; subject/token/secret tidak masuk response.
- [ ] Jalankan integrasi dengan `RUN_DB_TESTS=1`, cleanup fixture melalui ID yang dibuat test, lalu commit: `feat(auth): link Google identity to the existing workspace owner`.

## 7. Task 4 — HTTP routes dan session bridge

**Create:** `src/server/google/http.ts`; routes `src/app/api/auth/google/start/route.ts`, `callback/route.ts`, `link/route.ts`, `status/route.ts`; `tests/auth/google-routes.test.ts`.
**Modify:** `src/middleware.ts`, `src/app/api/auth/logout/route.ts`.
**Consumes:** task 1–3 dan `signSession`, `sessionCookieOptions`, `requireUser`, `verifyPassword` existing.
**Produces:** HTTP contract berikut.

| Endpoint | Access / response |
| --- | --- |
| GET `/api/auth/google/start` | Publik; configured → 303 Google authorization URL + flow cookie; disabled → 303 `/login?error=google_unavailable`. |
| GET `/api/auth/google/callback` | Publik; valid LOGIN → session cookie + 303 dashboard; valid LINK → 303 settings; failure → fixed local redirect dengan kode aman. |
| POST `/api/auth/google/link` | Authenticated + Origin exact `APP_ORIGIN` + JSON `{currentPassword}`; verify password; return `{ok:true,data:{authorizationUrl}}` + flow cookie. |
| DELETE `/api/auth/google/link` | Authenticated + Origin exact + JSON `{currentPassword}`; unlink current user; return `{ok:true,data:{linked:false}}`. |
| GET `/api/auth/google/status` | Authenticated; `{ok:true,data:GoogleLinkStatus}`; no-store. |

- [ ] Mulai dengan route tests yang gagal: middleware memblokir start/callback, callback invalid belum terkelola, foreign-origin link, missing session, password salah, unknown provider user, replay dan callback URL injection.
- [ ] Tambahkan hanya exact `/api/auth/google/start` dan `/api/auth/google/callback` ke PUBLIC_API. Jangan menjadikan seluruh `/api/auth` atau `/api/auth/google/*` publik.
- [ ] Set `export const runtime = 'nodejs'` dan dynamic/no-store pada routes Google. POST/DELETE origin hilang atau mismatch → 403; password invalid → 401 generic. Batasi body password 128 karakter dengan Zod; jangan merekam body.
- [ ] Bangun current callback URL dari `config.redirectUri` lalu salin query searchParams request yang sudah di-whitelist (`code`, `state`, `error`, `error_description`, `scope`, `authuser`, `prompt`, `iss` jika provider mengirimkannya). Tolak duplicate `code`/`state`/`error`, input query >8 KB, serta `code` dan `error` bersamaan. Hapus error_description dari semua log/display.
- [ ] Konsumsi flow dan browser binding sebelum memperlakukan provider `access_denied` sebagai cancelled. Untuk LINK, cek session/password proof sebelum exchange dan recheck di transaksi penautan untuk race dengan logout/ubah password. Browser logout membersihkan flow cookie dan membatalkan LINK attempt yang terikat session tersebut.
- [ ] Setelah exchange gunakan `resolveGoogleUser()` atau `linkGoogleIdentity()` sesuai intent. Link callback yang sudah kehilangan session → `/login?error=google_reauthentication_required`; tidak menautkan ke user baru yang kebetulan sedang login.

```ts
const user = await resolveGoogleUser(identity);
const token = await signSession({ sub: user.id, email: user.email, name: user.name });
const response = NextResponse.redirect(new URL("/dashboard", config.appOrigin), 303);
response.cookies.set(SESSION_COOKIE, token, sessionCookieOptions);
response.headers.set("Cache-Control", "no-store");
response.headers.set("Referrer-Policy", "no-referrer");
```

- [ ] Tambahkan rate limit bersama berbasis reverse proxy untuk start/link/callback (task 7), dan unit test error tanpa mengungkap secret. Jangan menambahkan in-memory rate limiter lalu mengklaim aman untuk multi-instance.
- [ ] Jalankan route+middleware tests, login existing, status, logout; commit: `feat(auth): expose Google sign-in and protected linking routes`.

## 8. Task 5 — UI login dan Settings

**Create:** `src/lib/google-auth-messages.ts`; `src/app/(app)/settings/google-auth-section.tsx`; `public/google-g.svg` memakai asset Google resmi; `tests/auth/google-ui.test.ts` jika framework render test memang sudah tersedia.
**Modify:** `src/app/(auth)/login/page.tsx`, `login-form.tsx`, `src/app/(app)/settings/page.tsx`.
**Consumes:** server status/task 4; `Button`, `Field`, `Input`, `Card` existing.
**Produces:** UI pengguna tanpa secret dan tanpa perubahan form credentials.

- [ ] Server login page menerima searchParams, memakai whitelist GoogleFailureCode, serta mengirim `googleEnabled` dan safe message ke LoginForm. Pertahankan redirect dashboard/onboarding yang sudah ada.
- [ ] Tambahkan tombol HTML “Masuk dengan Google” menuju start route, di luar submit email/password atau `type=button`. Gunakan approved logo/color/layout Google, label terbaca, keyboard focus dan loading state. Disabled config menyembunyikan tombol; login lokal tetap normal.
- [ ] Status Settings: tidak dikonfigurasi → penjelasan konfigurasi operator tanpa form secret; configured+unlinked → Hubungkan Google; linked → masked email + Putuskan koneksi. Input password dipakai untuk POST/DELETE, dibersihkan setelah request, tidak ditaruh query/localStorage.
- [ ] POST link menghasilkan authorizationUrl dari server; gunakan full browser navigation. Jangan menerima URL dari input user atau membentuk OAuth URL di client.
- [ ] Error mapping wajib: unavailable → “Login Google belum tersedia”; cancelled → “Login Google dibatalkan”; expired → “Sesi login Google kedaluwarsa. Silakan coba lagi”; invalid response → “Login Google tidak dapat diverifikasi”; not allowed → “Akun Google ini tidak diizinkan”; not linked → “Masuk dengan email dan password, lalu hubungkan Google di Pengaturan”; conflict → “Akun Google tidak dapat dihubungkan”; reauthentication → “Silakan masuk kembali sebelum menghubungkan Google”.
- [ ] Tambahkan tes Playwright UI di task 6; jangan memasang React test framework baru hanya untuk memeriksa teks statis. Review desktop 1440/1280 dan mobile 390 px, error role=alert, keyboard, dan no horizontal overflow. Commit: `feat(auth): add Google login and account connection settings`.

## 9. Task 6 — Tes protokol, integrasi, dan E2E deterministik

**Create:** `e2e/google-auth.spec.ts`, `e2e/fixtures/oidc-provider.ts`, `playwright.google.config.ts`.
**Modify:** `.github/workflows/ci.yml` hanya untuk quality gate yang dapat berjalan tanpa kredensial Google nyata.
**Consumes:** task 1–5.
**Produces:** bukti otomatis terpisah dari uji Google nyata.

- [ ] Implementasikan provider fixture lokal yang mengeluarkan discovery/JWKS/authorization/token menggunakan key test, code sekali pakai, dan ID token RS256. Fixture harus benar-benar memeriksa redirect URI, PKCE S256, code reuse, dan nonce.
- [ ] Inject fixture transport pada batas adapter; production issuer tetap Google. Jika server E2E memakai endpoint HTTP loopback, aktifkan hanya dalam proses tes dengan flag test khusus dan guard yang menolak startup jika flag itu aktif pada deployment normal. Jangan menyediakan environment production bebas untuk mengganti trusted issuer.
- [ ] Gunakan database khusus OAuth E2E, fixture user credentials synthetic melalui env E2E_EMAIL/E2E_PASSWORD, dan test cleanup yang hanya menghapus ID milik test. Jangan memakai atau memodifikasi akun keuangan pemilik.
- [ ] `playwright.google.config.ts` memakai port aplikasi 3211 dan provider loopback 4312; APP_ORIGIN harus `http://localhost:3211`. Untuk browser HTTP lokal gunakan **next dev** pada isolated test server, karena session cookie production existing Secure; uji cookie Secure secara terpisah pada production HTTPS atau assertion header route. Jangan melemahkan Secure production agar E2E HTTP lulus.
- [ ] Cover flow lengkap: password login → settings link → fake Google consent → callback → linked → logout → Google login → dashboard user yang sama → logout; verifikasi User/Project/ledger count tidak bertambah.
- [ ] Negative E2E: Google cancellation, unverified email, disallowed email, unlinked identity, expired/missing/wrong browser cookie, state tamper, nonce mismatch, wrong aud/iss/signature, reused callback, session berubah saat LINK, foreign-origin POST/DELETE, config disabled.
- [ ] PostgreSQL integration: dua consume callback bersamaan, dua link subject yang sama ke owner berbeda, link/unlink dengan attempt pending, data finansial tetap mempunyai userId asli. Pastikan semua worker memakai transactional compare-and-set dan unique constraint, bukan hanya mocked result.
- [ ] Jalankan perintah berikut dan simpan jumlah aktual; angka baseline adalah referensi minimum, bukan angka yang ditulis ulang sebagai hasil baru.

```powershell
npm run lint
npm run typecheck
$env:RUN_DB_TESTS='1'
npm run test
npx next build
npm run e2e
npx playwright test --config=playwright.google.config.ts
docker build -t journalfx:google-auth-verification .
```

Di Linux gunakan `RUN_DB_TESTS=1 npm run test`. Jika build Windows terkena lock Prisma DLL dari server existing, gunakan Docker Linux untuk full build dan dokumentasikan lingkungan; jangan mematikan proses lain secara sembarang.

- [ ] CI memakai PostgreSQL test dan synthetic OAuth fixture; Google client secret asli tidak diperlukan untuk automated tests. Jalankan `git diff --check`, cek secret tidak masuk staged diff, lalu commit: `test(auth): cover Google OAuth linking and callback failure paths`.

## 10. Task 7 — Runbook Google Cloud dan VPS

**Create:** `docs/deployment/google-oauth.md`.
**Modify:** `.env.example`, `nginx/nginx.conf`, `README.md`; compose hanya bila wiring environment memang diperlukan.
**Consumes:** endpoint dan config kanonis task 1–6.
**Produces:** langkah operator yang dapat dijalankan tanpa menaruh credential dalam repository.

- [ ] Tulis runbook operator: tentukan domain HTTPS aplikasi, buka Google Cloud project milik pemilik, isi branding/consent/audience sesuai jenis akun, buat OAuth client tipe Web application, masukkan redirect URI exact, dan tambah akun penguji jika aplikasi dalam testing mode. Agent tidak dapat menebak client ID/secret/domain produksi.
- [ ] Redirect URI development: `http://localhost:3000/api/auth/google/callback`. Production: origin HTTPS VPS aktual + `/api/auth/google/callback`. Contoh domain dokumentasi menggunakan `https://journalfx.example.com`; tandai jelas sebagai contoh, bukan konfigurasi produksi yang siap dipakai.
- [ ] Scopes hanya openid/email/profile. Untuk implementasi server redirect ini, jangan menambahkan Google JS SDK, Drive/Gmail scopes, refresh tokens, atau wildcard redirect URI.
- [ ] Instruksikan operator mengisi GOOGLE_AUTH_ENABLED, GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_ALLOWED_EMAILS, APP_ORIGIN di `.env` VPS. Server config memakai env runtime sehingga credential tidak diperlukan saat build image.
- [ ] Nginx: letakkan `limit_req_zone $binary_remote_addr zone=google_auth:10m rate=10r/m;` pada HTTP context yang sesuai. Tambahkan location exact untuk start/callback/link dengan `limit_req zone=google_auth burst=10 nodelay; limit_req_status 429; access_log off;` dan proxy headers existing. Callback access log tidak boleh menyimpan query code/state. Pastikan proxy location tetap meneruskan cookie dan body POST/DELETE.
- [ ] Origin kanonis dari environment menyelesaikan masalah TLS termination; jangan percaya arbitrary X-Forwarded-Host/Proto untuk callback. Runbook harus menjelaskan topologi aaPanel/TLS host → nginx container → app; secure cookie dilihat dari browser HTTPS.
- [ ] Uji `nginx -t` dalam container fixture; verifikasi limiter berlaku dan request ke route lain tidak terpengaruh. Hindari mengubah nginx produksi langsung sebagai bagian menulis kode.
- [ ] Siapkan rollback additive: set GOOGLE_AUTH_ENABLED=false dan recreate app; login password tetap berfungsi. Table identity/attempt dibiarkan ada untuk menjaga migration compatibility; jangan menghapus tabel atau restore database pribadi sebagai rollback fitur.
- [ ] Commit: `docs(auth): document Google Cloud setup and VPS rollout`.

## 11. Task 8 — Review, handoff, dan pembaruan tracker

**Create:** `docs/verification-google-oauth.md` berisi bukti aktual dari pelaksanaan.
**Modify:** `TASKS.md`, `CHANGELOG.md` sesuai hasil; ARD-256 di Linear bila akses tersedia.
**Consumes:** seluruh gate task sebelumnya.
**Produces:** hasil siap direview dan status yang tidak melebihkan bukti.

- [ ] Review diff untuk seluruh acceptance criteria bagian 2–10. Cek semua nama tipe/interface cocok dan setiap import Node/provider hanya berada di server routes/services.
- [ ] Buktikan database migration additive, provider secret tidak muncul di HTML/RSC/API/browser bundle, session user tetap User.id existing, dan izin akses endpoint finansial tetap sama.
- [ ] Tulis tabel hasil command, jumlah tes, commit SHA, screenshot desktop/mobile tanpa data pribadi, migration name, serta error yang masih tersisa. Pisahkan automated fixture PASS, real Google smoke PENDING/PASS, dan VPS deployment PENDING/PASS.
- [ ] Uji Google nyata memerlukan operator menyelesaikan consent di browser; jangan mengotomasi password/MFA Google. Setelah operator selesai, validasi email masked/identity linkage, userId konsisten, logout dan login ulang. Catat hasil tanpa token/code.
- [ ] Update ARD-256 dengan checklist dan link branch/commit/report. Workspace sebelumnya menolak issue baru karena free issue limit; jika masih demikian, update issue existing tanpa menghapus issue lain.
- [ ] Berikan reviewer file/commit, hasil tes, kebutuhan env, migration dan langkah deploy/rollback. Tandai implementasi selesai setelah automated gates lulus; tandai fitur produksi terverifikasi hanya setelah real Google + VPS smoke lulus.
- [ ] Push branch/PR hanya jika pengguna mengotorisasi pada sesi pelaksanaan. Jangan menganggap dokumen rencana ini sebagai izin deploy produksi.

## 12. Definition of Done

- [ ] Owner menautkan Google melalui session + konfirmasi password.
- [ ] Google login berikutnya menghasilkan session existing untuk owner yang sama.
- [ ] Unlinked/disallowed/unverified provider identity tidak memperoleh akses atau user baru.
- [ ] State/browser binding/PKCE/nonce dan ID token checks diuji, termasuk replay/concurrency.
- [ ] Password login dan seluruh ownership finansial tetap lulus regresi.
- [ ] Link/unlink/error flows dapat digunakan pada desktop/mobile.
- [ ] Konfigurasi missing tidak merusak password login atau build.
- [ ] Migration, CI, Docker, runbook Cloud/VPS dan rollback selesai diverifikasi.
- [ ] Status real Google smoke dan deployment dilaporkan terpisah dari hasil fixture otomatis.

## 13. Contoh tes konkret untuk memulai

Contoh pertama masuk `tests/auth/google-config.test.ts`. Tambahkan cases lain yang disebut di task terkait, dengan `vi.stubEnv` dan `vi.unstubAllEnvs` agar konfigurasi test tidak bocor antar file.

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { getGoogleConfig, isGoogleEmailAllowed } from "@/server/google/config";

afterEach(() => vi.unstubAllEnvs());
describe("Google configuration", () => {
  function enable() {
    vi.stubEnv("GOOGLE_AUTH_ENABLED", "true");
    vi.stubEnv("GOOGLE_CLIENT_ID", "fixture.apps.googleusercontent.com");
    vi.stubEnv("GOOGLE_CLIENT_SECRET", "synthetic-test-secret");
    vi.stubEnv("GOOGLE_ALLOWED_EMAILS", "owner@example.invalid");
    vi.stubEnv("APP_ORIGIN", "https://journalfx.example.com");
  }
  it("keeps password login available when Google is disabled", () => {
    vi.stubEnv("GOOGLE_AUTH_ENABLED", "false");
    expect(getGoogleConfig()).toBeNull();
  });
  it("uses only the configured canonical callback origin", () => {
    enable();
    expect(getGoogleConfig()?.redirectUri).toBe(
      "https://journalfx.example.com/api/auth/google/callback",
    );
  });
  it("matches allowlisted email exactly after normalization", () => {
    enable();
    const config = getGoogleConfig();
    expect(config).not.toBeNull();
    if (!config) throw new Error("Fixture configuration invalid");
    expect(isGoogleEmailAllowed(" OWNER@example.invalid ", config)).toBe(true);
    expect(isGoogleEmailAllowed("owner+other@example.invalid", config)).toBe(false);
    expect(isGoogleEmailAllowed("attacker@example.invalid", config)).toBe(false);
  });
});
```

Contoh race assertion untuk `google-flow.integration.test.ts` setelah fixture config tersedia melalui `getGoogleConfig()` dan env test dari contoh sebelumnya:

```ts
const config = getGoogleConfig();
if (!config) throw new Error("Google test configuration required");
const database = new URL(process.env.DATABASE_URL ?? "postgresql://invalid/none");
if (!database.pathname.endsWith("_test")) {
  throw new Error("OAuth integration requires a dedicated database ending in _test");
}
const created = await createGoogleFlow({
  intent: "LOGIN", ownerId: null, sessionToken: null, passwordHash: null,
}, config);
try {
  const request = { state: created.flow.state, browserSecret: created.browserSecret, sessionToken: null };
  const results = await Promise.allSettled([
    consumeGoogleFlow(request, config), consumeGoogleFlow(request, config),
  ]);
  expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
  expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
} finally {
  await prisma.googleOAuthAttempt.deleteMany({ where: { id: created.flow.id } });
}
```

Imports contoh race: `expect` dari Vitest, `prisma` dari `@/server/db`, `getGoogleConfig` dari config, serta create/consume dari flow. Letakkan body dalam `it(...)` dan suite `describe.skipIf(process.env.RUN_DB_TESTS !== '1')`. Gunakan database test khusus untuk seluruh tes OAuth baru; runbook harus menyebutkan DATABASE_URL test terpisah sebelum menjalankan integration suite.

## Referensi primer

Dokumentasi diperiksa 16 November 2026. GLM memeriksa ulang API versi terpasang sebelum implementasi.

- [Google OpenID Connect](https://developers.google.com/identity/openid-connect/openid-connect): server flow, token validation, stable subject, exact redirect URI.
- [Google branding guidelines](https://developers.google.com/identity/branding-guidelines): asset dan tampilan tombol.
- [openid-client repository](https://github.com/panva/openid-client): implementasi library dan runtime.
- [buildAuthorizationUrl v6.8.9](https://github.com/panva/openid-client/blob/v6.8.9/docs/functions/buildAuthorizationUrl.md).
- [authorizationCodeGrant v6.8.9](https://github.com/panva/openid-client/blob/v6.8.9/docs/functions/authorizationCodeGrant.md).
- [AuthorizationCodeGrantChecks v6.8.9](https://github.com/panva/openid-client/blob/v6.8.9/docs/interfaces/AuthorizationCodeGrantChecks.md).
- [ClientSecretPost v6.8.9](https://github.com/panva/openid-client/blob/v6.8.9/docs/functions/ClientSecretPost.md).
- [enableNonRepudiationChecks v6.8.9](https://github.com/panva/openid-client/blob/v6.8.9/docs/functions/enableNonRepudiationChecks.md): verifikasi signature token pada flow yang digunakan.
