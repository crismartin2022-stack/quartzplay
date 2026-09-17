# Tasks: Staging Relational and Security Slices

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | about 800 generated SQL plus about 120 tests and harness |
| 400-line budget risk | High (generated DDL) |
| Chained PRs recommended | No |
| Suggested split | Single PR; generated SQL reviewed by counts and replay |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: High

## Phase 1: RED

- [x] 1.1 Extend the chain governance test to the pinned Foundation plus five slice files; add structural tests for the slice files (counts, no data, no owners, guarded bootstrap indexes only, lockdown statements).
- [x] 1.2 Add a harness test proving the Foundation replay lists only Foundation files when later slices exist.

## Phase 2: GREEN

- [x] 2.1 Generate the five schema-only migrations from the production catalog.
- [x] 2.2 Restrict the Foundation disposable replay harness to Foundation files.
- [x] 2.3 Run the bot suite green.

## Phase 3: Verify

- [x] 3.1 Replay the full chain on a disposable Postgres 17 container: constraints 79/8/3, 231 indexes, 1 view, no RLS gaps, no anon grants.
- [x] 3.2 Transactional dry run against staging, then apply with the Supabase CLI and rerun the parity check (2026-09-17: dry run 79/8/3, 231 indexes, 1 view; applied; parity 0 differences).

## Phase 4: Delivery

- [x] 4.1 Open the PR into `staging` (PR #41, merged).
