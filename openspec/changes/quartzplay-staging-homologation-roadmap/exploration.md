## Exploration: QuartzPlay staging and production homologation roadmap

Project-wide exploration requested when the orchestrator took control of the project. Goal: reach a working, isolated staging environment, then homologate staging with production. OpenSpec in `app/` is the single source of truth for project state.

Evidence sources: `app/openspec/**`, the seven `.worktrees/quartzplay-*` checkouts (read-only), local git refs (no fetch), the workspace handoff `CLAUDE_HANDOFF.md`, and a read-only account-level access check of the Supabase and Railway CLIs (project names and status only). No code was modified and no remote resource was changed.

### Current State

#### 1. OpenSpec state is fragmented and mostly uncommitted

| Change | Location | Progress | Real status | Action |
|---|---|---|---|---|
| `quartzplay-staging-foundations` | `app/` | 10/13, next=apply | Canonical and active, but untracked except `migration-manifest.md` | Commit, then continue |
| `quartzplay-isolated-staging-bootstrap` | `app/` | 4/13, next=apply | Canonical and active, entirely untracked; its records lag live remote state (see 2) | Commit, reconcile, continue |
| `project-memory-and-local-guide` (archived) | `app/openspec/changes/archive/2026-09-03-*` | 15/15 | Canonical archive record, untracked | Commit |
| `project-memory-and-local-guide` (active copy) | `app/openspec/changes/` | n/a | Superseded by the archive copy; six files already deleted in the working tree | Commit the deletion |
| `project-memory-and-local-guide` (7 copies) | every `.worktrees/quartzplay-*` | 15/15 | Byte-identical, never committed duplicates | Discard with the worktrees |
| `staging-foundation` (backend config isolation) | `.worktrees/quartzplay-staging-backend-recovery` | 6/12 | Superseded: the outcome shipped through merged work (`bot/config.py` runtime settings, CORS allowlist in `bot/casino_api.py`) | Record as superseded; do not continue |
| `quartzplay-staging-readiness` | `.worktrees/quartzplay-staging-readiness` | 12/12, next=verify | Merged but not archived: `/livez` and `/readyz` exist in `bot/casino_api.py` on `origin/main` | Retroactive archive in `app/` |

Verified with local git: `feat/staging-backend-config-recovery`, `feat/staging-readiness`, `feat/staging-frontend-isolation`, `feat/staging-backend-process-safety`, and `fix/production-rollout-repair` are all ancestors of `origin/main`. Four worktrees (`gitignore-safety`, `production-rollout-repair`, `production-runtime-config`, `staging-backend-process`) hold no unique SDD content. `docs/STAGING_WORKFLOW.md` in `staging-guide-recovery` describes PRs as open that are already merged; it is stale.

The `app/` checkout is on `docs/staging-foundations-authority` (no upstream) and carries 24 uncommitted entries: the OpenSpec changes and archive above, `bot/tools/disposable_replay.py` and its policy, `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py`, and `supabase/` (Foundation manifest, three Foundation migrations, a quarantined legacy baseline, local CLI temp state). None of the staging schema or replay work survives a checkout, clean, or machine loss today.

#### 2. OpenSpec lags live remote state

`quartzplay-isolated-staging-bootstrap/apply-progress.md` records Supabase project creation as blocked on an organization owner, and Railway work as partial (empty service identities and generated domains only). The access check on 2026-09-15 shows that both a Supabase project and a Railway project named `QuartzPlay Staging` now exist, and that the Railway project holds frontend, API, worker, and Redis services. A secondary Engram record from 2026-09-14 reports a successful staging API deployment from the `staging` branch with liveness responding.

None of this is attested in OpenSpec. Until a sanitized, owner-authorized read-only inventory is recorded, it cannot count as evidence for any gate, and tasks 2.2–2.3 and 3.1–3.3 cannot be marked complete.

#### 3. Staging readiness

| Area | State | Evidence level |
|---|---|---|
| Protected `staging` branch and deployment environment | Done (tasks 1.1–1.3) | Recorded attestation |
| Frontend destination isolation | Merged | Code on `origin/main` |
| Backend runtime settings, CORS, Telegram identity, independent web/worker processes | Merged | Code on `origin/main` |
| `/livez` and `/readyz` | Merged; `/readyz` can only report blocked until approved schema exists | Code on `origin/main` |
| Foundation schema slice (80 tables, 845 columns, 72 sequences, extensions; excludes constraints, indexes, view, security) | Written, uncommitted | Static only (relevant suite 47/47) |
| Portless two-target replay harness | Written, uncommitted | Static only; the single runtime attempt failed during cleanup inspection; no valid A/B success receipt exists |
| Railway staging services and bindings | Services exist live; bindings and variables unattested | Not attested in OpenSpec |
| Supabase staging project | Exists live; zero-inventory unattested | Not attested in OpenSpec |

Remaining gates, in order (per `migration-manifest.md`, `verify-report.md`, and the handoff):
1. Commit the canonical `app/` state.
2. Run one authorized local, portless diagnostic replay; read only its sanitized receipt; fix the root cause with strict TDD.
3. Obtain two fresh, independent, successful local A/B replays.
4. Relational slice (90 constraints, 224 indexes, 1 view), then Security slice (RLS, policies, roles, grants, default privileges), each with its own TDD and replay proof.
5. Complete and attest bootstrap phases 2–4 (bindings, empty Supabase attestation, smoke/acceptance).
6. Fill the manifest's destination identity, empty-target proof, rollback owner, and change window; then gate an explicit remote staging apply.

