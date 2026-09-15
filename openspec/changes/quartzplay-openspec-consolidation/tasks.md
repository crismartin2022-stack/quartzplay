# Tasks: QuartzPlay OpenSpec Consolidation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~17,000 measured: records ~4,000; migrations 1,879 plus generated manifest 8,956; harness and suites 1,409 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 records → PR 2 migrations → PR 3 harness |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

Pre-existing, verified, and generated content cannot reach 400 lines per PR without splitting single files. Each slice needs an explicit `size:exception` decision before apply.

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | OpenSpec records, config, memory test, ignores | PR 1 → `staging-foundations` | `cd frontend && npx react-scripts test --watchAll=false --runInBand` | N/A: documentation only | Revert PR 1 |
| 2 | Foundation migrations, manifest, schema suite | PR 2 → PR 1 branch | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_staging_schema` | N/A: no database execution authorized | Revert PR 2 |
| 3 | Replay harness and suite | PR 3 → PR 2 branch | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` | N/A: replay execution not authorized | Revert PR 3 |

## Phase 1: Branch and Hygiene

- [x] 1.1 Confirm tracked edits are identical between `HEAD` and `origin/staging-foundations`; create branch `chore/quartzplay-openspec-records` from it.
- [x] 1.2 Add `.atl/` to `.gitignore`; add `legacy-reference/` to `supabase/.gitignore`.
- [x] 1.3 Refresh testing facts in `openspec/config.yaml`: backend unittest suites and their command.

## Phase 2: Records (PR 1)

- [x] 2.1 Stage explicitly `openspec/changes/quartzplay-staging-foundations/`, `openspec/changes/quartzplay-isolated-staging-bootstrap/`, `openspec/changes/archive/2026-09-03-project-memory-and-local-guide/`, `openspec/specs/.gitkeep`, `frontend/src/projectMemoryValidation.test.js`, and the deletion of `openspec/changes/project-memory-and-local-guide/`.
- [x] 2.2 Copy the staging-readiness worktree tracker into `openspec/changes/archive/2026-09-15-quartzplay-staging-readiness/` with `retroactive-archive.md`; promote its spec to `openspec/specs/staging-readiness/spec.md`.
- [x] 2.3 Migrate the backend-recovery worktree tracker into active `openspec/changes/quartzplay-staging-backend-config/` with `migration-note.md`; keep verified open tasks 2.1–2.4 open (design deviation recorded in apply-progress).
- [x] 2.4 Write `openspec/changes/quartzplay-isolated-staging-bootstrap/live-state-reconciliation.md`; add a pointer in its `apply-progress.md`; annotate tasks 2.2–3.3 in its `tasks.md` per the reconciliation rule.
- [x] 2.5 Stage `openspec/changes/quartzplay-staging-homologation-roadmap/` and `openspec/changes/quartzplay-openspec-consolidation/`.
- [ ] 2.6 Run the frontend suite, secret-pattern scan, and `git diff --check --cached`; commit; push; open PR 1.

## Phase 3: Migrations (PR 2)

- [ ] 3.1 Branch from PR 1; stage `supabase/migrations/20260914090000_quartzplay_foundation_extensions.sql`, `supabase/migrations/20260914090100_quartzplay_foundation_sequences.sql`, `supabase/migrations/20260914090200_quartzplay_foundation_tables.sql`, `supabase/foundation-schema-manifest.json`, `supabase/.gitignore`, `bot/tests/test_staging_schema.py`.
- [ ] 3.2 Run the schema suite; scan; commit; push; open PR 2 into PR 1 branch.

## Phase 4: Harness (PR 3)

- [ ] 4.1 Branch from PR 2; stage `bot/tools/disposable_replay.py`, `bot/tools/disposable-replay-policy.json`, `bot/tests/test_disposable_replay.py`; exclude bytecode.
- [ ] 4.2 Run both backend suites; scan; commit; push; open PR 3 into PR 2 branch.

## Phase 5: Verification and Retirement

- [ ] 5.1 Native status in `app/` lists every change once with no blocked reasons (spec: Active change reported once).
- [ ] 5.2 After the chain merges into the tracker, check each quartzplay worktree for unique commits or files; remove clean ones; prune; report any stopped removal.
