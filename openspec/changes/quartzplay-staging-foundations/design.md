# Design: QuartzPlay Staging Foundations

## Technical Approach

Replace unavailable `supabase/cli:2.113.0` with `psql` already inside locally verified arm64 `supabase/postgres:15.8.1.060`. Replay the three plain-SQL Foundation migrations against two independent disposable database containers. Each target owns a volume and `--internal` network, publishes no port, and receives only a read-only mount containing the exact migration files. Host code may manage Docker and stream control SQL; every database connection is `docker exec` to local `psql` inside that target. No Supabase CLI, tool container, host database URL, seed, linked project, cloud, staging, or production access is allowed.

## Architecture Decisions

| Decision | Choice | Tradeoff / rationale |
|---|---|---|
| Runtime | Require exact tag `supabase/postgres:15.8.1.060`, OCI architecture `arm64`, PostgreSQL `server_version = 15.8`, and image-bundled `psql`. | Uses verified local asset and removes unavailable dependency. Tag identity is validated at execution but image/container IDs remain excluded from artifacts by specification. |
| Topology | Run targets A and B separately, each on a unique owned internal network and volume; require empty/no host bindings from Docker inspection before and after every apply. | Strong portless isolation; full Supabase service-stack parity is not claimed. |
| Migration executor | For each lexical file, invoke target-local `psql --no-psqlrc --set=ON_ERROR_STOP=1 --file ...`; only zero exit permits ledger recording and next file. | Preserves migration bytes and their own transactions. No migration rewriting or shell SQL splitting. |
| Ledger | Bootstrap `supabase_migrations.schema_migrations` with reviewed compatible columns (`version text PRIMARY KEY`, `statements text[]`, `name text`) only after empty-target preflight. Record exact version/name immediately after that file succeeds; reject duplicates, retired `20260907*`, gaps, extras, repair, or resume. | `psql` can truthfully prove required ordered version ledger. It cannot reproduce or validate undocumented CLI-specific statement parsing byte-for-byte without exact CLI 2.113.0; receipt MUST state `ledger_semantics: psql-success-recorded`, not Supabase-CLI parity. Because migrations contain `BEGIN/COMMIT`, DDL and ledger insert are not atomic. Any interruption or insert failure invalidates and destroys whole target—never repair ledger. |
| Cleanup | Label every generated resource with unique ownership token; finally attempt all removals in dependency order, continue after failures, then independently inspect every resource as absent. | Passed receipt impossible unless both targets are proven destroyed. |

## Data Flow

```text
host Docker control
  -> internal net A -> db A: local psql -> migrations -> ledger -> catalog proof
  -> internal net B -> db B: local psql -> migrations -> ledger -> catalog proof
  -> normalized A/B comparison -> cleanup/absence proof -> redacted receipt
```

Per target: validate exact runtime and no bindings; wait with bounded `docker exec ... pg_isready`; use `psql` to prove `extensions` schema, exact extension availability/state, zero public application tables, and absent-or-empty ledger; create ledger contract; apply `20260914090000`, `20260914090100`, and `20260914090200`; record each success; validate final catalogs; clean up. Failure at any point blocks comparison and still forces cleanup.

## Interfaces / Contracts

Receipt version advances. Safe exact fields: `status`, `redacted`, exact database tag, architecture, server version, `executor=container-internal-psql`, `ledger_semantics`, topology booleans, per-target preflight/apply/validation booleans, exact three ledger versions/names, aggregate counts, extension/version gates, normalized parity booleans, bounded failure codes, and cleanup attempted/succeeded/absence booleans for every resource. Omit credentials, URLs, SQL/catalog rows, source checksums, resource names/IDs, and private topology. Delete stale receipt before resource creation; write a passed receipt only after successful absence inspection. Cleanup failure yields no passed receipt.

Final validation requires exactly 80 tables, 845 columns, 72 owned sequences, exact manifest parity, `pgcrypto` 1.3 and `uuid-ossp` 1.1 in `extensions`, zero rows, zero deferred relational/security/grant/default-privilege objects, exact ledger, and identical normalized A/B snapshots.

## File Changes

| File | Future action | Description |
|---|---|---|
| `bot/tools/disposable_replay.py` | Modify | Remove tool/CLI container; add target-local `psql`, success-gated ledger writer, exact receipts, and exhaustive cleanup proof. |
| `bot/tools/disposable-replay-policy.json` | Modify | Remove CLI image; pin database tag, architecture, executor, and ledger semantics. |
| `bot/tests/test_disposable_replay.py` | Modify | Cover ordering, non-atomic failure invalidation, no repair/resume, no ports, receipt truthfulness, and cleanup continuation/absence. |
| `openspec/changes/quartzplay-staging-foundations/local-disposable-replay-receipt.json` | Replace after separately approved replay | Store redacted two-target proof only. |

API, frontend, Telegram, Foundation SQL, product data, and cloud boundaries remain unchanged.

## Testing Strategy

Unit/static tests mock Docker/process boundaries and prove exact command order and fail-closed states. Separately approved integration replay proves both real targets. This design phase performs no Docker, SQL, runtime, cloud, or Git action.

## Migration / Rollout

No remote rollout authorized. Runtime, extension, ledger, parity, or cleanup drift blocks execution. Disposable rollback is forced destruction; post-binding rollback remains reviewed forward compensation.

## Open Questions

None. Supabase-CLI ledger statement-array parity remains explicitly unsupported; required ordered success ledger remains implementable and truthfully verifiable with `psql`.
