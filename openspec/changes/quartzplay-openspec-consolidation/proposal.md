# Proposal: QuartzPlay OpenSpec Consolidation

## Intent

OpenSpec must be the single source of truth, but QuartzPlay SDD state is uncommitted, duplicated across seven worktrees, and behind live staging resources. Every later staging gate depends on trustworthy records. Source: `openspec/changes/quartzplay-staging-homologation-roadmap/exploration.md`.

## Scope

### In Scope
- Commit canonical `app/` state: `quartzplay-staging-foundations`, `quartzplay-isolated-staging-bootstrap`, the `archive/` record, the `project-memory-and-local-guide` removal, replay harness and static suites, Foundation migrations and manifest.
- Retroactively archive `quartzplay-staging-readiness` (merged); record worktree `staging-foundation` as superseded.
- Record a sanitized read-only inventory of the Railway and Supabase `QuartzPlay Staging` projects; reconcile bootstrap `tasks.md` and `apply-progress.md` with it.
- Refresh `openspec/config.yaml` testing facts (backend unittest suites exist); ignore local Supabase CLI state.
- Retire the seven `.worktrees/quartzplay-*` after landing, once nothing unique remains.

### Out of Scope
- Behavior changes, migration execution, replay runs, remote mutation, production access.
- Relational/Security slices, staging bindings, remote apply.

## Capabilities

### New Capabilities
None

### Modified Capabilities
- `project-memory`: SDD change state lives only in `app/openspec`; worktrees carry no change trackers; records claim only attested live state.

## Approach

Exploration approach 1. Commit existing artifacts as-is except reconciliation edits. Tasks contradicted by live state are annotated with sanitized evidence, never silently checked. No user-facing, data, API, security, or balance impact.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/changes/**`, `openspec/changes/archive/**` | New/Modified/Removed | Canonical records |
| `openspec/specs/project-memory/spec.md` | Modified | Canonical-location requirement |
| `openspec/config.yaml` | Modified | Testing facts |
| `bot/tools/`, `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | New | Existing harness and suites |
| `supabase/` | New | Foundation migrations and manifest; CLI temp ignored |
| `.worktrees/quartzplay-*` | Removed | Local checkouts only |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Identifiers or secrets committed | Med | Ignore CLI temp; scan diff for IDs/URLs/keys before commit |
| Unreviewed code lands | Med | PR review with static suites green; no execution |
| Worktree removal loses work | Low | Per-worktree check for unique commits and files first |

## Rollback Plan

Revert the consolidation PRs. Worktrees are re-creatable from untouched remote branches. The inventory is read-only; nothing remote to undo.

## Dependencies

- Sanitized staging inventory (authorized 2026-09-15).
- Protected `staging` branch (PR plus one approval).

## Reviewer Workload Forecast

Existing artifacts entering git exceed 400 lines. Decision needed before apply: No. Chained PRs recommended: Yes. 400-line budget risk: High. Session delivery strategy `auto-chain`, `feature-branch-chain` into `staging`: (1) OpenSpec records and config, (2) replay harness and suites, (3) migrations and manifest.

## Success Criteria

- [ ] `git status` in `app/` shows no pending OpenSpec, replay, or migration files.
- [ ] Native status lists each change once, with real progress.
- [ ] Bootstrap records match the sanitized inventory.
- [ ] `python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` passes.
- [ ] Stale worktrees removed; remote branches untouched.
