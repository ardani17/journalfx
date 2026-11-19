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
- Private financial figures live only in the user's private app, never in the repository.
