# Horizon Journal

Personal XAUUSD trading journal, compounding simulator, dynamic withdrawal, risk management and
personal finance tracker.

> **Protect Capital. Trade with Discipline. Withdraw Based on Needs. Compound the Rest.**

Horizon Journal gives each Google account a private trading workspace. It keeps an exact ledger
of trading accounts, a psychology-aware trading journal, a deterministic compounding simulator, a
profit-only withdrawal engine with high-water-mark loss recovery, and a private budget/debt/expense
planner. Actual and projected data are always clearly separated; the app never promises returns and
never executes broker actions.

## Status

| Release | Scope | State |
| --- | --- | --- |
| v0.0.0 | Repository initialization | ✅ baseline |
| v0.1.0 | Foundation & UI shell | 🚧 |
| v0.2.0 | Trading Journal | ✅ released |
| v0.3.0 | Compounding & Risk | ✅ released |
| v0.4.0 | Financial Management | ✅ released |
| v0.5.0 | Dashboard, Review & Reports | ✅ released |
| v0.6.0 | Production Readiness & Visual QA | ✅ released |
| v1.0.0 | Stable MVP Release | ✅ released |
| v1.1.0 | MT5 Integration (read-only) | ✅ released |
| v1.2.0 | Telegram & Push Notifications | ✅ released |
| v1.3.0 | Economic Calendar & AI Journal | ✅ released |
| v1.4.0 | Monte Carlo & Portfolio Analytics | ✅ released |

## Tech stack

- **Framework**: Next.js (App Router) + TypeScript (strict)
- **UI**: Tailwind CSS with shadcn-style local components, Lucide icons, Recharts
- **Data**: PostgreSQL + Prisma (Decimal money, UTC timestamps)
- **Auth**: Google OpenID Connect with signed HttpOnly session cookies
- **Validation**: Zod on every API route; ownership checks server-side
- **Finance core**: deterministic, dependency-light engine (`src/lib/finance/`) using `decimal.js`
- **Tests**: Vitest (unit/integration), Playwright (E2E + visual QA)
- **Deploy**: Docker Compose (app + PostgreSQL + Nginx)

## Quick start (development)

```bash
npm install
cp .env.example .env            # then edit secrets
docker compose up -d --wait postgres
docker compose exec -T postgres createdb -U mdtp horizon_journal_google_local
npm run db:deploy
npm run db:seed:reference
npx prisma generate
npm run dev                     # http://localhost:3000
```

Configure the Google Web OAuth client as described in the [Google sign-in and deployment guide](docs/deployment/google-sign-in.md). First sign-in creates an empty private journal. The optional demo seed is for the local `horizon_journal_google_test` database.

## Shared Telegram bot

Set `TELEGRAM_BOT_TOKEN` in the server environment. The app derives the webhook secret from this token. After deployment, register the public HTTPS webhook using the derived secret. Register it again after switching from a separately configured secret or rotating the bot token.

```text
node --env-file=.env scripts/register-telegram-webhook.mjs
```

In **Pengaturan → Notifikasi Telegram**, open the bot with **Temukan Chat ID**, send `/id` in your private chat, and enter the returned number. Select **Hubungkan Telegram** and press **Start** in the same chat to verify it. In staging, pair two accounts in separate private chats and check that each chat receives one test message.

For local testing with a loopback `APP_ORIGIN`, run `node --env-file=.env scripts/poll-telegram-local.mjs` alongside the app. Use one poller per bot and stop it before registering an HTTPS webhook.

## AI Journal Insights

Set server-side `AI_BASE_URL`, `AI_API_KEY`, and `AI_MODEL` for a Chat Completions provider that supports non-streaming responses. Use the provider's API base including its version path (for example, `https://provider.example/v1`), or its full `/chat/completions` endpoint. Run `npm run db:deploy` before enabling the feature so the existing AI rate-limit table is available. Recreate the app process with the updated runtime environment.

In staging, use synthetic accounts to verify **Laporan & Analisis → Buat insight AI** and compare the resulting evidence against the closed trades. Check `[ai-journal]` server log entries for the failure stage if generation fails.

Run `npm run e2e -- e2e/ai-journal.spec.ts` against a local migrated database whose name ends in `_test`. Use `127.0.0.1:5433` with the repository's local Compose service on Windows. The suite uses a mock provider by default. Set `AI_JOURNAL_E2E_MODE=disabled` to exercise missing configuration or `AI_JOURNAL_E2E_MODE=live` to run the synthetic browser checks against the configured provider.

## Quality gates (every release)

```bash
npm run lint          # ESLint
npm run typecheck     # tsc --noEmit (strict)
npm run test          # Vitest unit + integration (financial engine)
npm run build         # production build
npm run e2e           # Playwright with the production build and seeded test database
```

A release is tagged only when all gates pass. See `RELEASES.md` and `CHANGELOG.md`.

## Documentation

- [`DATABASE.md`](DATABASE.md) — schema, migrations, backup/restore
- [`IMPLEMENTATION_PLAN.md`](IMPLEMENTATION_PLAN.md) — delivery sequence and acceptance gates
- [`TASKS.md`](TASKS.md) — live task tracker mapped to Linear
- [`CHANGELOG.md`](CHANGELOG.md) / [`RELEASES.md`](RELEASES.md) — version history & release checklists
- [`docs/design/MDTP-UI-UX-reference.png`](docs/design/MDTP-UI-UX-reference.png) — mandatory UI baseline

## Guardrails

- Ledger is the single source of truth; balances are derived, never stored twice.
- Actual vs projected figures are visually and logically separated.
- Withdrawal engine is a recommendation only; broker actions stay manual with receipt reconciliation.
- No automated trading, signals, broker credentials, or promised returns.
- Keep private financial figures out of the repository. When a user requests AI Journal Insights, the app shares only aggregate trade statistics with the configured AI provider.
