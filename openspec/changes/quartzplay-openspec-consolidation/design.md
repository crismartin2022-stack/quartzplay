# Design: QuartzPlay OpenSpec Consolidation

## Technical Approach

Land the existing canonical `app/` state through the Foundation feature-branch chain, add retroactive and superseded records, and record the 2026-09-15 sanitized live inventory. No product code changes; existing harness, suites, and migrations are committed as written. Satisfies `specs/project-memory/spec.md` (canonical location, attested live state, merged and superseded trackers).

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Chain base | New tracker from `staging`; existing tracker `staging-foundations` | New tracker splits Foundation history; existing tracker already holds the merged authority contract (PR #21) | Branch from `origin/staging-foundations`; PR #1 targets it; later slices target the previous slice |
| Slicing | One PR; three slices | One PR exceeds 400 lines | Slice 1 OpenSpec records, config, frontend memory test; slice 2 replay harness and suites; slice 3 Foundation migrations and manifest |
| Legacy baseline | Commit; ignore | Production-derived schema, untrusted, 157 role grants | Ignore `supabase/legacy-reference/`; keep local |
| `staging-readiness` tracker | Copy to active; archive retroactively | Code already on `main` | Archive at `openspec/changes/archive/2026-09-15-quartzplay-staging-readiness/` with a retroactive note; merge any delta specs into main specs per archive rules |
| `staging-foundation` tracker | Supersede; migrate | Apply found tasks 2.1–2.4 not on `main` (`bot/db.py` and `bot/admin_handlers.py` still read the environment directly); superseding would record false completion | Migrate to active `openspec/changes/quartzplay-staging-backend-config/` with `migration-note.md` (provenance, verified residual tasks) |
| Live inventory location | Scatter across tasks; one record | Scattered notes hide divergence | New `quartzplay-isolated-staging-bootstrap/live-state-reconciliation.md`; one pointer line in `apply-progress.md`; tasks 2.2–3.3 stay open with annotations |
| Local tool state | Commit; ignore | `.atl/` is per-machine | Add `.atl/` to root `.gitignore` |

## Boundaries

API, database, Telegram, and frontend runtime behavior are unchanged. Committed code is tests, local tooling, and Foundation migrations that are not executed.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/quartzplay-staging-foundations/**` | Create/Modify | Commit untracked artifacts; manifest edits |
| `openspec/changes/quartzplay-isolated-staging-bootstrap/**` | Create | Commit artifacts; add `live-state-reconciliation.md`; annotate `tasks.md` |
| `openspec/changes/archive/2026-09-03-project-memory-and-local-guide/**` | Create | Commit verified archive record |
| `openspec/changes/project-memory-and-local-guide/**` | Delete | Superseded by archive record |
| `openspec/changes/archive/2026-09-15-quartzplay-staging-readiness/**` | Create | Retroactive archive from worktree |
| `openspec/changes/quartzplay-staging-backend-config/**` | Create | Migrated tracker with `migration-note.md` |
| `openspec/specs/staging-readiness/spec.md` | Create | Promoted from the retroactive archive |
| `openspec/changes/quartzplay-staging-homologation-roadmap/exploration.md`, `openspec/changes/quartzplay-openspec-consolidation/**` | Create | This change and its roadmap |
| `openspec/specs/.gitkeep`, `openspec/config.yaml` | Create/Modify | Testing facts: backend unittest suites |
| `frontend/src/projectMemoryValidation.test.js` | Modify | Existing manifest assertions |
| `bot/tools/*`, `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | Create | Slice 2 |
| `supabase/migrations/2026091409*`, `supabase/foundation-schema-manifest.json` | Create | Slice 3; stage files explicitly |
| `supabase/.gitignore` | Create | Add `legacy-reference/` to existing `.branches`, `.temp` rules |
| `.gitignore` | Modify | Ignore `.atl/` |

## Interfaces / Contracts

`live-state-reconciliation.md` table: resource | expected (per tasks) | observed (names/status only) | divergence | owner action. Observed items to record:

| Resource | Observation |
|---|---|
| Railway project | Exists; single environment named `production` |
| `staging-api` | Deploys from `staging`; last deploy succeeded 2026-09-14; public domain exists |
| `staging-api` variables | Staging and production identity lists (consumed by `_require_disjoint`, fail-closed), `DATABASE_URL`, `TELEGRAM_TOKEN`, allowlist, service key |
| `staging-frontend`, `staging-worker` | No source, never deployed |
| Redis | Deployed, private |
| PostgreSQL in project | None; database target unattested |
| Supabase project | Active, 0 Edge Functions; row, Auth, Storage counts not measurable under current authorization |

Owner actions: confirm `TELEGRAM_TOKEN` is a staging bot (contract said none); confirm database target; decide environment naming.

Reconciliation rule: live-ahead items are annotated with the dated inventory and stay open; any task marked complete whose resource the inventory cannot observe returns to open with the discrepancy noted. Tasks outside inventory scope (GitHub guard) keep their recorded attestation.

## Worktree Retirement Procedure

For each `.worktrees/quartzplay-*`: branch tip reachable from its remote branch; `git status --porcelain` shows only known duplicates; then `git worktree remove --force` and `git worktree prune`. Any unexpected file stops removal for that worktree.

## Testing Strategy

| Layer | What | Approach |
|---|---|---|
| Unit (backend) | Replay and Foundation static contract | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` |
| Unit (frontend) | Project memory and manifest assertions | `cd frontend && npx react-scripts test --watchAll=false --runInBand` |
| Records | Native status and hygiene | `gentle-ai sdd-status` per change; `git diff --check`; secret-pattern scan per slice |

No new production code, so no RED test is required; the spec scenarios are verified through native status and repository state.

## Threat Matrix

N/A — no product routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary changes; VCS operations are manual delivery steps.

## Migration / Rollout

No migration required. Nothing is executed against any database. Rollback: revert slice PRs; recreate worktrees from remote branches.

## Open Questions

- [ ] Final merge target of tracker `staging-foundations` stays as the Foundation chain already defines; unchanged here.
- [ ] Owner answers for `TELEGRAM_TOKEN`, database target, and environment naming (recorded as pending, non-blocking for this change).
