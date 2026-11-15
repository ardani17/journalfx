# Changelog

All notable changes to MDTP are documented here. Versions follow the mandatory sequential release
policy (see `RELEASES.md`): exactly one patch or minor increment at a time, no skipped tags.

Format: [Keep a Changelog](https://keepachangelog.com/) / releases are tagged `vX.Y.Z` in git.

## [Unreleased]

### Planned (sequential, no skipping)

- v0.5.0 Dashboard, Review & Reports
- v0.6.0 Production Readiness & Visual QA
- v1.0.0 Stable MVP Release
- v1.1.0 MT5 Integration (read-only)
- v1.2.0 Telegram & Push Notifications
- v1.3.0 Economic Calendar & AI Journal
- v1.4.0 Monte Carlo & Portfolio Analytics

## [0.4.0] — 2026-11-16

Financial Management.

### Added

- Dynamic withdrawal engine: profit-only rule, cumulative-P&L high-water mark with loss recovery
  (derived from completed WDs against the ledger timeline — never stored), eligibility never
  reused, weekly period-profit gate, subtraction of WD already taken, min(eligible×ratio, needs,
  cash−reserve) caps, stale/unknown data warnings.
- WD lifecycle RECOMMENDED→REQUESTED→COMPLETED/CANCELLED with FX snapshot (immutable historical
  rate), receipt reconciliation (kurs, dana diterima, biaya), ledger WITHDRAWAL posting and
  personal-income linkage; versioned withdrawal rules.
- Budget with monthly categories (auto-carried each month), funding coverage from tracked income,
  expense tracking with reversals, cashflow page.
- Debt tracker: principal/interest/fee separation (only principal reduces debt), payments,
  straight-line projection with unknown-terms incompleteness flag.
- Financial buckets (living/debt/emergency/savings/trading/unallocated) & allocation engine with
  per-(bucket,period) unique constraint and unallocated-profit validation — no double allocation.

### Verified

- typecheck 0 · lint 0 · 46/46 unit tests · build OK · all 5 finance pages 200.
- Live: cum P&L +101 → eligible 101 → rec 50.50; over-limit request rejected; completion posts
  ledger −50.50, HWM→101, next eligible 0; debt payment 1,000,000 (bunga 200,000) → principal
  −800,000 → remaining 4,200,000 (exact PRD gate).

## [0.3.0] — 2026-11-16

Compounding & Risk.

### Added

- Deterministic compounding simulator: fixed/variable/negative returns, NONE/FIXED/DYNAMIC
  withdrawal modes with profit-only rule, needs cap, per-cycle costs, deposit schedule, stress
  overrides, horizon guard ("target belum tercapai"), zero cycles when target already reached.
- Scenario CRUD with saved parameters and per-run projection curve + cycle table.
- Roadmap page: 12 PRD milestones with historical achievement dates, phase timeline, progress
  ring driven by actual ledger balance, illustrative 5%/week duration estimate.
- Broker-aware position size calculator: risk/(SL distance × contract size + cost/lot) floored
  to lot step; rejects below minimum lot; warning-only tick/margin/stale-equity validations.
- Risk settings (1%/2%/5%/10%/2% defaults) with live usage bars, open-risk tracking and
  cash-flow-adjusted drawdown (deposits don't mask DD, withdrawals don't fake it).

### Verified

- typecheck 0 · lint 0 · 30/30 unit tests · build OK · pages 200.
- PRD acceptance live: $200×5% → $10 profit, 50% cap → $5 WD, closing $205; target-already-
  reached → 0 cycles; minimum-lot-exceeds-risk rejected; $200→$1M @5% = 175 weeks (mockup's
  161 corrected — PRD formulas override illustrative figures).

## [0.2.0] — 2026-11-16

Trading Journal.

### Added

- Deterministic trade pricing engine (weighted entries, partial-close recognition,
  proportional entry-cost allocation, planned/actual R) with 11 unit tests.
- Trade lifecycle: create with pre-trade checklist, partial/full closes posting
  net REALIZED_PNL to the ledger atomically, derived status machine, cancellation.
- Psychology journal: emotions, confidence/stress, FOMO/revenge/overtrading flags,
  mistake tags, lessons, post-trade checklist; strategy CRUD.
- Private screenshot uploads (PNG/JPEG/WebP ≤5 MB) stored outside static serving,
  delivered only through ownership-checked API route (401 without session).
- MT4 history + MT5 deals import with FIFO deal pairing and idempotent dedupe on
  external IDs (re-import = no-op); trade list CSV export.
- Monthly P&L calendar grid; analytics page with core metrics, strategy breakdown,
  daily P&L bars, sample-size warnings.

### Verified

- typecheck 0 · lint 0 · 14/14 unit tests · build OK.
- E2E smoke: partial close +23.00/+78.25 net of commission share; ledger
  REALIZED_PNL +101.00; import 2 trades → re-import 2 duplicates (no-op);
  screenshot 200 with session / 401 without.

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
