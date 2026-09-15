## Exploration: QuartzPlay staging-foundation backend configuration/API safety (PR 2A)

### Current State
Parent PR1 is present at `631c451` (`chore(frontend): isolate staging destinations`). It validates frontend staging destinations, but the backend still has independent, unsafe configuration paths:

- `bot/casino_api.py` reads `DATABASE_URL` with an empty-string fallback and creates the pool from that value. It hard-codes production and local CORS origins, including the legacy Railway host, rather than requiring an environment-specific allowlist.
- `bot/server.py` requires `TELEGRAM_TOKEN` at startup, but the API module separately treats the token as optional. `TELEGRAM_BOT_USER` defaults to `Quartzplay_bot`, `APP_URL` defaults to a production-looking URL, and `bot/admin_handlers.py` defaults missing `ADMIN_IDS` to `[0]`. These defaults can make staging appear configured while retaining production identity or silently disabling administration.
- `bot/casino_api.py` defines Telegram WebApp signature validation and outbound Telegram messaging in the same large module. `bot/bot_handlers.py` and `bot/admin_handlers.py` also contain production-looking URLs and Telegram-facing behavior. No backend configuration validator or focused backend test suite is present in the checkout; `bot/requirements.txt` has runtime dependencies only.
- `bot/db.py` creates tables at startup through `CREATE TABLE IF NOT EXISTS`. This is evidence for later schema/migration work, not part of this slice. The current request must not change schema creation, readiness, poller supervision, wallet behavior, cloud configuration, or secrets.
- Canonical QuartzPlay memory states that QuartzPlay owns identity, authorization, and wallet balances; source environment names and URLs do not prove deployed topology. The IAQP staging guide requires explicit independent variables, explicit CORS outside local development, and startup rejection of missing/malformed/disallowed production destinations.

### Affected Areas
- `bot/config.py` — new pure configuration boundary for environment name, database target, CORS origins, Telegram bot identity, and safe non-secret runtime settings; should reject missing, malformed, or production-pointing staging values without logging values.
- `bot/casino_api.py` — consume validated configuration for database pool creation, CORS middleware, manual CORS response headers, Telegram WebApp verification, and Telegram notification identity; preserve route behavior and wallet ownership.
- `bot/server.py` — use the same validated Telegram/database configuration before constructing the bot and pool; avoid a second, divergent startup contract.
- `bot/bot_handlers.py` and `bot/admin_handlers.py` — remove or route production defaults/identities through validated configuration where they are part of the staging identity boundary; do not redesign handlers or Telegram journeys.
- `bot/requirements-dev.txt` and `bot/tests/test_staging_config.py` — add reproducible focused tests for fail-closed parsing and destination/identity separation. Existing runtime requirements remain unchanged.
- `frontend/` — read-only evidence and parent PR1 contract. No frontend changes belong in PR 2A.
- `openspec/specs/project-memory/spec.md` and `IAQP/STAGING_AND_RELEASE_PLAN.md` — canonical evidence and constraints only; neither should be modified by implementation.

### Approaches
1. **Centralized validated backend configuration** — load environment variables once through a small pure module, validate the staging contract, expose typed/immutable values, and inject/use that result from API and Telegram entry points.
   - Pros: one fail-closed policy; prevents API/server drift; easy unit tests without database, Telegram, cloud, or secrets; makes production-host rejection and explicit CORS auditable.
   - Cons: requires touching import/startup wiring and carefully preserving module-level consumers in the large API file.
   - Effort: Medium

2. **Patch each environment read in place** — add `os.environ` checks independently in `casino_api.py`, `server.py`, and handler modules.
   - Pros: smaller local edits and lower initial refactor cost.
   - Cons: duplicated rules can diverge; import-time behavior remains hard to test; defaults can reappear in one path; API and bot may accept different staging identities.
   - Effort: Medium initially, High maintenance risk

3. **Deployment-only variable correction** — leave source behavior unchanged and configure separate Railway variables/domains manually.
   - Pros: no code changes.
   - Cons: explicitly fails the requested backend safety outcome; missing variables, wildcard/hard-coded CORS, and production defaults remain fail-open; cloud work is out of scope and cannot prove repository behavior.
   - Effort: Low implementation, unacceptable safety

### Recommendation
Use **centralized validated backend configuration**. Define a narrow, testable contract for `APP_ENV=staging`, required `DATABASE_URL`, explicit `ALLOWED_ORIGINS`, and staging Telegram identity variables (token, bot username, and admin identity as applicable). Reject empty values, invalid URLs/origins, production QuartzPlay hosts, production bot username, and ambiguous identity defaults before API or polling startup. Keep secret values out of errors/logs.

Have `casino_api.py` consume that contract for CORS and database setup, while `server.py` consumes the same contract for Telegram startup. Preserve the canonical boundary: this slice selects safe destinations and identities only; it does not alter wallet routes, balance mutation, roulette behavior, schema, migrations, readiness, poller supervision, frontend, cloud, or secrets. Under strict TDD, write focused parser/validator tests first, then integration-level import/startup tests using synthetic environment values and no external services.

### Risks
- Import-time configuration validation can break existing local commands or unrelated tooling if test setup is not explicit; provide a deliberate local-test fixture rather than restoring unsafe production defaults.
- The very large `casino_api.py` has multiple environment reads and duplicated Telegram constants; missing one consumer could leave a production identity path active.
- Existing source contains production URLs and bot defaults in handlers. The implementation must distinguish runtime configuration from historical/UI copy and audit every relevant consumer without expanding into frontend or cloud work.
- `ALLOWED_ORIGINS` affects middleware and hand-built error/rate-limit responses; both paths must use the same validated list or staging failures will be misleading.
- Telegram token validation proves configuration shape and identity separation, not Telegram provider ownership or live delivery. No cloud or secret inspection is permitted.
- `DATABASE_URL` validation can reject malformed or production-looking hosts, but it cannot prove database ownership. Staging deployment and isolated Supabase verification remain later operational work.
- Focused backend tests require development dependencies not currently declared. Adding test-only dependency metadata is in scope; adding a full test framework, migration system, readiness endpoint, or wallet test harness is not.

### Ready for Proposal
Yes — proceed to `sdd-propose` for PR 2A only. Proposal must preserve the feature-branch chain after parent PR1, keep the 400-line review budget visible, and state explicit exclusions: poller supervision/readiness/schema/migrations/wallet/cloud/secrets/frontend. No implementation, cloud action, secret access, commit, push, or PR creation belongs in exploration.
