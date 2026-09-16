# Design: QuartzPlay Isolated Staging Bootstrap

Create owner-gated empty staging without production data or source changes. It is not production parity: PostgreSQL schema authority remains in `quartzplay-staging-foundations`; Supabase is empty and non-runtime.

## Technical Approach

Each slice needs owner approval and sanitized evidence. Record statuses and approvals only, never IDs, URLs, credentials, row values, or topology.

```text
approved main -> protected staging -> Railway staging environment
                                      |-> API + PostgreSQL
                                      |-> worker + Redis (polling off)
data-owner approval -> empty Supabase staging boundary
                                      -> sanitized evidence -> owner acceptance
```

## Architecture Decisions

| Decision | Choice | Alternative rejected | Rationale |
|---|---|---|---|
| Deployment lane | PR-only `staging` from approved `main`; environment permits only `staging` | Direct `main` deploy | Separates promotion from production. |
| Runtime isolation | Explicit QuartzPlay selection; distinct staging API, worker, PostgreSQL, Redis, bindings | Local CLI linkage or shared services | Existing linkage is not authoritative; sharing breaks isolation. |
| Data boundary | Empty Supabase project/schema; no import, seed, migration, app binding, or production credential | Baseline or production copy | Neither is approved schema authority. |
| Worker safety | Deploy worker with `POLLING_ENABLED=false`; no Telegram credentials until separately approved | Enable polling for smoke | Prevents real Telegram traffic. |
| Readiness | `/livez` now; `/readyz` only after separately approved staging PostgreSQL schema exists | Treat empty Supabase as readiness target | `readyz` requires `users` and `agencias` columns through `DATABASE_URL`. |

## Console-Gated Sequence

1. **Gate 0, owner:** approve `main` commit and all console slices; GitHub admin observes exact required-check name on a same-repository PR.
2. **GitHub slice, admin:** create `staging`. Require PRs, one approval, stale-approval dismissal, resolved conversations, and observed check; block direct/force pushes and deletion. Create environment limited to `staging`. Evidence: policy attestation. Owner accepts.
3. **Railway slice, operator:** select QuartzPlay, create staging environment, then distinct API, worker, PostgreSQL, Redis. Bind API/worker only to staging `DATABASE_URL`; set `APP_ENV=staging`, staging origins, and all disjoint `bot/config.py` allowlists. Set `POLLING_ENABLED=false`; provide no Telegram credentials. Evidence: distinct-resource/binding attestations and deployment status. Owner accepts.
4. **Supabase slice, data owner:** approve schema source, create non-production project/schema with zero rows, storage objects, Auth users. Do not bind app services. Evidence: aggregate-zero and no-production-credential attestations. Owner accepts.
5. **Smoke evidence, operator:** confirm GitHub guard; API `/livez` returns 200 and `{"status":"live"}`; worker deployment status and Redis health are healthy; Supabase aggregate counts are zero. Run `/readyz` only when `quartzplay-staging-foundations` has independently supplied approved schema to isolated Railway PostgreSQL; otherwise record it as blocked, not failed or passed. Owner accepts final checklist.

## Interfaces / Contracts

Runtime contract unchanged: API requires `DATABASE_URL`, `APP_ENV=staging`, staging origins, disjoint database/Telegram/admin allowlists. `bot/Procfile` keeps separate API and worker processes. No Supabase binding.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/quartzplay-isolated-staging-bootstrap/design.md` | Create | Console sequence, gates, smoke evidence, and rollback. |
| Application source | No change | Console-only bootstrap; future observability code needs separate approval. |

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Existing unit | Current isolation and readiness contracts | Preserve `bot/tests/test_runtime_config.py` and `bot/tests/test_readiness.py`; no source test change in this slice. |
| Console smoke | Policy, isolation, and status-only evidence | Owner-reviewed sanitized checklist; no secrets or values. |
| Future RED/GREEN | Worker health or Redis runtime probe | Add failing backend tests before code, forecast under 400 lines, then use feature-branch chain. |

## Threat Matrix

| Boundary | Applicability | Design response | Planned RED tests |
|---|---|---|---|
| Documentation-like paths | N/A: no file classification or execution | Console-only | None |
| Git repository selection | N/A: administrator selects branch in GitHub UI; no `git` command | Explicit `staging` and approved source commit attestation | None |
| Commit state | N/A: no commits created | Console-only | None |
| Push state | N/A: no pushes created | Rules block direct pushes | None |
| PR commands | N/A: no PR command automation | GitHub policy is manually configured | None |

## Rollback / Rollout

With owner approval, reverse dependencies: stop/delete worker then API; remove bindings; delete staging PostgreSQL/Redis; remove Supabase bindings then empty project/schema; remove environment policy and branch rules. Delete `staging` only with no open PR, deployment, or child branch. Never touch production, `main`, `staging-foundations`, data, domains, backups, or migration history.

No migration required in this change. Future source work follows strict RED-GREEN TDD and feature branch chain: first PR targets `staging`; each child targets immediate predecessor. `ask-always` applies before every console or delivery slice.

## Open Questions

- [ ] Data owner must name approved schema source in `quartzplay-staging-foundations` before `/readyz` is attempted.
- [ ] Owner must approve staging Telegram identity and admin set before polling can be enabled.
