# Live-State Reconciliation: QuartzPlay Isolated Staging Bootstrap

- **Date:** 2026-09-15
- **Recorded by:** `quartzplay-openspec-consolidation`
- **Method:** read-only listing with the existing Railway and Supabase CLI sessions; variable names only. No values, identifiers, domains, hostnames, or rows were read or recorded.
- **Authorization:** owner-approved for the two staging projects only; no production project was queried.

## Observations

| Resource | Expected by tasks | Observed | Divergence | Owner action |
|---|---|---|---|---|
| Railway staging project | Isolated staging environment (2.2) | Project `QuartzPlay Staging` exists; its single environment is named `production` | Environment name reads as production | Optional rename; owner decision pending, non-blocking |
| API service | API bound only to staging database, `APP_ENV` set to staging, disjoint allowlists, polling disabled (2.2) | `staging-api` deploys from branch `staging`; last deployment succeeded on 2026-09-14; a public domain exists | Records described empty service identities only | Attest bindings under 2.3 |
| API variable names | No Telegram credentials (2.2) | Staging and production identity lists (consumed by the fail-closed `_require_disjoint` checks in `bot/config.py`), `DATABASE_URL`, `TELEGRAM_TOKEN`, `ADMIN_IDS`, `ALLOWED_ORIGINS`, service key | `TELEGRAM_TOKEN` is present while the task says none; `APP_ENV` and `POLLING_ENABLED` were not in the reported names | Owner confirmed on 2026-09-15 that the token belongs to a staging bot; amend 2.2 wording; confirm `APP_ENV` and `POLLING_ENABLED` |
| Database binding | Staging PostgreSQL (2.2) | No PostgreSQL service in the project; `DATABASE_URL` name present | Database target unattested | Owner expects the Supabase `QuartzPlay Staging` database; proof needs a value-level host match under separate approval |
| Worker | Worker deployment status (2.3) | `staging-worker` has no source and was never deployed | Worker absent at runtime | Deploy and attest under 2.2–2.3 |
| Frontend | Not covered by bootstrap tasks | `staging-frontend` has no source and was never deployed; a public domain is pre-provisioned | None | Future change |
| Redis | Redis health (2.3) | Deployed from an image; private networking only | None | Attest under 2.3 |
| Supabase project | Empty isolated project (3.2) | `QuartzPlay Staging` is active, PostgreSQL 17, 0 Edge Functions. On 2026-09-15 the Foundation chain was applied to it: 80 tables, 72 sequences, no seeds, no rows, and no constraints, indexes or views | Records said creation was blocked on the owner; the schema is now present | Tasks 3.1 and 3.2 closed; 3.3 still needs Storage and Auth inventory plus owner acceptance |
| Earlier `staging-isolated` environment (see `apply-progress.md`) | — | Not visible to the current CLI account | Unknown | Owner to confirm whether it still exists or should be removed |

## Task Status Effect

- Tasks 2.2, 2.3, and 3.1–3.3 stay open; this inventory closes no task.
- No completed task depends on a resource the inventory failed to observe. Tasks 1.1–1.3 (GitHub guard) are outside inventory scope and keep their recorded attestation.

## Commands (identifiers replaced)

- `railway list --json`
- `railway service list --project <ref> --environment <env> --json`
- `railway deployment list --project <ref> --environment <env> --service <name> --limit 1 --json`
- `railway variable list --project <ref> --environment <env> --service <name> --json | jq keys`
- `supabase projects list -o json`
- `supabase functions list --project-ref <ref> -o json`
