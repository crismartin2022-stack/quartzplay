## Exploration: QuartzPlay staging readiness

### Current State
QuartzPlay exposes `/health`, which returns `200` without checking PostgreSQL, schema, or background dependencies. The API creates its asyncpg pool lazily with a 10-second pool timeout and 15-second command timeout, while `bot/db.py` creates tables through startup `CREATE TABLE IF NOT EXISTS` statements with no explicit timeout. API startup also launches several background tasks, and the poller opens its own pool and Telegram application. `Procfile` declares independent `web` and `worker` processes, but `start.sh` supervises both and terminates the API when the poller exits. No `/livez` or `/readyz` contract exists.

### Affected Areas
- `bot/casino_api.py` — add process-only liveness and bounded database/schema readiness handlers; avoid external API, Telegram, or business-query dependencies.
- `bot/db.py` — expose a read-only readiness seam and make schema/bootstrap operations obey explicit deadlines; do not treat implicit bootstrap as a versioned migration.
- `bot/server.py` — preserve poller startup/shutdown isolation and ensure poller failure cannot be reported as API readiness failure.
- `bot/start.sh`, `bot/start-api.sh`, `bot/start-poller.sh`, `bot/Procfile` — deployment process boundaries; staging should prefer independent `web`/`worker` processes, not the coupled supervisor for health semantics.
- `bot/tests/test_process_safety.py` — test API/poller process isolation and existing cleanup behavior.
- `bot/tests/test_staging_config.py` — test readiness responses under configured staging settings without secrets or live services.
- `bot/tests/` (new focused readiness tests) — strict RED-GREEN-REFACTOR coverage for status codes, timeouts, schema failures, and dependency isolation.

### Approaches
1. **Process liveness plus bounded database readiness** — `/livez` performs no I/O and returns `200` when the API process can serve requests. `/readyz` performs one bounded, read-only PostgreSQL/schema probe and returns `200` only when it completes; unavailable, timeout, or schema failure returns `503` with a stable non-secret reason. Use `asyncio.wait_for` around the complete readiness operation and a small configurable deadline, with no schema writes or migrations in the probe.
   - Pros: distinguishes restart health from traffic eligibility; fail-closed; cheap and deterministic; does not couple API to Telegram, odds, Sportradar, IAQP, or poller state.
   - Cons: requires a testable DB probe seam and a clear schema contract; current lazy pool/bootstrap code needs refactoring.
   - Effort: Medium

2. **Reuse `/health` and add dependency checks to it** — make the existing endpoint query PostgreSQL and report all services together.
   - Pros: small endpoint surface.
   - Cons: breaks liveness semantics; causes database/provider incidents to trigger unnecessary restarts; hides which dependency blocks readiness; couples API health to poller/external systems.
   - Effort: Low

### Recommendation
Choose Approach 1. Define `/livez` as process-only: `GET` returns `200` and a minimal stable body; it MUST NOT access DB, schema, Telegram, poller state, or external providers. Define `/readyz` as API traffic eligibility: it MUST run a read-only DB connectivity probe plus a minimal required-schema probe under one hard deadline (recommended default 2 seconds, configurable only within a bounded safe range), and MUST return `503` on timeout, connection failure, missing required relation/column, or any schema probe error. Readiness responses MUST avoid DSNs, exception text, secret values, and provider details. No request to `/readyz` may create or mutate schema; schema provisioning remains a separate deployment concern and current `CREATE TABLE IF NOT EXISTS` bootstrap must not be presented as a migration.

The API process MUST remain live and independently deployable when polling is disabled, Telegram is unavailable, or the poller exits. The worker MUST retain its own cleanup and exit status. Staging rollout MUST run the `Procfile` `web` and `worker` processes independently (or equivalent platform processes), and MUST NOT use coupled `start.sh` as the readiness authority unless its coupling is intentionally redesigned. Poller health may be observed separately, but it MUST NOT gate `/readyz`.

Strict TDD tests should first prove: `/livez` succeeds with DB failure; `/readyz` succeeds only after both probes; timeout returns `503` within the bound; connection and schema failures return `503` without secret leakage; readiness performs no DDL; API imports and serves without Telegram; poller disabled/exited does not change API liveness/readiness; and independent process definitions remain intact. Use mocked async probe seams, not cloud databases or secrets. Add an explicit test for the required-schema contract so missing schema is distinguishable from transient connectivity.

Rollout should be additive: ship handlers and tests, deploy API, configure platform health checks to use `/livez` for restart/liveness and `/readyz` for traffic, then enable worker separately after staging DB/schema evidence is verified. Rollback is code/process configuration rollback: restore the previous health-check paths and previous release, stop the worker independently if needed, and do not run destructive migrations or secret changes. No cloud access, migration execution, or secret inspection belongs in this slice.

### Risks
- The current lazy `get_db()` path can perform schema creation, so readiness must use a non-mutating seam or explicitly separate bootstrap from probe before implementation.
- Existing `start.sh` couples poller failure to API termination; using it unchanged would defeat process isolation.
- A schema probe that checks too little can report ready while business routes still fail; a probe that checks too much becomes slow and brittle. Keep the contract minimal, explicit, and versioned in tests.
- Background startup tasks are not visibly cancelled on API shutdown; readiness must not wait on or depend on them, and a later lifecycle change may need separate review.

### Ready for Proposal
Yes. Proposal should define the stable response contract, bounded deadline and failure taxonomy, minimal required-schema probe, independent process topology, strict TDD test matrix, and additive rollout/rollback. No cloud, migration, secret, commit, push, or PR work is required for exploration.
