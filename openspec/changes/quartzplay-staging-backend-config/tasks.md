# Tasks: QuartzPlay Staging Backend Foundation (PR 2A)

## Review Workload Forecast

| Field | Value |
|---|---|
| Estimated changed lines | 360–390 |
| 400-line budget risk | Medium |
| Chained PRs recommended | No, unless forecast crosses 400 |
| Suggested split | Single PR 2A; contingency PR 2A-WIRING if over budget |
| Delivery strategy | auto |
| Chain strategy | feature-branch-chain |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: feature-branch-chain
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|---|---|---|---|
| 1 | Validated immutable settings plus focused tests | PR 2A | Base = PR1 feature branch `631c451`; tests stay with contract. |
| 2 | API, DB, bot, and handler wiring plus integration probes | PR 2A | Same base; stop before 400 lines. If exceeded, child PR 2A-WIRING base = PR 2A branch. |

## Phase 1: Contract Tests and Foundation

- [x] 1.1 **RED:** Create `bot/tests/test_staging_config.py` and `bot/requirements-dev.txt`; add parametrized failing tests for missing/malformed/duplicate/production-overlap destinations, Telegram identity, safe errors, and canonicalization.
- [x] 1.2 **GREEN:** Create `bot/config.py` with frozen `StagingSettings`/`TelegramIdentity`, canonical parsers, production-disjoint checks, stable secret-free `ConfigError`, and cached environment loader; run `cd bot && python -m pytest -q tests/test_staging_config.py`.
- [x] 1.3 **TRIANGULATE:** Record RED failure, GREEN pass, and focused test result in task evidence; verify synthetic values only and no secret sentinel appears in failures.

## Phase 2: Runtime Wiring

- [ ] 2.1 **RED:** Extend `bot/tests/test_staging_config.py` with fake-constructor probes proving invalid config blocks API/bot/pool creation and valid config reaches one identity/database contract, including middleware and manual CORS paths.
- [ ] 2.2 **GREEN:** Update `bot/db.py` to accept validated `database_url`; update `bot/casino_api.py` to load settings before app construction and use canonical DB/CORS/Telegram values; preserve routes and schema behavior.
- [ ] 2.3 **GREEN:** Update `bot/server.py`, `bot/admin_handlers.py`, and runtime-relevant `bot/bot_handlers.py` consumers to inject the validated token, username, and admin IDs; remove unsafe defaults without redesigning journeys.
- [ ] 2.4 **TRIANGULATE/REFACTOR:** Run focused backend tests, inspect all runtime environment reads, and keep the aggregate diff at or below 400 changed lines; if exceeded, move 2.2–2.3 wiring/tests to PR 2A-WIRING.

## Phase 3: Regression and Boundary Verification

- [x] 3.1 Run `cd frontend && npx react-scripts test --watchAll=false`; record regression result with no frontend edits.
- [x] 3.2 Verify changed paths exclude cloud, secrets, schema/migrations, readiness, supervision, wallet/odds/roulette, and Telegram journey changes; report exact diff stat and chain base.
- [x] 3.3 Confirm PR 2A rollback is code-only: revert PR 2A or child wiring slice, leaving PR1 and external state unchanged.

## Local Apply Progress — Documentation PR Only

- [ ] 2.1 remains incomplete: bot and pool constructor probes are not implemented.
- [ ] 2.2–2.4 remain incomplete: this repair only covers approved CORS safety blockers.

### TDD Cycle Evidence

| Work unit | Test file | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|
| CORS safety blocker repair | `bot/tests/test_staging_config.py` | `6 failed, 19 passed`: wildcard subdomain, five missing repository-known production origins, and logo wildcard header | `26 passed`: `cd bot && /var/folders/sw/9651fn8523j550fx9rs3htmh0000gn/T/opencode/quartzplay-tdd/bin/python -m pytest -q tests/test_staging_config.py` | Valid canonical origin, blocked origin, wildcard origin, and seven immutable production origins | No further refactor needed; `python3 -m py_compile config.py casino_api.py` passed |
