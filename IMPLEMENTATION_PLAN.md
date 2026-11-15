# Implementation Plan — MDTP

Source of truth: PRD & Implementation Plan — MDTP v1.0 (Linear document) plus the mandatory Git
Workflow & Sequential Release Policy and UI/UX Design Reference. This file tracks the concrete
engineering sequence. Financial formulas and PRD data integrity always override illustrative
mockup values.

## Delivery sequence

1. **Foundation** — repo, auth, database, layout, configuration, accounts, ledger. *(v0.1.0)*
2. **Trading journal** — execution model, journal, screenshots, imports, calendar, analytics. *(v0.2.0)*
3. **Compounding/risk** — scenarios, roadmap, position calculator, risk metrics. *(v0.3.0)*
4. **Finance** — WD engine, receipt ledger, budgets, debts, allocations. *(v0.4.0)*
5. **Reviews/reporting** — period close, analytics, discipline score, notifications, dashboard. *(v0.5.0)*
6. **Production** — tests, security, responsive accessibility, deployment, backup/restore. *(v0.6.0)*
7. **Later** *(sequential minors)* — read-only MT5 sync (v1.1.0), Telegram/push (v1.2.0), economic
   calendar + explainable AI journal insights (v1.3.0), Monte Carlo + portfolio/prop analytics (v1.4.0).

## Architecture decisions

- **Modular monolith**: Next.js App Router + route handlers; service layer (`src/server/services`)
  over repository layer (`src/server/repositories`); pages consume services through server
  components and typed API routes — no client-side DB access.
- **Deterministic financial engine** (`src/lib/finance/`): pure TypeScript functions over
  `decimal.js`. No DB, no React, no Next imports. Fully unit-testable — this is where the PRD
  acceptance formulas live (withdrawal eligibility, HWM recovery, compounding, position sizing,
  drawdown adjusted for cash flows, discipline scoring).
- **Money**: `Decimal` in code; Prisma `Decimal` columns; UTC timestamps; ledger entries immutable
  with reversal rows for corrections (audit trail), never mutated in place.
- **Auth**: credentials auth (bcrypt) with signed httpOnly JWT session cookie (`jose`), middleware
  route protection and per-request ownership checks in every service. Onboarding creates the
  single private user account in-app; no public registration.
- **Imports**: CSV/statement parsing with dedupe on unique external execution identifiers;
  duplicate re-import is a no-op (idempotent).
- **Actual vs projected**: projected figures originate exclusively from the simulator/scenario
  domain and are always labeled "Proyeksi/Estimated"; actual figures originate exclusively from
  the ledger. The two are never mixed in one series without explicit labeling.

## Acceptance gates (from PRD)

- $200 × 5% = $10 simulated profit; 50% cap gives $5 WD and $205 closing balance.
- Loss $20 then profit $10 yields zero eligible WD; next profit $30 yields $20 eligible.
- Deposits/WD leave trading P&L unchanged; partial closes recognize realized portion; duplicate
  imports no-op.
- Debt payment IDR 1,000,000 including IDR 200,000 interest reduces principal by IDR 800,000.
- Minimum lot exceeding risk limit rejected; target already reached gives zero periods.
- No cross-user access, no double allocation, historic FX unchanged, audited mutations, private
  attachments.
- Lint, typecheck, migrations, unit/integration/E2E tests, production build, backup restore pass.
- Real and simulated data clearly separated; no mock production data; docs in README, DATABASE.md,
  IMPLEMENTATION_PLAN.md, TASKS.md.

## Definition of done (per issue)

1. Code merged to `develop` via feature branch with Conventional Commit referencing the issue.
2. Lint + strict typecheck + related unit tests + production build pass.
3. Acceptance criteria of the issue verified (manual or automated) and recorded.
4. Linear issue moved to Done only after 1–3.
