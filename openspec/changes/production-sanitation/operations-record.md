# Operations Record: Production Sanitation (2026-09-16)

All times UTC. Values, credentials, connection strings, and project references are intentionally omitted; only names, statuses, and counts are recorded.

## Railway Production Topology After Sanitation

Project `laudable-enthusiasm`, single environment `production`.

| Service (new name) | Former name | Purpose | Source |
|---|---|---|---|
| `quartzplay-api` | `amusing-vision` | QuartzPlay API (`api.iaqp.lat`) | `quartzplay` repo, root `/bot` |
| `quartzplay-bot` | `quartzplay` | Telegram bot poller | `quartzplay` repo, root `/bot` |
| `quartzplay-frontend` | `valiant-gentleness` | QuartzPlay web frontend (`iaqp.lat`) | `quartzplay` repo, root `/frontend` |
| `panel-web` | `panel-multiskin` | Panel web and provider wallet callbacks (`panel.marcas.lat`, `test.marcas.lat`) | `panel-multiskin` repo |
| `panel-queue` | `Worker` | Panel queue worker (Redis) | `panel-multiskin` repo |
| `panel-scheduler` | `resilient-strength` | Panel scheduled jobs | `panel-multiskin` repo |
| `panel-redis` | `Redis` | Panel cache, sessions, queues | Redis image |
| `Postgres-RETIRADO-20260916` | `Postgres` | Retired panel database kept for rollback | Postgres image |

Renaming kept domains and private hosts unchanged, triggered no deploys, and Railway updated service references automatically (resolved values verified identical).

## Changes

| # | Time | Change | Verification |
|---|---|---|---|
| 1 | 16:58 | Bot poller: production polling identity configured (`APP_ENV`, `POLLING_ENABLED`, `WORKER_ID`, bot username) | Polling steady with HTTP 200 |
| 2 | 17:30–17:48 | Frontend: seven production variables set without redeploy; release PR #33 | First successful frontend deploy since 2026-09-08; SPA and bundle 200; bundle has no staging references |
| 3 | 18:44 | Bot database switched to the API database (reference variable) | Deploy SUCCESS; zero database errors; polling steady after deploy overlap |
| 4 | 19:05 | Supabase project "IAQP Production" created (us-west-2) | ACTIVE_HEALTHY |
| 5 | 19:20 | Panel migration rehearsal into the empty Supabase project | 51 tables; row counts, ledger and balance totals, partitions, sequences, migrations all match; RLS on every table; no anon or authenticated grants |
| 6 | 19:31–19:41 | Panel cutover: final copy, verification, database variables switched on the three panel services, redeploy | Services SUCCESS; zero database errors; `/up` 200 on all panel domains; no writes to Railway during the window |
| 7 | 20:48 | Acceptance and final backup | New presence snapshots land only in Supabase; Railway has zero client connections; full dump saved outside Railway |
| 8 | 21:05–21:14 | Cleanup: retired Postgres renamed; `motivated-education` and environment `staging-isolated` (with its two services) deleted by the owner | Remaining services SUCCESS; API `readyz`, frontend, and panel `/up` 200 |
| 9 | 21:25 | Descriptive service names applied | References auto-updated; no variable changes; health checks 200 |
| 10 | 21:42 | PSP webhook authentication merged (PR #34) and deployed to staging | Bot suite 137 passed; staging `readyz` 200 |

## Findings

- The bot and the API used different databases; the bot database was the panel database and held no bot data.
- The panel web container runs database migrations and the seeder on every start; the target database must hold schema and data before its connection changes.
- Missing monthly ledger partitions break wallet writes; partitions exist through 2027-03 and the weekly scheduler job extends them.
- Supabase exposes `public` tables through the Data API unless grants are revoked; the panel tables were locked down.

## Rollback

- Panel: restore the saved database variables on `panel-web`, `panel-queue`, `panel-scheduler` and redeploy (owner-run script). Valid while `Postgres-RETIRADO-20260916` exists; writes made in Supabase after the cutover would need manual reconciliation.
- Bot database: point the bot back to its previous database variable and redeploy.
- Frontend: revert PR #33 or redeploy the previous deployment.
