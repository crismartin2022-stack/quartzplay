# Retroactive Archive: quartzplay-staging-readiness

- **Archived:** 2026-09-15 by `quartzplay-openspec-consolidation`.
- **Source:** tracker from the `feat/staging-readiness` worktree; it was never committed before this archive.
- **Implementation:** merged into `main` (the branch is an ancestor of `origin/main`); `GET /livez` and `GET /readyz` exist in `bot/casino_api.py`, with tests in `bot/tests/test_readiness.py`.
- **Tasks:** 12/12 complete in the tracker. No verify report was produced; the merged code and its tests are the evidence of record.
- **Spec:** promoted unchanged to `openspec/specs/staging-readiness/spec.md`.
- **Limitation:** `/readyz` can only report blocked until the approved Foundation schema exists in staging; readiness is not proven in any live environment.
