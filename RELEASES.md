# Release Registry & Checklists

The [GitHub releases](https://github.com/ardani17/journalfx/releases) through `v1.4.0` use the
original local Git tags. Future releases continue with `v1.4.1`, `v1.4.2`, and one patch per release.

1. Add release notes under `## [Unreleased]` in [CHANGELOG.md](CHANGELOG.md) and merge to `main`.
2. Open [Actions → Release](https://github.com/ardani17/journalfx/actions/workflows/release.yml) and
   run the workflow on `main`.
3. After lint, type checking, tests, the production build, and Playwright pass, the workflow
   updates the changelog and package versions, pushes an annotated tag, and publishes the GitHub
   release. Run the workflow again to finish publishing if the tag was pushed before a failure.

Use the Release workflow to keep package versions, tags, and release notes in sync.

## Release checklist template

Each entry records: previous tag → current tag, included issues, commit SHA, gates, migrations,
artifacts, approval.

---

## v1.4.0 — Monte Carlo & Portfolio Analytics (2026-11-16)

- Previous tag: v1.3.0 → current tag: v1.4.0 (sequential minor — final roadmap release)
- Scope: MDTP-EXT-06 register task (seeded simulation, uncertainty bands, multi-account,
  configurable challenge rules)
- Gates: typecheck 0 · lint 0 · 67/67 Vitest · build OK · 12/12 Playwright · live verification
- Migration: 20261115185108_prop_challenge_fields (optional TradingAccount prop columns)
- Limitations stated in-app: bootstrap dari sampel historis terbatas bersifat ilustratif,
  bukan prediksi (caveat ditampilkan saat n<30)
- Approval: owner instruction (sequential plan)

## v1.3.0 — Economic Calendar & AI Journal (2026-11-16)

- Previous tag: v1.2.0 → current tag: v1.3.0 (sequential minor)
- Scope: MDTP-EXT-05 register task (news context + explainable insights; no signals)
- Gates: typecheck 0 · lint 0 · 59/59 Vitest · build OK · live verification
- Migrations: none (EconomicEvent shipped in the v1.2.0 migration)
- Approval: owner instruction (sequential plan)

## v1.2.0 — Telegram & Push Notifications (2026-11-16)

- Previous tag: v1.1.0 → current tag: v1.2.0 (sequential minor)
- Scope: MDTP-EXT-04 register task (opt-in, quiet hours, retry/dedupe, secure tokens)
- Gates: typecheck 0 · lint 0 · 54/54 Vitest · build OK · live quiet-hours suppression verified
- Migration: 20261115183338_notification_channels_economic_events (NotificationChannel + EconomicEvent)
- Note: web-push (VAPID) intentionally not enabled — no keys configured; in-app + Telegram cover the register scope
- Approval: owner instruction (sequential plan)

## v1.1.0 — MT5 Integration read-only (2026-11-16)

- Previous tag: v1.0.0 → current tag: v1.1.0 (first future enhancement, sequential)
- Scope: MDTP-EXT register task (read-only sync, dedupe, incremental, stale warning)
- Gates: typecheck 0 · lint 0 · build OK · live idempotency verified (no duplicate P&L)
- Migrations: none · Approval: owner instruction (sequential plan)

## v1.0.0 — Stable MVP Release (2026-11-16)

- Previous tag: v0.6.0 → current tag: v1.0.0 (major promotion after all v0.6.x gates accepted)
- Issues: all MVP issues ARD-254…ARD-279 Done in Linear (26/26); v1.0.0 adds version display
- Gates: typecheck 0 · lint 0 · 54/54 Vitest · build OK · 12/12 Playwright E2E · security
  headers verified · visual QA PASS (1440/1280/390)
- Sequential tag audit: v0.0.0→v0.1.0→v0.2.0→v0.3.0→v0.4.0→v0.5.0→v0.6.0→v1.0.0 — exact
  minor/major increments, no skips, no reused tags
- Deployment: local/staging verified; production deploy not performed (no server authorized) —
  when authorized, run docker compose -f docker-compose.prod.yml with immutable image tag
- Approval: repository owner instruction "kerjakan plan-nya sampai selesai" (2026-11-16);
  user visual approval consolidated at the v0.6.0 QA gate with evidence in e2e/visual/

## v0.6.0 — Production Readiness & Visual QA (2026-11-16)

- Previous tag: v0.5.0 → current tag: v0.6.0 (minor +1, sequential)
- Issues: ARD-278 (engine test suite), ARD-279 (security/a11y/E2E) + production checklist items
  from the PRD "Remaining backlog" register (Docker+Nginx, backup/restore, docs)
- Gates: typecheck 0 · lint 0 · 54/54 Vitest · build OK · 12/12 Playwright (chromium)
- Visual QA: desktop 1440 PASS + mobile 390 PASS vs docs/design reference; captures stored in
  e2e/visual/ as regression evidence. Polish backlog (non-blocking): sidebar section header
  contrast, equity subtext wrap, rose card saturation, "—" empty-value treatment.
- Security: headers live; private attachments verified never served raw; API auth 401s; CSP set
- Migrations: none · Deployment: production stack defined (docker-compose.prod.yml) but NOT
  deployed — no production claims; local verification only
- Approval: owner instruction (sequential plan); stable v1.0.0 promotion awaits this tag's
  acceptance

## v0.5.0 — Dashboard, Review & Reports (2026-11-16)

- Previous tag: v0.4.0 → current tag: v0.5.0 (minor +1, sequential)
- Issues: ARD-274, ARD-275, ARD-276, ARD-277 — branches merged `--no-ff`
- Gates: typecheck 0 · lint 0 · 50/50 Vitest · build OK · 6 pages 200
- Live: immutable close + double-close rejection verified; discipline engine unit-verified
- Migrations: none · Deployment: local only · Approval: owner instruction (sequential plan)

## v0.4.0 — Financial Management (2026-11-16)

- Previous tag: v0.3.0 → current tag: v0.4.0 (minor +1, sequential)
- Issues: ARD-269, ARD-270, ARD-271, ARD-272, ARD-273 — branches merged `--no-ff`
- Gates: typecheck 0 · lint 0 · 46/46 Vitest · build OK · /withdrawals,/expenses,/debts,
  /finance/cashflow,/finance/allocation 200
- PRD acceptance verified live: HWM recovery sequence (−20,+10→0 eligible; +30→20 eligible unit
  tested), WD lifecycle caps + ledger posting + FX snapshot, debt principal-only reduction
  (1jt incl. 200k interest → −800k), deposit/WD never touches trading P&L (ledger types separate)
- Migrations: none · Deployment: local only · Approval: owner instruction (sequential plan)

## v0.3.0 — Compounding & Risk (2026-11-16)

- Previous tag: v0.2.0 → current tag: v0.3.0 (minor +1, sequential)
- Issues: ARD-265, ARD-266, ARD-267, ARD-268 — branches merged `--no-ff` to develop
- Gates: typecheck 0 · lint 0 · 30/30 Vitest · build OK · /simulator,/roadmap,/risk,/risk/calculator 200
- PRD acceptance verified via API: compounding cycle-1 formula exact (10/5/205), zero-cycle
  already-reached, minimum-lot rejection, adjusted drawdown unit tests
- Mockup deviation recorded: "$1M in 161 weeks" is arithmetically wrong (ln(5000)/ln(1.05)=174.6);
  implementation shows 175 weeks per PRD "formulas override mockup figures" rule
- Migrations: none · Deployment: local only · Approval: owner instruction (sequential plan)

## v0.2.0 — Trading Journal (2026-11-16)

- Previous tag: v0.1.0 → current tag: v0.2.0 (minor +1, sequential policy respected)
- Issues included: ARD-259, ARD-260, ARD-261, ARD-262, ARD-263, ARD-264
- Feature branches merged to develop (`--no-ff`): ARD-259-trade-crud, ARD-260-journal-psychology,
  ARD-261-screenshots, ARD-262-import-export, ARD-263-calendar, ARD-264-analytics
- Gates: typecheck 0 · lint 0 · 14/14 Vitest (trade engine + import parsers) · build OK
- Migrations: none (v0.1.0 schema already covered trades)
- PRD acceptance verified live: partial closes recognize only the closed portion
  (+23.00/+78.25 net incl. commission share → ledger +101.00, R = 1.870); duplicate
  import no-op (2 imported → 0 imported/2 duplicates on re-run); deposits/WD leave
  trading P&L unchanged; attachments private (401 unauthenticated)
- Visual: /journal at 1440px reviewed — toolbar, KPI strip, table with direction
  pills and colored P/L conform to mockup style; formal visual QA gate remains v0.6.0
- Deployment: local only; no production claims
- Approval: repository owner instruction "kerjakan plan-nya sampai selesai"

## v0.1.0 — Foundation & UI shell (2026-11-16)

- Previous tag: v0.0.0 → current tag: v0.1.0 (minor +1, sequential policy respected)
- Issues included: ARD-254, ARD-255, ARD-256, ARD-257, ARD-258
- Feature branches merged to develop (`--no-ff`, per-issue conventional commits):
  feature/ARD-254-nextjs-ci, feature/ARD-255-prisma-schema, feature/ARD-256-auth,
  feature/ARD-258-ledger, feature/ARD-257-app-shell
- Gates: typecheck 0 errors · lint 0 problems · `next build` OK · `prisma migrate dev` applied
  (`20261115171807_init`) · seed OK · smoke tests green (auth, onboarding single-shot, ledger
  arithmetic incl. reversal idempotency and net attribution)
- Migrations: initial migration only; rollback = drop database volume (pre-production)
- Visual: dashboard screenshot at 1440×900 reviewed against docs/design reference — layout,
  colors and section order conform; 3 findings (KPI icon tint, weekly net WD, single-point chart
  hint) fixed before tagging. Formal multi-viewport visual QA + user approval consolidated at the
  v0.6.0 Visual QA gate per release plan.
- Deployment: local only (docker compose postgres :5433 + `npm start` :3100); no production deploy
  authorized yet — none claimed
- Approval: repository owner instruction "kerjakan plan-nya sampai selesai" (2026-11-16); final
  user visual acceptance deferred to v0.6.0 gate as documented

## v0.0.0 — Repository initialization (2026-11-15)

- Previous tag: none (bootstrap baseline)
- Scope: repository initialization only (docs, CI config, design reference asset)
- Issues: none (pre-development baseline)
- Gates: n/a (no code yet) — documentation-only baseline
- Migrations: none
- Approval: repository owner (bootstrap)
- Notes: approved mockup normalized to `docs/design/MDTP-UI-UX-reference.png` before any UI work,
  as required by the UI/UX reference document.
