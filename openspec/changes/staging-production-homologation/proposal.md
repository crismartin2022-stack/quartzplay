# Proposal: Staging and Production Homologation

## Intent

Make staging a faithful, isolated copy of production for the three systems (QuartzPlay, IAQP service, panel) so every change can be validated in staging before release, with all databases on Supabase and closed to the Supabase Data API.

## Owner Decisions (2026-09-16/17)

- All databases live in Supabase; Railway databases are retired.
- Separate Supabase projects per system and environment.
- Panel staging deploys branch `staging`; it never holds production provider credentials. Sandbox credentials are requested from providers; meanwhile provider callbacks stay closed and the built-in demo simulator can exercise the wallet.
- Every production change was executed step by step with explicit owner approval.

## Scope

- IAQP service: production database migrated to Supabase and code released to `main`.
- QuartzPlay: staging Relational and Security slices; Data API lockdown in both environments.
- Panel: new staging (Railway project and Supabase project).
- Parity verification of runtime and database structure.

See `homologation-matrix.md` for the evidence and `tasks.md` for open items.
