# Changelog

All notable changes to MDTP are documented here. Versions follow the mandatory sequential release
policy (see `RELEASES.md`): exactly one patch or minor increment at a time, no skipped tags.

Format: [Keep a Changelog](https://keepachangelog.com/) / releases are tagged `vX.Y.Z` in git.

## [Unreleased]

### Planned (sequential, no skipping)

- v0.2.0 Trading Journal
- v0.3.0 Compounding & Risk
- v0.4.0 Financial Management
- v0.5.0 Dashboard, Review & Reports
- v0.6.0 Production Readiness & Visual QA
- v1.0.0 Stable MVP Release
- v1.1.0 MT5 Integration (read-only)
- v1.2.0 Telegram & Push Notifications
- v1.3.0 Economic Calendar & AI Journal
- v1.4.0 Monte Carlo & Portfolio Analytics

## [0.1.0] — 2026-11-16

Foundation & UI shell.

### Added

- Next.js 15 (App Router) + TypeScript strict + Tailwind v4 with the mandatory MDTP dark fintech
  design tokens; ESLint 9 flat config; docker-compose PostgreSQL 16 (host port 5433).
- Full Prisma domain schema (25+ models) with initial migration and instrument reference seed;
  decimal money, UTC timestamps, immutable ledger rows with reversal relations (ARD-255).
- Credentials auth: bcrypt hashing, jose-signed httpOnly session cookie, middleware route guard,
  single private onboarding (registration closes after first user), audit log (ARD-256).
- Ledger engine: deposits/withdrawals/adjustments with signed conventions, append-only REVERSAL
  corrections (idempotent), computed balances with net reversal attribution, daily balance series,
  weekly summary, PRD roadmap milestones auto-seeded (200→1M) (ARD-258).
- Responsive app shell per mockup: 21% sidebar with grouped nav & release badges, project progress
  card, header with notifications, mobile drawer + bottom nav; dashboard (banner, 4 KPI, balance
  area chart, weekly summary, Rencana & Target gradient cards), accounts, transactions, settings,
  notifications pages; honest Coming Soon placeholders for later releases (ARD-257).

### Verified

- typecheck 0 errors · lint 0 problems · production build OK · migration applied · seed OK.
- Smoke: auth guard redirects; onboarding single-shot (second attempt 403); ledger math
  200+300−50+50 = 500; reversal idempotent; net WD attribution; login/logout cycle.

## [0.0.0] — 2026-11-15

### Added

- Repository baseline: `.gitignore`, `.editorconfig`, CI workflow.
- Mandatory documentation set: `README.md`, `DATABASE.md`, `IMPLEMENTATION_PLAN.md`, `TASKS.md`,
  `CHANGELOG.md`, `RELEASES.md`.
- Approved UI/UX reference asset normalized at `docs/design/MDTP-UI-UX-reference.png`
  (authoritative visual baseline for all UI milestones).
