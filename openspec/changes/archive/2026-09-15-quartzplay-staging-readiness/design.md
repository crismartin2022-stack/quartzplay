# Design: QuartzPlay Staging Readiness

## Technical Approach

Add process-only FastAPI liveness and a fail-closed readiness coordinator. `GET /livez` returns its literal body without calling any seam. `GET /readyz` runs API-pool acquisition plus a read-only database/schema probe under one `asyncio.wait_for` deadline. Readiness never calls worker `get_pool()` or `_create_schema()`, and never observes Telegram, poller, provider, wallet, odds, or background-task state.

## Architecture Decisions

| Decision | Alternatives / tradeoff | Choice and rationale |
|---|---|---|
| Probe boundary | Reuse `db.get_pool()`, which runs DDL; query in handler, which is hard to test. | Add a typed, read-only probe in `bot/db.py`, but pass the API pool from `casino_api.get_db()`. This isolates probe from worker bootstrap and gives tests one async seam. |
| Schema contract | Probe every business table, becoming slow/brittle; use only `SELECT 1`, missing schema drift. | After connectivity `SELECT 1`, inspect `information_schema.columns` for `users.id`, `users.balance`, `agencias.code`, and `agencias.status`. These represent core account/wallet and agency traffic while remaining a small, versioned contract. |
| Deadline | Depend on 10/15-second pool defaults; separate per-step timeouts. | Wrap complete operation once with `asyncio.wait_for`. Add optional `READINESS_TIMEOUT_MS` to staging settings: default `2000`; reject non-integer or values outside `100..2000` with stable `readiness_timeout.invalid`. One budget prevents cumulative latency. |
| Failure mapping | Return exception detail or one generic failure. | Phase-typed failures map to `database_unavailable` or `schema_unavailable`; `asyncio.TimeoutError` maps to `timeout`. Responses contain only `status` and `reason`; logs contain stable reason codes, not exception text. |
| Process authority | Modify coupled `start.sh` or gate API on worker state. | Preserve `Procfile` foreground `web`/`worker` processes as staging authority. `start.sh` remains legacy and out of scope; worker cleanup/exit stays in `server.py`. |

## Data Flow

```text
GET /livez ──> {"status":"live"}

GET /readyz ──> wait_for(deadline)
                  └─> casino_api.get_db() ─> db.probe_readiness(pool)
                                               ├─> SELECT 1
                                               └─> information_schema.columns
                  ├─ success ─> 200 {"status":"ready"}
                  └─ failure ─> 503 {"status":"not_ready","reason":"<stable-code>"}

worker ─> db.get_pool() ─> _create_schema()     (separate lifecycle; never called above)
```

## File Changes

| File | Action | Description |
|---|---|---|
| `bot/tests/test_readiness.py` | Create | Endpoint bodies, route status, deadline, taxonomy, secrecy, dependency isolation, schema contract, and no-DDL tests. |
| `bot/tests/test_staging_config.py` | Modify | Default, accepted bounds, and rejected timeout configuration. |
| `bot/tests/test_process_safety.py` | Modify | Prove independent Procfile processes and worker exit/disablement cannot gate API probes. |
| `bot/config.py` | Modify | Parse immutable bounded readiness deadline without exposing values in errors. |
| `bot/db.py` | Modify | Add typed read-only connectivity/schema probe; leave worker bootstrap ownership explicit. |
| `bot/casino_api.py` | Modify | Add `/livez`, `/readyz`, deadline coordinator, and sanitized responses. |
| `bot/server.py`, `bot/Procfile`, `bot/start*.sh`, frontend | Verify only | No runtime/process/frontend change planned. |

## Interfaces / Contracts

- `GET /livez` → `200`, exactly `{"status":"live"}`.
- `GET /readyz` → `200`, exactly `{"status":"ready"}`; otherwise `503`, exactly `{"status":"not_ready","reason":"database_unavailable|schema_unavailable|timeout"}`.
- `probe_readiness(pool) -> None`; raises typed database/schema failures and executes only `SELECT` statements.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Timeout parser and probe classification/schema rows/no DDL | `pytest`, fake pool/connection, `asyncio.run`; no live DB or secrets. |
| Integration | FastAPI route contracts, deadline, sanitized failures, no Telegram/provider/poller calls | Existing environment-reload pattern plus mocked async seam and test client. |
| Process contract | Web/worker independence and cleanup ownership | Static Procfile/script assertions plus existing subprocess/fake-application tests. |

Strict sequence: add focused failing test, run RED, add minimum behavior, run GREEN, refactor, rerun focused `python -m pytest bot/tests`, then full available frontend test/build checks only if shared files are unexpectedly touched.

## Migration / Rollout

No migration, cloud configuration, secret work, or live validation. Forecast: 260–350 changed lines. Keep one reversible slice under 400 lines; if forecast crosses 400, auto-chain green work units as (1) config/probe and (2) endpoints/process contracts. Rollback reverts endpoint/probe/config code and restores prior health-check paths/release; stop worker independently. No data action.

## Open Questions

None.
