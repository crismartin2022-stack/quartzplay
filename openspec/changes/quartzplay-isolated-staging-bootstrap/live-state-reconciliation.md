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
| API variable names | No Telegram credentials (2.2) | Staging and production identity lists (consumed by the fail-closed `_require_disjoint` checks in `bot/config.py`), `DATABASE_URL`, `TELEGRAM_TOKEN`, `ADMIN_IDS`, `ALLOWED_ORIGINS`, service key | `TELEGRAM_TOKEN` is present while the task says none; a fuller listing on 2026-09-15 confirmed `APP_ENV` and `POLLING_ENABLED` are present (the first listing was partial) | Owner confirmed on 2026-09-15 that the token belongs to a staging bot; amend 2.2 wording. `APP_ENV` and `POLLING_ENABLED` confirmed present; their values remain unverified |
| Database binding | Staging PostgreSQL (2.2) | No PostgreSQL service in the project; `DATABASE_URL` name present. 2026-09-16 (owner-authorized, match-only): the host is the Supabase pooler, the URL carries the staging project reference, and the host is listed in `STAGING_DATABASE_HOSTS` | None: target verified as the staging Supabase database | None |
| Worker | Worker deployment status (2.3) | 2026-09-16: configured with root directory `bot`, start command `bash start-poller.sh`, the 14 variables required by the poller plus `WORKER_ID`, and source branch `staging`. First deploy crashed with `worker_id.missing`; after adding `WORKER_ID` it runs as `staging-worker-1` with Telegram long-polling active and no configuration errors | Startup bootstrap in `bot/db.py` created 7 indexes outside the migration chain | Reconcile the 7 indexes in the Relational slice |
| Frontend | Not covered by bootstrap tasks | 2026-09-16: configured with root directory `frontend`, the 7 validated build variables (host-based casino mode disabled with a reserved `.invalid` placeholder), and source branch `staging`. Serves the production build: `GET /` 200 with the SPA root and bundle; `/casino` 200 | None | None |
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
