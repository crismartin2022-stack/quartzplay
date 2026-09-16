# Tasks: QuartzPlay Staging Foundations — Safe Portless Psql Replay

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 300-450 authored lines, excluding existing SQL and quarantined bytes |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 chain/extension; PR 2 psql replay; PR 3 staging gate |
| Delivery strategy | auto-chain |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|---|---|---|---|---|---|
| 1 | Repair chain and extension contract | PR 1, base feature/tracker | static tests | chain rollback |
| 2 | Replace unavailable CLI-image replay with portless internal-psql proof | PR 2, base PR 1 | `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` | N/A until separately approved; exact local image, two disposable targets, no ports; destroy on interruption | replay/policy/tests/receipt rollback |
| 3 | Close staging apply gate | PR 3, base PR 2 | manifest validation | manifest rollback |

## Phase 1: Executable Chain Remediation (PR 1)

- [x] 1.1 Quarantine current local `20260907191524_baseline.sql`; retire all `20260907*_baseline.sql` files from executable migrations; preserve permitted provenance and test no fake ledger entries.
- [x] 1.2 **RED:** extend `bot/tests/test_staging_schema.py` for chain, duplicate objects, provider-owned `extensions`, exact versions, and normalized parity.
- [x] 1.3 **GREEN:** modify the extension migration to assert existing `extensions` and exact `pgcrypto` 1.3/`uuid-ossp` 1.1 capability/state before and after guarded creation.

## Phase 2: Strict Runner and Portless Disposable Replay (PR 2)

- [x] 2.1 **RED/GREEN:** repair `frontend/src/projectMemoryValidation.test.js`; run configured strict runner and focused backend tests.
- [x] 2.2 **RED:** extend `bot/tests/test_disposable_replay.py` for exact image/arm64/15.8 gates, no CLI/tool image, no ports or host URLs, read-only migration mount, and two distinct owned targets; preserve link/cloud/seed/reset rejection.
- [x] 2.3 **RED:** add interruption and ledger tests: any migration or ledger-insert failure invalidates target; cleanup destroys target; rerun/resume/repair, duplicates, retired versions, gaps, and extras are rejected.
- [x] 2.4 **GREEN:** modify `bot/tools/disposable_replay.py` and policy to use only target-local `psql --no-psqlrc --set=ON_ERROR_STOP=1 --file`; bootstrap reviewed ledger columns after empty preflight; record version/name only after each successful file, in lexical order; never claim CLI parity.
- [x] 2.5 **GREEN:** validate exact runtime and catalogs before/after apply: `supabase/postgres:15.8.1.060`, arm64, `15.8`, provider `extensions`, exact extensions, 80/845/72 parity, ownership/defaults/nullability, zero rows/deferred objects, and identical normalized A/B snapshots.
- [x] 2.6 **REFACTOR/VERIFY:** emit truthful redacted receipt with `executor=container-internal-psql` and `ledger_semantics=psql-success-recorded`; delete stale receipt first; cleanup all resources in dependency order, continue after failures, prove absence, and write passed receipt only after both targets are destroyed.
- [x] 2.7 **VERIFIER REMEDIATION:** classify inspection absence only when stderr exactly equals Docker's full resource-kind-specific absence form; reject mixed permission/unknown prefixes even when they include valid absence text.

## Phase 3: Explicit Staging Apply Gate (PR 3)

- [x] 3.1 Update `migration-manifest.md` with destination identity, empty tables/ledger, rollback owner, change window, extension capability, and data-owner approvals; retain redaction/no-production policy.
- [x] 3.2 Record static and replay evidence plus pre-binding recreation rollback and post-binding forward-compensation procedure; require explicit owner approval before staging execution.
  - 2026-09-15: static evidence recorded; there is NO replay evidence. The owner replaced the replay gate with applied-target evidence on the empty staging project (recorded exception). Rollback procedures and owner approval are in `migration-manifest.md`.
- [x] 3.3 Execution is open for the isolated staging target only, under the recorded owner exception; production execution stays closed. Stop before Relational/Security work; do not add constraints, foreign keys, indexes, views, grants, RLS, policies, cloud, runtime, or production changes.
  - 2026-09-15: rewritten from "keep execution closed until two clean approved replays pass", which the owner exception superseded. Deviation recorded in `apply-progress.md`. Verified after apply: 0 constraints, 0 indexes, 0 views in the destination.
