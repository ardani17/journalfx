# Changelog

All notable changes to Horizon Journal are documented here. GitHub releases follow the existing
tag history. Starting at `v1.4.0`, each new release increments the patch by one. See the
[release workflow](RELEASES.md) and [GitHub releases](https://github.com/ardani17/journalfx/releases).

Format: [Keep a Changelog](https://keepachangelog.com/) / releases are tagged `vX.Y.Z` in git.

## [Unreleased]

### Added

- View daily realized P&L from the trading calendar and open historical daily, weekly, and monthly reviews. Closing a review saves a snapshot, and corrections preserve the original.
- Estimate trading capital from monthly expenses and carry the estimate into the Monte Carlo simulator.
- Try a US$200 Monte Carlo example with three editable risk presets.
- Open the weekly trading summary and today's tasks in Telegram. Mark pending tasks complete from the bot.

### Changed

- Open trade details from any part of a journal row and see whether the psychology and journal sections are complete.
- Document setup and integrations in the Indonesian README.

### Fixed

- Keep Telegram pairing verified across visits after the user enters their Chat ID in the web settings and confirms in the bot.
- Improve access to imported trade and attachment details on mobile.
- Use Indonesian number entry and more consistent Indonesian labels across trading and finance pages.

## [1.4.5] — 2026-11-20

### Added

- Plan daily activities in Task / Jadwal, record outcomes and completion, and carry one improvement into the next day.
- Manage personal activity types and change an activity's type while keeping its recorded outcome.
- Create and select a strategy while planning a trading activity, with the activity draft preserved.

### Fixed

- Generate AI Journal Insights from closed trades with recorded P/L, including trades without journal entries. Compare eligible groups using server-calculated performance figures.
- Explain when AI insights need more trade data, lack a configured provider, or fail temporarily. Rule-based insights remain available.
- Record trading-plan compliance as yes, no, or unrecorded.
- Preserve draft entry conditions when switching activity types and report conflicts when concurrent edits change the activity type.

### Security

- Send aggregate statistics and fixed labels to the AI provider. Reserve quota before loading the full trading history and limit the provider response size before parsing.
- Update Prisma CLI's transitive Effect dependency to 3.22.1 to address a regular-expression denial-of-service advisory.

## [1.4.4] — 2026-11-19

### Added

- Convert US cents (USC) to Indonesian rupiah on the dashboard using the JISDOR rate and the ratio of 100 USC to 1 USD.
- Create a strategy directly from the New Trade form. The new strategy is selected automatically, and the trade details already entered are preserved.

## [1.4.3] — 2026-11-19

### Added

- Register an instrument symbol from the New Trade form without losing the trade details already entered. Existing symbols are reused.
- See why a withdrawal recommendation is zero and follow a guide from the request through manual broker withdrawal and receipt reconciliation.

### Fixed

- Reserve funds for pending withdrawals against both the overall cash limit and the selected source account. A pending withdrawal can still be reconciled if its source account has since been deactivated.
- Preserve the price precision of custom instruments as new trade executions are recorded.
- Load the sign-in page with the browser policy required by Turnstile and let users retry after returning from Google.

### Security

- Verify Cloudflare Turnstile before starting Google sign-in and limit the size of sign-in requests. Deployments that offer Google sign-in require both Turnstile keys. See the [Turnstile setup guide](https://github.com/ardani17/journalfx/blob/7bd8a93d30e6c2711a29ea4cca5a262dc839afb8/docs/deployment/google-sign-in.md#cloudflare-turnstile).

## [1.4.2] — 2026-11-19

### Added

- Install Horizon Journal on Android and iPhone as a standalone web app.
- Filter the Trading Journal by entry date and navigate paginated results.
- Run a saved Compounding Plan on open and compare its projection with per-trade Monte Carlo simulations. The full cycle history is available in the planner.
- Generate AI Journal Insights on demand from journal statistics when a provider is configured. Each finding includes supporting journal evidence, and rule-based insights remain available.
- Edit, deactivate, and reactivate trading accounts. Delete empty accounts, import MT5 reports for USD and US cent accounts, and choose flexible debt repayment terms.

### Changed

- Horizon Journal uses a shared Telegram bot. Enter the private chat ID in Settings and confirm the connection through Start. Existing Telegram destinations must reconnect after the migration. See the [database cutover instructions](https://github.com/ardani17/journalfx/blob/125c1688d9908c676a8c30b7b04771f604ee227e/DATABASE.md#L28-L33).
- Upgrade to Next.js 16.

### Fixed

- Include complete calendar dates across daylight-saving transitions and account-level MT5 fees in applicable Journal periods.
- Reconcile matching open MT5 positions, preserve deduplicated broker movements, and convert combined balances from US cent to USD once.
- Count partially filled journals in AI Insights and use the same cent-precision USD amount for withdrawal validation and storage.
- Restore backups transactionally into a fresh target and preserve Bash line endings across checkouts.

### Security

- Apply the same secret validation to Google sign-in and session verification, and prevent caching of private attachments.
- Check the origin of authenticated mutations and enforce upload and AI request limits.
- Bind the development database to loopback, protect backup permissions, exclude runtime files from Docker builds, and restrict CI credentials.

## [1.4.1] — 2026-11-19

### Added

- Google sign-in with a private journal for each account and automatic provisioning for new users.
- Bank Indonesia JISDOR exchange rates for withdrawal planning and USD-to-IDR financial summaries.
- MT5 Trade History XLSX import for positions, deposits, and withdrawals with per-account
  deduplication. Imported withdrawals also appear in the Withdrawal Plan.

### Changed

- The app is now called Horizon Journal.
- The journal and MT5 Sync share the same XLSX importer. Trade CSV import and export were removed.
- The switch to Google sign-in requires OAuth configuration and a fresh database for deployments
  with existing users. See the [Google sign-in deployment guide](https://github.com/ardani17/journalfx/blob/042938777eace7dc118ce8c792ec12364d6c74ac/docs/deployment/google-sign-in.md).

### Fixed

- Corrected withdrawal high-water marks and reserved allowances, cash-flow reversals, and
  the recognition date for realized P&L from partial trade closes.
- Applied the user's time zone to financial reporting periods and guarded concurrent withdrawals,
  allocations, and partial closes against conflicting balance updates.

### Security

- Patched transitive dependencies flagged by Dependabot.

## [1.4.0] — 2026-11-16

Monte Carlo & Portfolio Analytics.

### Added

- Monte Carlo engine: seeded deterministic bootstrap (mulberry32) over the user's historical
  R-multiples; percentile bands p10/p25/p50/p75/p90, risk-of-ruin (DD ≥30%), median max drawdown,
  small-sample caveat. Reproducible per seed (identical seed+data → identical paths).
- Monte Carlo panel on analytics (configurable risk%/trade count, 800 paths, band chart).
- Portfolio & prop-firm analytics: per-account balance/P&L/win-rate/trade table; prop accounts
  evaluate configurable challenge rules (target %, max daily loss %, max total DD %) with
  passed/breach/progress states.
- Migration: optional prop challenge fields on TradingAccount.
- 8 unit tests for the Monte Carlo engine (determinism, band ordering, growth, caveats).

### Verified

- typecheck 0 · lint 0 · 67/67 Vitest · build OK · 12/12 Playwright E2E.
- Live: MC run over historical R sample with caveat; portfolio endpoint lists typed accounts;
  analytics renders both panels.

## [1.3.0] — 2026-11-16

Economic Calendar & AI Journal.

### Added

- Economic calendar: manual entry of high-impact events (NFP/FOMC/CPI…) with currency and
  impact levels; calendar page panel; events within ±2h of a trade entry available as journal
  context (source-attributed, never a trading signal).
- Explainable AI journal insights: deterministic rule-based analysis over the user's own
  journal — session performance gaps, FOMO impact, missing stop-loss, revenge-pattern
  detection, mistake ranking, journal completeness — each with explicit evidence string,
  sample size, and missing-data handling (no black-box model, no predictions). Analytics panel.
- 5 unit tests for the insight engine (no fabricated insights from thin data).

### Verified

- typecheck 0 · lint 0 · 59/59 Vitest · build OK · live event create/list + both panels render.

## [1.2.0] — 2026-11-16

Telegram & Push Notifications.

### Added

- Opt-in Telegram channel: bot token + chat ID stored server-side only and always masked
  in responses; user-local quiet hours (default 22:00–07:00, overnight windows supported);
  3-attempt retry with backoff; per-channel dedupe key (no duplicate delivery).
- New notifications now dispatch to Telegram automatically when configured (quiet hours and
  dedupe aware); in-app notifications remain the default push channel.
- Settings section with Save & Test flow reporting exact suppression reasons.
- Migration: NotificationChannel + EconomicEvent tables (economic calendar ships in v1.3.0).

### Verified

- typecheck 0 · lint 0 · 54/54 Vitest · build OK · settings 200.
- Live: masked token round-trip; test send correctly suppressed by quiet hours at 01:30
  user-local; failure path (invalid token) does not crash the API.

## [1.1.0] — 2026-11-16

MT5 Integration (read-only sync).

### Added

- MT5 read-only sync: upload Deals/History export through Settings — audit-logged sync
  history, incremental dedupe on external execution IDs (repeated sync = no duplicate P&L),
  stale-data badge when last sync >72h, notifications for new/unknown-symbol results.
  Never sends orders (import direction only, PRD guardrail).

### Verified

- typecheck 0 · lint 0 · build OK · settings 200.
- Live: sync #1 → 1 new; sync #2 same file → 0 new/1 duplicate skipped; status endpoint
  reports last sync + freshness.

## [1.0.0] — 2026-11-16

Stable MVP Release — all six MVP milestones (26/26 Linear issues Done) with sequential
releases v0.0.0 → v0.6.0 accepted and verified.

### Added

- App version display in the sidebar footer, sourced from package.json (single version source).

### Release gate evidence

- Ordered tags: v0.0.0, v0.1.0, v0.2.0, v0.3.0, v0.4.0, v0.5.0, v0.6.0 → v1.0.0 (no skips,
  no reuse; major promotion resets minor/patch per policy).
- Gates: typecheck 0 · lint 0 · 54/54 Vitest · production build OK · 12/12 Playwright E2E.
- All PRD acceptance formulas verified live (compounding cycle, HWM sequence, partial closes,
  duplicate-import no-op, debt principal-only reduction, private attachments).
- Production stack defined (Dockerfile, docker-compose.prod.yml, nginx, backup/restore) —
  deployment remains local/staging; no untested production claims.
- Documentation complete: README, DATABASE.md, IMPLEMENTATION_PLAN.md, TASKS.md, CHANGELOG,
  RELEASES with per-release checklists and evidence.

## [0.6.0] — 2026-11-16

Production Readiness & Visual QA (staging-grade).

### Added

- Playwright E2E suite (12 tests): auth redirects, API 401s, private-attachment non-serving
  (never raw bytes), full page-render sweep across 18 routes, a11y landmarks, and visual
  evidence captures at 1440×900 / 1280×800 / 390×844.
- Visual QA evidence reviewed against the mandatory mockup: desktop PASS (section order,
  68/32 grid, 4 gradient plan cards, sidebar proportions) and mobile PASS (stacked cards,
  collapsed nav, no overflow). Minor polish items recorded in RELEASES.md backlog.
- Security headers (CSP, X-Frame-Options DENY, nosniff, Referrer-Policy, Permissions-Policy).
- Production stack: multi-stage Dockerfile (non-root user, healthcheck), docker-compose.prod.yml
  (postgres + app + nginx reverse proxy, versioned image tags), nginx.conf.
- Backup/restore runbooks: scripts/backup.sh (pg_dump + uploads tar + manifest, dev/prod aware)
  and scripts/restore.sh (typed confirmation, migrate deploy after restore); tested live.
- Engine suite deepened: debt projection edges (interest extension, unknown terms, unpayable
  installment) — 54 unit tests total covering every PRD acceptance formula.

### Verified

- typecheck 0 · lint 0 · 54/54 Vitest · build OK · 12/12 Playwright E2E.
- Live: backup produced db.dump + uploads.tar; security headers observed on responses;
  CSP present.

## [0.5.0] — 2026-11-16

Dashboard, Review & Reports.

### Added

- Discipline score engine (risk 30% · setup 25% · SL 15% · emotions 15% · completeness 10% ·
  frequency 5%) with missing-data flags and weight renormalization.
- Periodic reviews (daily/weekly/monthly): auto facts (trades, P&L, WD actual vs recommended,
  compounded amount, budget coverage), immutable CLOSED snapshots, audited corrections via
  correction-of copies, review history page.
- Integrated dashboard: actual balance curve with illustrative projection overlay (dashed),
  plan cards wired to real WD recommendation, monthly budget, and debt totals; milestone
  achievement scan + notification refresh on load.
- Notifications: review/debt/risk reminders deduped on refresh; mark-all-read API.
- Reports page linking reviews + trades CSV export.

### Verified

- typecheck 0 · lint 0 · 50/50 unit tests · build OK · all pages 200.
- Live: weekly review close froze snapshot (trades 1, discipline 35, WD 50.50); double-close
  rejected (400 immutable); discipline weights unit-verified (perfect=100, renormalized 72.7).

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
