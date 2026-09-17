# Homologation Matrix (verified 2026-09-17 UTC)

Values, credentials, connection strings, and project references are omitted. Counts come from read-only catalog queries.

## Topology

| System | Production (Railway / Supabase) | Staging (Railway / Supabase) |
|---|---|---|
| QuartzPlay | `laudable-enthusiasm`: `quartzplay-api`, `quartzplay-bot`, `quartzplay-frontend` / QuartzPlay production project | `QuartzPlay Staging`: `staging-api`, `staging-worker`, `staging-frontend` / "QuartzPlay Staging" |
| IAQP service | `pleasing-gratitude`: `IAQP` / "IAQP Service Production" | `IAQP Staging`: `staging-api` / "IAQP Staging" |
| Panel | `laudable-enthusiasm`: `panel-web`, `panel-queue`, `panel-scheduler`, `panel-redis` / "IAQP Production" | `Panel Staging`: `panel-web`, `panel-queue`, `panel-scheduler`, `panel-redis` / "Panel Staging" |

Retired and kept for rollback until owner acceptance: `Postgres-RETIRADO-20260916` in `laudable-enthusiasm` and in `pleasing-gratitude`.

## Runtime Parity

| Service pair | Production | Staging |
|---|---|---|
| QuartzPlay API | `main`, SUCCESS, `APP_ENV=production`, readyz 200 | `staging`, SUCCESS, `APP_ENV=staging`, readyz 200 |
| QuartzPlay bot / worker | `main`, SUCCESS | `staging`, SUCCESS |
| QuartzPlay frontend | `main`, SUCCESS, 200 | `staging`, SUCCESS, 200 |
| IAQP service | `main`, SUCCESS, ready 200 | `staging`, SUCCESS, ready 200 |
| Panel web | `main`, SUCCESS, up 200 | `staging`, SUCCESS, up 200 |
| Panel queue / scheduler | `main`, SUCCESS, restart Always | trigger `staging`, SUCCESS, restart Always |

Code: IAQP and panel `main` equal `staging`. QuartzPlay `staging` is ahead only by the schema slices and tests (release pending).

## Database Structure Parity (production vs staging, differing signatures)

| System | Tables | Columns | Constraints | Indexes | Views | Extensions | Differences |
|---|---|---|---|---|---|---|---|
| QuartzPlay | 80 | 854 | 90 | 231 | 1 | 2 | 0 |
| IAQP service | 4 | 40 | 23 | 9 | 0 | 2 | 0 |
| Panel | 51 (incl. 8 ledger partitions) | 514 | 94 | 169 | 0 | 3 | 0 |

## Security Parity

| System | Production | Staging |
|---|---|---|
| QuartzPlay | RLS on all tables; 0 anon/authenticated grants (closed 2026-09-17, was 567) | same (closed 2026-09-17, was 560) |
| IAQP service | same (closed at migration) | same (closed 2026-09-17, was 56) |
| Panel | same (closed at migration) | same (closed at creation, was 357) |

All application roles own their tables and bypass RLS; no repository uses the Supabase Data API. Rollback grant scripts are stored outside the repository.

## Known Differences (intentional)

- Panel staging has no provider credentials and closed provider callbacks until sandbox credentials arrive.
- Panel staging holds no production data; production has live wallet data.
- PSP is disabled in both environments until the production gate (issue #35) is satisfied.
