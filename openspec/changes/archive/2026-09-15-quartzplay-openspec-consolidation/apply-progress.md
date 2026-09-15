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

- Delivery: native risk assessment `medium` (committed-only scope); PR #24 into `chore/quartzplay-openspec-records`.

## Batch 3 — PR 3 Replay Harness (2026-09-15)

| Evidence | Result |
|---|---|
| Staged | 5 files, +1,242 / −3 |
| Fixture check | Connection URIs in added lines use only synthetic single-label hosts; password literals are the synthetic `secret` |
| Focused test (local) | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema`: 47/47 |
| Clean checkout of the PR 3 commit | 43/47: all 39 harness tests pass; the 4 known schema portability failures remain |
| Native risk assessment | `high` (Docker subprocess integration) |
| Independent verifier | PASS: no import-time side effects; execution requires `--execute`; no published ports or remote hosts; argument-list subprocesses only; owner-label-scoped cleanup; synthetic test secrets and per-target generated passwords. Non-blocking warning: `build_ledger_insert_command` interpolates migration version and name into SQL (fixed, validated inputs today) |
| Runtime harness | N/A: replay execution not authorized |
| Rollback boundary | Revert the PR 3 commit |

- Commit `8e0364b`; PR #25 into `chore/quartzplay-foundation-migrations`.

## TDD Cycle Evidence

Strict TDD is active for this project. No task in this change authors production code: the change commits pre-existing artifacts as written, edits OpenSpec records, and adjusts ignore and config files. The code committed in PR 2 and PR 3 was authored under `quartzplay-staging-foundations` with its own TDD evidence and is committed here unmodified.

| Task | RED | GREEN | TRIANGULATE | SAFETY NET | REFACTOR |
|---|---|---|---|---|---|
| 1.1–1.3 branch, ignores, config facts | ➖ N/A — no production code | ✅ Frontend suite 29/29 after the change | ➖ N/A | ✅ Suites run before and after | ➖ None |
| 2.1–2.6 OpenSpec records (PR 1) | ➖ N/A — records only | ✅ Frontend suite 29/29 | ➖ N/A | ✅ 29/29 before commit | ➖ None |
| 3.1–3.2 migrations and manifest (PR 2) | ➖ N/A — artifacts committed as written | ✅ `bot.tests.test_staging_schema` 8/8 locally | ➖ N/A | ✅ Suite run before commit | ➖ None |
| 4.1–4.2 replay harness (PR 3) | ➖ N/A — artifacts committed as written | ✅ `bot.tests.test_disposable_replay` 39/39; combined 47/47 | ➖ N/A | ✅ Suites run before commit; independent verifier PASS | ➖ None |
| 5.1–5.2 native status and worktree retirement | ➖ N/A — repository state | ✅ Native status clean; 7 worktrees removed after per-worktree checks | ➖ N/A | ✅ Commit containment checked before each removal | ➖ None |

No test file was created or modified by this change, so the assertion-quality audit has no new assertions to review; the committed suites are audited by their authoring change.

## Phase 5 Progress

- 5.1: native status lists every QuartzPlay change once with no blocked reasons (consolidation, bootstrap, backend config, foundations, roadmap).

### Follow-ups (outside this change)

- `quartzplay-staging-foundations`: make the schema suite portable in a clean checkout; harden the ledger insert against SQL interpolation.
- `quartzplay-staging-backend-config`: tasks 2.1–2.4.

### Remaining

- 5.2 worktree retirement after the chain merges into the tracker.
