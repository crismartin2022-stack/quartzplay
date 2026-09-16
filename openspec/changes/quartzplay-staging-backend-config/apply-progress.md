# Apply Progress: QuartzPlay Staging Backend Foundation (PR 2A)

## Completed Tasks

- [x] 1.1 Contract tests and pinned pytest development dependency.
- [x] 1.2 Immutable fail-closed staging parser and cached loader.
- [x] 1.3 RED, GREEN, and triangulation evidence.
- [x] 3.1 Frontend regression without frontend edits.
- [x] 3.2 Scope and review-budget inspection.
- [x] 3.3 Code-only rollback confirmation.

## TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| CORS safety blocker repair | `bot/tests/test_staging_config.py` | Unit | Existing focused suite | `6 failed, 19 passed`: wildcard subdomain, five missing repository-known production origins, and logo wildcard header | `26 passed`: `cd bot && /var/folders/sw/9651fn8523j550fx9rs3htmh0000gn/T/opencode/quartzplay-tdd/bin/python -m pytest -q tests/test_staging_config.py` | Valid canonical origin, blocked origin, wildcard origin, and seven immutable production origins | No further refactor needed; `python3 -m py_compile config.py casino_api.py` passed |

## Test Summary

- Backend: `cd bot && /var/folders/sw/9651fn8523j550fx9rs3htmh0000gn/T/opencode/quartzplay-tdd/bin/python -m pytest -q tests/test_staging_config.py` — 26 passed.
- Setup: `bot/requirements-dev.txt` pins `pytest==8.3.5`; local `python` is unavailable and system Python is externally managed, so evidence used an isolated temporary virtual environment.
- Frontend: `cd frontend && npx react-scripts test --watchAll=false` — 2 suites, 21 tests passed.
- Synthetic values only. Secret-redaction assertion verifies the sentinel is absent from `ConfigError`.

## Boundary and Rollback

- Chain: `feature-branch-chain`; branch `feat/staging-backend-config-recovery`; parent `feat/staging-frontend-isolation` (`631c451`).
- Affected code/tests: `bot/config.py`, `bot/casino_api.py`, `bot/requirements-dev.txt`, and `bot/tests/test_staging_config.py`.
- This local untracked OpenSpec evidence is excluded from code-only PR 2A and belongs in a later documentation PR.
- Budget: 269 code-line changes before OpenSpec evidence; below 400. No cloud, secret, schema, migration, readiness, supervision, wallet, odds, roulette, or frontend path changed.
- Rollback: revert this code-only slice. No external state changed.

## Remaining Tasks

- [ ] 2.1–2.4 Bot/server/db constructor probes and runtime wiring remain intentionally outside this recovered API configuration slice.
