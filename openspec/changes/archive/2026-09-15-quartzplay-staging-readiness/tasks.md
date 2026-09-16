# Tasks: QuartzPlay Staging Readiness

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | One reversible PR slice: config + probe + endpoints + tests |
| Delivery strategy | single-pr |
| Chain strategy | pending |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: pending
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Staging readiness contract | PR 1 | One reviewable slice; tests stay with behavior; revert restores prior health paths |

## Phase 1: RED Tests / Contracts

- [x] 1.1 Create `bot/tests/test_readiness.py` with failing `/livez` and `/readyz` success, failure taxonomy, sanitized body, timeout, no-I/O, no-DDL, and Telegram/poller/provider isolation tests.
- [x] 1.2 Extend `bot/tests/test_staging_config.py` with failing default, 100–2000 ms bounds, non-integer, and out-of-range `READINESS_TIMEOUT_MS` cases; assert stable `readiness_timeout.invalid` without value leakage.
- [x] 1.3 Extend `bot/tests/test_process_safety.py` with failing assertions that `Procfile`, API startup, worker disablement, and worker cleanup remain independent; do not expand `start.sh` scope.

## Phase 2: GREEN Config and Probe

- [x] 2.1 Modify `bot/config.py` and its dataclass to parse immutable readiness timeout, default 2000 ms, clamp policy via rejection at 100/2000 ms, and stable errors.
- [x] 2.2 Modify `bot/db.py` with typed `probe_readiness(pool)` using only `SELECT 1` and `information_schema.columns` for `users.id`, `users.balance`, `agencias.code`, and `agencias.status`; keep `_create_schema()` worker-owned.
- [x] 2.3 Run focused config/probe tests GREEN; prove fake connections record no DDL or non-SELECT statement and classify connectivity versus schema failures.

## Phase 3: GREEN API and Process Contract

- [x] 3.1 Modify `bot/casino_api.py` with process-only `GET /livez`, bounded one-budget `asyncio.wait_for` `GET /readyz`, API-pool injection, exact success bodies, and exact sanitized `503` reasons.
- [x] 3.2 Keep `/readyz` independent from Telegram, poller, providers, business queries, wallet, roulette, odds, and worker pool/bootstrap; log stable reason codes only.
- [x] 3.3 Run endpoint/process tests GREEN, including completion by deadline plus scheduling tolerance and readiness success while poller is disabled/exited.

## Phase 4: REFACTOR / Verification / Rollback

- [x] 4.1 Refactor only after GREEN: preserve typed probe seams, stable error taxonomy, no secret/error-text responses, and existing worker cleanup behavior.
- [x] 4.2 Run `python -m pytest bot/tests`; verify only listed backend files changed, no migration/cloud/secret work occurred, and no frontend files were touched.
- [x] 4.3 Record rollback check: revert readiness config/probe/routes and restore prior health-check paths/release; worker may stop independently with no data action.

## Apply Progress — Strict TDD

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|------|-----------|-------|------------|-----|-------|-------------|----------|
| 1.1, 2.2, 3.1–3.3 | `bot/tests/test_readiness.py` | Unit | N/A (new) | 7 failing tests | 7 passed | Success, database/schema, timeout | Clean |
| 1.2, 2.1 | `bot/tests/test_staging_config.py` | Unit | 26 passed | 7 failing tests | 33 passed | Default, bounds, invalid inputs | Clean |
| 1.3 | `bot/tests/test_process_safety.py` | Unit | 7 passed | 1 failing test | 8 passed | Existing lifecycle coverage retained | Clean |
| 4.1–4.3 | All listed tests | Unit | 48 passed | N/A | 48 passed | Full backend suite | Clean |

- Full command: `PYTHONDONTWRITEBYTECODE=1 PYTHONPATH=bot .venv/bin/python -m pytest bot/tests`
- Result: 48 passed. Existing FastAPI deprecation warnings only.
- Rollback: revert readiness routes, config parser, and read-only probe; no data action and worker stays independent.
