# Apply Progress: Environment-Scoped Bot and App Links

## Status

done

## TDD Cycle Evidence

| Step | Command | Result |
|------|---------|--------|
| Baseline | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `148 passed, 128 warnings in 4.00s` |
| RED | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `16 failed, 148 passed, 132 warnings in 4.01s` |
| GREEN | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `164 passed, 132 warnings in 4.22s` |
| `git diff --check` | `git diff --check` | exit 0, no output (no whitespace errors) |
| `git status --short` | `git status --short` | `M bot/admin_handlers.py`, `M bot/bot_handlers.py`, `M bot/casino_api.py`, `M bot/config.py`, `M bot/tests/test_runtime_config.py`, `?? bot/tests/test_environment_link_wiring.py`, `?? bot/tests/test_environment_links.py` (plus pre-existing untracked `docs/` and the change folder itself) |

## Changed Files

- `bot/config.py` — added `app_public_url: str` to `PollerRuntimeSettings` and `RuntimeSettings` (appended as the last field in each dataclass); added `PRODUCTION_APP_HOSTS` and `_app_public_url(values, app_env)`; wired parsing into `parse_poller_runtime_settings` and reused `poller.app_public_url` in `parse_runtime_settings`.
- `bot/bot_handlers.py` — imports `get_poller_runtime_settings`; added pure helper `_web_app_url()`; `/start` WebApp button now uses `_web_app_url()` instead of the hardcoded Railway URL.
- `bot/admin_handlers.py` — imports `get_poller_runtime_settings`; added pure helpers `_combo_link(code)` and `_agencia_url_message()`; `cmd_link` and `cmd_nueva_agencia` now use them instead of hardcoded literals.
- `bot/casino_api.py` — `APP_URL` now reads `SETTINGS.app_public_url` (was `os.environ.get("APP_URL", "https://juego.iaqp.lat")`); `link_web` in `/api/influencer/link/{code}` now built from `APP_URL` instead of the hardcoded Railway URL.
- `bot/tests/test_runtime_config.py` — added `APP_URL` to the staging branch of the `settings()` helper; added 8 new scenarios covering production default/HTTPS/invalid-origin and staging missing/environment-host-rejection (parametrized over 4 hosts)/valid.
- `bot/tests/test_environment_links.py` (new) — source-scan test asserting no `valiant-gentleness-production-a779.up.railway.app` or `t.me/QuartzPlayBot` literal, and no `juego.iaqp.lat` literal outside `config.py`, across top-level `bot/*.py` (excludes `tests/`).
- `bot/tests/test_environment_link_wiring.py` (new) — behavior tests: start-button URL, combo link, agency message, and referral `link_web`, each built from staging settings via the extracted pure helpers / the `casino_api` module reload pattern already used in `test_readiness.py`.

## Deviations From the Design Note

- Both `PollerRuntimeSettings` and `RuntimeSettings` got `app_public_url` appended as the **last** positional field (not inserted mid-struct), so all existing positional constructions elsewhere in `config.py` needed no reordering — only the 3 `return` call sites (2 in `parse_poller_runtime_settings`, 1 in `parse_runtime_settings`) were updated to pass the new value positionally at the end.
- `parse_runtime_settings` does not re-parse `APP_URL`; it reuses `poller.app_public_url` from the already-parsed `PollerRuntimeSettings`, since `parse_runtime_settings` already builds on `parse_poller_runtime_settings`. This avoids duplicate validation logic and keeps a single error-code source for `app_url.*`.
- `bot_handlers.py` and `admin_handlers.py` call `get_poller_runtime_settings()` lazily inside small pure helper functions (`_web_app_url`, `_combo_link`, `_agencia_url_message`) rather than at module import time, mirroring the existing lazy-import pattern in `server.py`. This keeps both modules importable in tests without requiring a full valid environment at import time, and made the extracted helpers directly unit-testable without reloading the modules.
- `admin_handlers.py`'s `_combo_link` uses `telegram.username`, which `config.py` normalizes to lowercase (e.g. `quartzplaystagingbot`); Telegram `t.me` deep links are case-insensitive, so this preserves behavior while satisfying "built from the configured bot username."
- Left `casino_api.py`'s other three pre-existing `APP_URL`-based links (`/t/{codigo}` tracking links, the "Abrí la app acá" message) untouched — they already referenced the module-level `APP_URL` name, which now sources from settings, so they inherit the fix without direct edits (not separately listed in the contract but consistent with its intent).
- `ADMIN_IDS = os.environ.get(...)` in `admin_handlers.py` was left untouched per the design note.

## Rollback Boundary

All changes are confined to: `bot/config.py`, `bot/bot_handlers.py`, `bot/admin_handlers.py`, `bot/casino_api.py`, and the three test files listed above. No schema, migration, or cloud resource changes. Revert by reverting these files (or the PR) — no data migration or manual cleanup required. Task 3.1 (owner sets staging `APP_URL` before merge) is explicitly out of scope for this apply step.
