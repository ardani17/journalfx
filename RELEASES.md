# Release Registry & Checklists

MDTP follows the **Mandatory Git Workflow & Sequential Release Policy** (Linear: MDTP project
resources). Summary of the rules enforced here:

- Protected `main` (production) and `develop` (integration). Work happens on
  `feature/ARD-xxx-short-name` / `fix/...` branched from `develop`; releases via `release/vX.Y.Z`.
- Conventional Commits referencing the Linear issue (e.g. `feat(journal): add partial close (ARD-259)`).
- Sequential versions only: patch +1 (v0.1.0 → v0.1.1), minor +1 with patch reset (v0.1.2 → v0.2.0),
  never skip, reuse, or move tags. Stable v1.0.0 only after v0.6.x acceptance.
- A release is tagged only after lint + strict typecheck + tests + production build pass and the
  checklist below is recorded.
- **Local-repo adaptation** (documented deviation): this repository currently has no remote/PR
  hosting. Feature branches are merged locally into `develop` with `--no-ff` to preserve per-issue
  commits; the release checklist records commit SHAs in place of PR links. When a remote is added,
  PR gating resumes without policy change.

## Release checklist template

Each entry records: previous tag → current tag, included issues, commit SHA, gates, migrations,
artifacts, approval.

---

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
