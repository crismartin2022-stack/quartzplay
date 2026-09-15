# Proposal: QuartzPlay Staging Backend Foundation (PR 2A)

## Intent

Make backend staging startup fail closed. One validated contract separates staging destinations, CORS, database target, and Telegram identity from production defaults without changing product behavior or deployment infrastructure.

## Scope

### In Scope
- Add pure validation for explicit `APP_ENV=staging`, required `DATABASE_URL`, explicit `ALLOWED_ORIGINS`, and Telegram token/username/admin identity; reject missing, malformed, production-pointing, or ambiguous values without logging secrets.
- Make `casino_api.py`, `server.py`, and relevant handlers use one configuration for pool creation, CORS (including manual responses), WebApp verification, notifications, and startup.
- Under strict TDD, add backend tests first, then implementation; capture RED/GREEN evidence with `pytest` and frontend regression, using synthetic values only.

### Out of Scope
- Frontend, cloud/Railway/Supabase changes, secret inspection, deployment, schema/migrations, readiness, poller supervision, wallet/balance/odds/roulette behavior, or Telegram journey redesign.
- Production identity/provider ownership or live Telegram/database verification.

## Capabilities

### New Capabilities
- `staging-backend-safety`: Fail-closed parsing and destination allowlisting for backend startup and API CORS/database use.
- `telegram-identity-separation`: Independent, validated staging Telegram identity shared by API and bot entry points.

### Modified Capabilities
- None.

## Approach

Centralize immutable settings in `bot/config.py`; use them from API and Telegram startup paths. Preserve route and wallet ownership. Audit runtime environment reads, not historical/UI copy. Feature-branch chain: PR 2A follows PR1 (`631c451`); strategy `auto`, `feature-branch-chain`; keep the 400-line budget visible and split if forecast exceeds it.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `bot/config.py` | New | Pure validation boundary and safe runtime settings. |
| `bot/casino_api.py`, `bot/server.py` | Modified | Consume one contract for startup/API behavior. |
| `bot/bot_handlers.py`, `bot/admin_handlers.py` | Modified | Remove staging identity defaults where runtime-relevant. |
| `bot/requirements-dev.txt`, `bot/tests/test_staging_config.py` | New/Modified | Reproducible strict-TDD evidence. |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| Missed environment consumer | Med | Repository-wide audit plus import/startup tests. |
| Import breaks local tooling | Med | Explicit synthetic test fixture; no unsafe fallback. |
| CORS paths diverge | Med | Assert middleware and manual responses share allowlist. |

## Rollback Plan

Revert PR 2A from its child branch; restore PR1 unchanged. No schema or cloud state changes, so rollback needs no migration or secret action.

## Dependencies

- Parent PR1 `631c451`; OpenSpec strict-TDD configuration; backend test-only dependencies.

## Success Criteria

- [ ] Missing, malformed, production-pointing, and ambiguous staging destinations/identities fail before API or bot startup; errors contain no secret values.
- [ ] API and Telegram entry points consume identical validated staging identity/configuration; route and wallet behavior remain unchanged.
- [ ] RED/GREEN tests plus frontend regression are recorded; changed-line forecast remains within 400 lines or creates a separately reviewable chain slice.
