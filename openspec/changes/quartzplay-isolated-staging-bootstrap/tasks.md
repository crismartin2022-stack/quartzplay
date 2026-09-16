# Tasks: QuartzPlay Isolated Staging Bootstrap

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 180-260 (evidence records; 0 source lines) |
| 400-line budget risk | Low |
| Chained PRs recommended | Yes, to isolate console approvals and rollback boundaries |
| Suggested split | Tracker -> GitHub -> Railway -> Supabase -> smoke acceptance |
| Delivery strategy | ask-always |
| Chain strategy | feature-branch-chain |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: feature-branch-chain
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Protected staging lane | PR 1 | Base: tracker `staging`; GitHub evidence only. |
| 2 | Isolated Railway runtime | PR 2 | Base: PR 1; owner gate, no local CLI linkage. |
| 3 | Empty Supabase boundary | PR 3 | Base: PR 2; data-owner gate, no app binding. |
| 4 | Sanitized smoke acceptance | PR 4 | Base: PR 3; `/livez`; `/readyz` blocked without schema. |

## Phase 1: GitHub Gate

- [x] 1.1 RED: Record approved `main` commit and observed same-repository required-check name; obtain owner approval before GitHub action.
- [x] 1.2 GREEN: Create protected `staging` from approved `main`; require PRs, one approval, stale-review dismissal, resolved conversations, and observed check; block direct/force pushes and deletion.
- [x] 1.3 Verify: Create staging deployment environment restricted to `staging`; retain value-free policy attestation. Rollback: remove only staging rules/environment.

## Phase 2: Railway Isolation

- [x] 2.1 RED: Obtain owner approval and prepare value-free checklist for QuartzPlay selection, distinct API/worker/PostgreSQL/Redis, staging bindings, and prohibited identities.
- [x] 2.2 GREEN: Create Railway staging environment and distinct resources; bind API/worker only to staging `DATABASE_URL`, set `APP_ENV=staging` and disjoint allowlists, set `POLLING_ENABLED=false`, and provide no Telegram credentials.
  - 2026-09-16: API and worker bind only to the staging Supabase database (pooler host verified in `STAGING_DATABASE_HOSTS`); `APP_ENV=staging`; allowlists disjoint and enforced fail-closed by `_require_disjoint`. Differs from the task text on two owner-approved points: the worker has `POLLING_ENABLED` enabled (it is the poller; the API keeps it disabled), and a Telegram token for the staging bot is present (owner-confirmed 2026-09-15; production bot identities are rejected at startup).
- [x] 2.3 Verify: Record sanitized resource/binding attestations and API/worker deployment plus Redis health statuses. Rollback: stop/delete staging worker/API, remove bindings, then staging PostgreSQL/Redis.
  - 2026-09-15 reconciliation: API deployed, worker never deployed, Redis deployed, no PostgreSQL service in the project; Telegram token owner-confirmed as a staging bot. See live-state-reconciliation.md.
  - 2026-09-16: API running (`/readyz` ready); worker running as `staging-worker-1` after a first crash (`worker_id.missing`) fixed by adding `WORKER_ID`; frontend serving. Redis health is recorded from its successful deployment status only; no direct Redis probe was run.

## Phase 3: Supabase Boundary

- [x] 3.1 RED: Obtain data-owner approval naming `quartzplay-staging-foundations` schema authority; reject production, non-empty, seeded, migrated, or app-bound candidates.
  - 2026-09-15: data owner approved the Foundation chain as the schema authority for the isolated staging project, which was verified empty and unmigrated before the apply.
- [x] 3.2 GREEN: Create isolated non-production Supabase project/schema with zero rows, storage objects, and Auth users; do not create app bindings or provide production credentials.
  - 2026-09-15: the project already existed and was empty; the Foundation chain was applied to it (80 tables, 72 sequences, no seeds, no rows). No application binding was created and no production credential was used.
- [ ] 3.3 Verify: Record sanitized aggregate-zero and no-production-credential attestations with data-owner and owner acceptance. Rollback: remove bindings before deleting only staging Supabase.
  - 2026-09-15 reconciliation: the staging Supabase project exists and is active with 0 Edge Functions; zero-inventory was unproven at inventory time. See live-state-reconciliation.md.
  - 2026-09-15 apply: schema-only Foundation chain applied with no seeds and no rows; destination reports 80 tables and 72 sequences and no constraints, indexes or views. Storage objects and Auth users remain unmeasured, so owner acceptance is still required before this task closes.

## Phase 4: Smoke and Acceptance

- [x] 4.1 Verify bootstrap liveness: record value-free API `/livez` HTTP 200 and `{"status":"live"}`; this proves process bootstrap only, not database schema or parity.
  - 2026-09-16: `/livez` returned HTTP 200 `{"status":"live"}`.
- [x] 4.2 Verify readiness prerequisite: run `/readyz` only after approved `quartzplay-staging-foundations` schema exists in isolated Railway PostgreSQL with required `users` and `agencias` columns; otherwise record Blocked, never Passed or Failed.
  - 2026-09-16: run after the approved Foundation schema was applied; the isolated database is the staging Supabase project, not Railway PostgreSQL. `/readyz` returned HTTP 200 `{"status":"ready"}`, before and after the worker started.
- [ ] 4.3 Verify: Record GitHub guard, worker deployment, Redis health, and zero Supabase inventory; reject secrets, IDs, domains, PSP/Telegram data, bindings, probes, parity, or production-readiness claims.
  - 2026-09-16 partial: GitHub guard recorded under 1.x; worker deployment running; Redis from deployment status only. Zero Supabase inventory is NOT proven: rows, Auth users and Storage objects were never measured, and the worker has already started against the database. Stays open.
- [ ] 4.4 Obtain final owner acceptance and record bounded rollback order; retain `staging` unless owner approval confirms no open PR, deployment, or child-branch dependent.
