# Design: QuartzPlay Staging Backend Foundation (PR 2A)

## Technical Approach

Add one pure, immutable staging-settings boundary in `bot/config.py`. FastAPI import and Telegram startup validate it before constructing middleware, pools, or Telegram clients. Canonical comparisons reject malformed, duplicate, ambiguous, or production-overlapping values without including values in errors. Routes, data, and deployment topology remain unchanged.

## Architecture Decisions

| Decision | Alternatives | Tradeoff and rationale |
|---|---|---|
| Pure parser plus cached runtime loader | Validate per entry point | `parse_staging_settings(mapping)` gives deterministic tests; `get_staging_settings()` loads `os.environ` once per process. One contract prevents drift. |
| Canonical compare, original secret handoff | Raw string comparison; rewrite complete URLs | Parse before comparison. Preserve original database URL/token only for clients, while exposing canonical non-secret host/origin/identity fields. This avoids encoding damage and closes case, trailing-dot, default-port, and `@` bypasses. |
| Independent production guard inputs | Self-authorizing staging allowlist; hard-coded secrets | Require production host/origin and Telegram identity fingerprints. Union these with repository-known public identities. No production token or connection string is stored or logged. |
| Explicit dependency injection to handlers | Handler-level environment reads | Server places validated Telegram identity in `app.bot_data`; admin checks and links read it from context. API uses its module-level validated object. No implicit defaults remain. |

## Validation Contract

`StagingSettings` is a frozen dataclass containing `database_url`, `database_host`, canonical `allowed_origins`, and a frozen `TelegramIdentity(token, bot_id, username, admin_ids)`.

- `APP_ENV` must equal `staging` after trim/case normalization.
- Database URLs must use `postgres`/`postgresql` and include credentials, host, and database name. Hosts normalize through IDNA/lowercase and terminal-dot removal; IPs use canonical `ipaddress` form.
- Origins must use HTTP(S), contain only scheme/host/optional port, and contain no credentials, query, fragment, wildcard, or non-root path. Canonicalization lowers scheme/host, removes terminal dots and default ports, and rejects duplicates after normalization.
- CSV inputs reject blank items. Production destination hosts are canonicalized into one comparison set; staging database and origin hosts must not intersect it.
- Telegram token shape must yield a positive numeric bot ID. Usernames strip exactly one leading `@`, lowercase for comparison, match Telegram username syntax, and end in `bot`. Admin IDs are unique positive integers. Bot ID, username, and admin IDs must be disjoint from required production fingerprints. Marker-only usernames and duplicate canonical identities fail.
- `ConfigError` reports stable field/error codes only. It never interpolates environment values, URLs, credentials, or tokens.

## Data Flow

```text
environment -> parse/canonicalize -> disjoint checks -> frozen settings
                                                    |-> FastAPI CORS + pool + WebApp/notification token
                                                    `-> bot pool + Application token + admin identity
```

FastAPI obtains settings before `FastAPI(...)`. `CORSMiddleware` receives canonical origins. Shared `cors_headers(origin)` applies the same membership check to rate-limit, exception, and image responses; wildcard headers are removed. `get_db()` passes `settings.database_url` to `asyncpg.create_pool`.

`server.main()` validates before runtime construction, passes `database_url` to `db.get_pool`, builds `Application` with the token, and stores identity in `bot_data`. This is configuration handoff, not supervision or journey redesign.

## File Changes

| File | Action | Description |
|---|---|---|
| `bot/config.py` | Create | Pure parser, canonicalizers, frozen contracts, safe errors, cached environment loader. |
| `bot/casino_api.py` | Modify | Consume settings for database, all CORS paths, Telegram verification, links, and notifications. |
| `bot/server.py` | Modify | Validate first and inject database/Telegram settings. |
| `bot/db.py` | Modify | Accept validated database URL instead of reading environment. |
| `bot/admin_handlers.py` | Modify | Consume injected admin IDs and bot username; remove defaults/hard-coded bot identity. |
| `bot/requirements-dev.txt` | Create | Pin pytest as test-only dependency. |
| `bot/tests/test_staging_config.py` | Create | Pure validation matrix plus import/startup handoff probes with fakes. |

## Testing and TDD Evidence

| Layer | Evidence |
|---|---|
| Unit | Parametrize valid values and malformed, missing, blank, wildcard, duplicate-equivalent, production-overlap, trailing-dot, case/default-port, marker-only username, duplicate-admin, and secret-redaction cases. |
| Integration | With synthetic environment and mocked `asyncpg`/Telegram constructors, prove API middleware/manual CORS and both startup paths receive one validated contract; invalid settings cause zero constructor calls. |
| Regression | Run `cd frontend && npx react-scripts test --watchAll=false` without frontend changes. |

Strict-TDD record must show, per work unit, `RED`, `GREEN`, and `TRIANGULATE` command/result in OpenSpec task evidence. Backend command: `cd bot && python -m pytest -q tests/test_staging_config.py`. Use synthetic values only; assert error text excludes sentinel secrets.

## Scope, Delivery, and Rollback

Forecast: about 360 changed lines across seven files. Automatic feature-branch-chain delivery keeps PR 2A on parent PR1 (`631c451`). If implementation reaches 400 changed lines, stop and move handler/CORS wiring plus its tests into a separate child slice; do not weaken tests.

No migration required. Excluded: process supervision, readiness, schema/migrations, wallet/balance/odds/roulette, cloud, frontend changes, IAQP, and Telegram journey changes. Rollback reverts PR 2A or its child slice; no data, schema, secret, or cloud rollback exists.

## Open Questions

None.
