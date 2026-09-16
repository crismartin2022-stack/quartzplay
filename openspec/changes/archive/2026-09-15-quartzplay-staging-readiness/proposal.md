# Proposal: QuartzPlay Staging Readiness

## Intent

Make staging traffic eligibility observable without conflating liveness, PostgreSQL/schema readiness, Telegram, poller, or providers. Fail closed; avoid secret leakage; preserve wallet and roulette boundaries.

## Scope

### In Scope
- Add process-only `GET /livez` with `200` output and no I/O.
- Add bounded, read-only `GET /readyz`: database connectivity plus required-schema probe; failures return sanitized `503`.
- Separate readiness probing from schema bootstrap.
- Preserve independent `web`/`worker` processes; prove poller failure or disablement does not gate API readiness.
- Deliver strict RED-GREEN-REFACTOR tests for status, deadline, failures, no DDL, isolation, secrecy.

### Out of Scope
- Cloud/platform changes, live validation, migrations, schema redesign, secrets, provider health, wallet/odds/business queries, frontend changes, commits, pushes, or PRs.
- Redesigning coupled `start.sh`; staging health authority uses independent `Procfile` processes.

## Capabilities

### New Capabilities
- `staging-readiness`: local liveness/readiness endpoint contracts, bounded probe behavior, and independent process topology.

### Modified Capabilities
- None.

## Approach

Use testable async probe seam in `bot/db.py` and bounded configurable deadline (default two seconds). `/livez` performs no dependency work. `/readyz` wraps one read-only relation/column probe and maps failures to stable sanitized reasons. Write tests first; refactor probe/bootstrap boundaries while preserving worker cleanup and `Procfile` isolation.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `bot/casino_api.py` | Modified | Handlers, probe orchestration, deadline, sanitized responses. |
| `bot/db.py` | Modified | Read-only probe seam; bounded bootstrap operations. |
| `bot/server.py`, `bot/{start.sh,start-api.sh,start-poller.sh,Procfile}` | Verified/modified | Independent lifecycle/process contract. |
| `bot/tests/` | Modified | Strict TDD readiness and process-safety tests. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Probe too broad or slow | Med | Minimal schema contract, one deadline, mocked seams. |
| Lazy bootstrap mutates during readiness | High | Separate read-only probe; assert no DDL. |
| Poller coupling causes false API failure | Med | Independent process assertions and API-only semantics. |
| Review exceeds 400 lines | Low/Med | Auto feature-chain delivery; split implementation units if forecast rises. |

## Rollback Plan

Revert readiness code/process-health configuration as one feature-chain slice. Restore prior health-check paths/release; stop worker independently if needed. No migrations, cloud changes, or secret inspection.

## Dependencies

- Existing FastAPI, asyncpg, pytest seams, staging configuration, schema contract review. No cloud, live database, migration, or secret dependency.

## Success Criteria

- [ ] `/livez` remains `200` when database, Telegram, poller, or providers fail.
- [ ] `/readyz` returns `200` only after bounded connectivity/schema probes; timeout/failure returns sanitized `503`.
- [ ] Tests prove no readiness DDL, no secret leakage, independent worker/API behavior, and deadline compliance.
- [ ] Test-first implementation stays within 400 lines; no cloud, migration, secret, commit, push, or PR work.