#### 4. Production homologation

| Dimension | Known | Missing |
|---|---|---|
| Schema parity | Validated production metadata aggregates (80 tables, 845 columns, 72 sequences, 90 constraints, 224 indexes, 162 types, 1 view, 5 extensions) | Relational and Security migrations; any applied staging schema; an automated staging-vs-production metadata comparison |
| Runtime config parity | Disjoint database, allowlists, Telegram identity, `POLLING_ENABLED=false` for staging, coded in `bot/config.py` | Attestation of the live staging variables against that contract |
| Service parity | Distinct Railway and Supabase staging projects exist | A sanitized inventory proving topology matches production shape without shared identities |
| Data safety | Zero rows, Auth users, and Storage objects required before binding | Proof on the live staging Supabase project |

Infrastructure-identity isolation is largely done. Schema parity and data-safety attestation are the long pole.

### Affected Areas

- `app/openspec/changes/quartzplay-staging-foundations/` — active Foundation change; tasks, manifest, and gates.
- `app/openspec/changes/quartzplay-isolated-staging-bootstrap/` — bootstrap change whose records must be reconciled with live state.
- `app/openspec/changes/archive/` — canonical archive; needs the `staging-readiness` retroactive record.
- `app/openspec/config.yaml` — modified testing/rules sections, uncommitted.
- `app/bot/tools/disposable_replay.py`, `app/bot/tests/test_disposable_replay.py`, `app/bot/tests/test_staging_schema.py` — replay harness and static suites, uncommitted.
- `app/supabase/` — Foundation migrations and manifest, uncommitted.
- `app/bot/config.py`, `app/bot/casino_api.py` — merged runtime isolation and readiness contract the staging bindings must satisfy.
- `.worktrees/quartzplay-*` — stale checkouts to retire.

### Approaches

1. **Consolidate first, then advance gates** — one small change commits the canonical `app/` state, archives merged work, marks superseded trackers, and records a sanitized live inventory; then Foundation replay gates, Relational, Security, and remote apply follow in order.
   - Pros: OpenSpec becomes trustworthy before any further decision; eliminates silent-loss risk; every later gate rests on committed evidence.
   - Cons: One extra docs-heavy PR before visible staging progress.
   - Effort: Low

2. **Advance Foundation replay first, consolidate later** — go straight to the diagnostic replay and fix cycle.
   - Pros: Faster movement on the technical long pole.
   - Cons: Keeps all work uncommitted; replay evidence would be written into a state that still disagrees with reality; duplicated trackers can mislead later phases.
   - Effort: Medium

3. **Fast-track remote staging apply** — apply Foundation directly to the live staging Supabase project, skipping independent replay proof.
   - Pros: Earliest visible staging schema.
   - Cons: Violates recorded decisions (two independent replays, owner gates, rollback owner); a failed remote apply requires forward compensation on a bound target.
   - Effort: Medium, high risk

### Recommendation

Approach 1. Proposed SDD sequence:

| # | Change | Depends on | Human authorization | Size vs 400-line budget |
|---|---|---|---|---|
| 1 | `quartzplay-openspec-consolidation`: commit canonical state, archive `staging-readiness`, mark `staging-foundation` superseded, retire stale worktrees | — | Commit/PR | Large but mostly moved artifacts; chained PRs (OpenSpec records / replay code and tests / migrations) |
| 2 | Live-state reconciliation inside `quartzplay-isolated-staging-bootstrap`: sanitized read-only inventory of Railway and Supabase staging | 1 | Read-only remote access to staging projects | Small |
| 3 | Foundation runtime proof inside `quartzplay-staging-foundations`: diagnostic replay, root-cause fix, two independent replays | 1 | Local Docker replay | Medium; defect-dependent |
| 4 | Bootstrap phases 2–4: bindings, zero-inventory attestation, smoke/acceptance | 2 | Staging Railway/Supabase changes per phase | Small–medium |
| 5 | `quartzplay-staging-relational` | 3 | Approval to start slice | High; chained PRs |
| 6 | `quartzplay-staging-security` | 5 | Approval to start slice | High; chained PRs |
| 7 | Remote staging apply | 4, 6, manifest gates | Explicit remote apply and deploy | Evidence-only |
| 8 | `quartzplay-production-homologation`: metadata comparison, runtime-config and service parity attestation | 7 | Read-only production metadata access | Medium |

### Risks

- Uncommitted Foundation, replay, migration, and OpenSpec work can be lost silently.
- OpenSpec disagrees with live remote state; decisions made from either alone will be wrong.
- Stale worktree trackers describe merged work as pending; continuing them would duplicate `bot/config.py` and readiness code.
- No valid runtime replay receipt exists; Relational, Security, and remote apply remain gated.
- Live staging services may already hold bindings or variables that were never attested against the isolation contract.
- The Railway access-check listing showed the staging project environment named `production`; environment naming must not be mistaken for the production project during any remote action.

### Ready for Proposal

Yes, for change 1 (`quartzplay-openspec-consolidation`). The orchestrator must confirm with the user: the delivery path for the consolidation commit and PR (branch target), whether to prune the stale worktrees, and authorization for the read-only staging inventory in change 2.
