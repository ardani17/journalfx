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

## v0.0.0 — Repository initialization (2026-11-15)

- Previous tag: none (bootstrap baseline)
- Scope: repository initialization only (docs, CI config, design reference asset)
- Issues: none (pre-development baseline)
- Gates: n/a (no code yet) — documentation-only baseline
- Migrations: none
- Approval: repository owner (bootstrap)
- Notes: approved mockup normalized to `docs/design/MDTP-UI-UX-reference.png` before any UI work,
  as required by the UI/UX reference document.
