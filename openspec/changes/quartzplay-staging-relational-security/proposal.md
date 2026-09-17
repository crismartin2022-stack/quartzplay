# Proposal: Staging Relational and Security Slices

## Intent

Homologate the QuartzPlay staging database schema with production. Staging has only the Foundation slice (tables, columns, sequences, extensions); production also has keys, indexes, foreign keys, and a reporting view. Both environments exposed every table to the Supabase Data API; that exposure was closed live on 2026-09-17 with owner approval and must now be versioned.

## Evidence (2026-09-17, read-only parity)

| Object | Production | Staging |
|---|---|---|
| Tables / sequences | 80 / 72 | 80 / 72 |
| Primary / unique / foreign keys | 79 / 8 / 3 | 0 / 0 / 0 |
| Indexes | 231 | 7 (runtime bootstrap indexes, identical in production) |
| Views | 1 | 0 |
| Tables without RLS; anon and authenticated grants | 80; 567 each (before lockdown) | 80; 560 each (before lockdown) |

No application in the QuartzPlay, IAQP, or panel repositories uses the Supabase Data API; all connect as the table-owning role with `BYPASSRLS`.

## Scope

- Five migrations generated from the production schema catalog (schema only): keys, standalone indexes, foreign keys, reporting view, security baseline.
- The seven runtime bootstrap indexes use `IF NOT EXISTS`; every other object is unguarded so drift stops the migration.
- Governance tests and the Foundation disposable replay harness accept the extended chain while keeping the Foundation harness Foundation-only.
- Apply to staging only, after a transactional dry run.

Out of scope: production migration history (production already holds these objects), data changes, RLS policies for Data API clients (none exist).

## Rollback

Staging: drop the view, foreign keys, standalone indexes, and keys in reverse order, and apply the saved grants rollback SQL. Repository: revert the PR.
