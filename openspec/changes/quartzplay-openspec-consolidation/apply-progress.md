# Apply Progress: quartzplay-openspec-consolidation

## Batch 1 — PR 1 Records (2026-09-15)

- **Mode:** Strict TDD is active by project config, but no task in this batch changes production code or runtime behavior; TDD cycle rows are N/A per task. Spec scenarios are verified through native status and repository state.
- **Delivery:** `auto-chain`, `feature-branch-chain`; PR 1 targets tracker `staging-foundations`. Owner accepted `size:exception` for all three slices on 2026-09-15 (pre-existing and generated content).
- **Branch:** `chore/quartzplay-openspec-records` from `origin/staging-foundations` (trees verified identical to the previous `HEAD`).

### Completed Tasks

| Task | Result |
|---|---|
| 1.1 | Branch created; working tree carried without conflicts |
| 1.2 | `.atl/` and `supabase/legacy-reference/` ignored (verified with `git check-ignore`) |
| 1.3 | Testing facts refreshed: unittest modules and pytest-based modules recorded separately |
| 2.2 | `quartzplay-staging-readiness` archived retroactively; spec promoted to `openspec/specs/staging-readiness/spec.md` |
| 2.3 | Tracker migrated to active `quartzplay-staging-backend-config` with `migration-note.md` |
| 2.4 | `live-state-reconciliation.md` written; pointer added to bootstrap `apply-progress.md`; tasks 2.3 and 3.3 annotated |

### Work Unit Evidence

| Evidence | Result |
|---|---|
| Focused test | `CI=true npx react-scripts test --watchAll=false --runInBand` (in `frontend/`): 2 suites, 29/29 passed |
| Backend reference suite | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema`: 47/47 passed |
| Runtime harness | N/A: documentation and records only; no runtime boundary |
| Rollback boundary | Revert the PR 1 commit; worktree sources remain until retirement |

### Deviations from Design

- Task 2.3: the design planned to archive `staging-foundation` as superseded. Verification on `origin/main` found tasks 2.1–2.4 open (`bot/db.py` and `bot/admin_handlers.py` still read the environment directly), so the tracker was migrated as an active change instead. Design and tasks were updated before implementation.

### Issues Found

- `bot/tests/test_runtime_config.py`, `bot/tests/test_process_safety.py`, and `bot/tests/test_readiness.py` fail to import locally: they require `pytest` and `httpx`, which are not installed. Pre-existing on `main`; not part of this change; dependencies were not installed.

### Delivery

- 2.1, 2.5, 2.6 done: 50 files staged explicitly (+3,640 / −21); secret-pattern scan 0 hits; `git diff --check` clean; native risk assessment `medium` (`.gitignore` executable change) — writer self-verification plus spot check (backend reference suite re-run: OK).
- Commit `d74b141` on `chore/quartzplay-openspec-records`; PR #23 into `staging-foundations`; closes issue #22.
- Native status after PR 1: every QuartzPlay change listed once, no blocked reasons.

## Batch 2 — PR 2 Migrations (2026-09-15)

| Evidence | Result |
|---|---|
| Staged | 8 files, +11,039 / −3 (generated manifest 8,956) |
| Focused test (local working tree) | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_staging_schema`: 8/8 passed |
| Clean checkout of the PR 2 commit | 4/8: the two legacy-baseline tests and the trailing-whitespace test (for the baseline and `.atl/skill-registry.md`) fail because those files exist only locally |
| Secret scan / diff check | 0 hits / clean |
| Runtime harness | N/A: no database execution authorized |
| Rollback boundary | Revert the PR 2 commit |

- Commit `e90ba37` on `chore/quartzplay-foundation-migrations`.
- Follow-up for `quartzplay-staging-foundations`: make the schema suite portable (local-only references must not be required in a clean checkout). Not fixed here: the consolidation commits artifacts as written.

### Remaining

- 3.2 delivery (push, PR 2); phases 4–5.
