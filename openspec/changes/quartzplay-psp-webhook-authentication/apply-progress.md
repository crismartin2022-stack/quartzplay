# Apply Progress: PSP Webhook Authentication

## Status

Done. Phases 1 (RED), 2 (GREEN), and 3.1 (verify) are complete. Phase 4 (delivery: PR, setting the secret in Railway) is out of scope for this apply pass and left for the owner.

## TDD Cycle Evidence

| Step | Command | Result |
|---|---|---|
| Baseline | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `101 passed, 48 warnings in 3.43s` — no pre-existing failures. |
| RED (module) | `cd bot && <venv>/bin/python -m pytest tests/test_psp_webhook_auth.py tests/test_runtime_config.py -q` | Collection error: `ModuleNotFoundError: No module named 'psp_webhook_auth'` (all new route/settlement/unit tests blocked on import). |
| RED (config, isolated) | `cd bot && <venv>/bin/python -m pytest tests/test_runtime_config.py -q` | `3 failed, 32 passed` — `test_accepts_absent_psp_webhook_secret`, `test_accepts_a_valid_psp_webhook_secret` (`AttributeError: 'RuntimeSettings' object has no attribute 'psp_webhook_secret'`), `test_rejects_a_short_psp_webhook_secret_without_leaking_it` (`Failed: DID NOT RAISE`). |
| GREEN (focused) | `cd bot && <venv>/bin/python -m pytest tests/test_psp_webhook_auth.py tests/test_runtime_config.py -q` | `67 passed, 84 warnings in 2.21s` |
| GREEN (full suite) | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `136 passed, 124 warnings in 3.70s` (101 baseline + 35 new) |
| Verify | `git diff --check` | Clean (no whitespace errors), exit 0 |
| Verify | `git diff --stat` | `bot/casino_api.py \| 176 +++++++++++++++++++++++--------------`, `bot/config.py \| 11 +++`, `bot/tests/test_runtime_config.py \| 21 +++` (plus 2 new untracked files, see below) |
| Verify | `rg` scan for logged secret/sig/callback URL | No match in `bot/casino_api.py` — `log.error`/`log.info`/etc. never reference `sig`, `callback`, or the secret. |

The `venv` is at `/private/tmp/claude-501/-Users-usuario-Documents-Trabajo-2026-iaqp/b5b47c6c-3da6-4cd0-be62-6216d3a537c9/scratchpad/bot-venv` (outside the repo, python3.14 — python3.13 was not available on this machine, only `python3` via Homebrew).

## Changed Files

- `bot/psp_webhook_auth.py` (new, 51 lines) — pure module: `sign`, `verify`, `cashin_callback_query`, `payout_callback_query`. No I/O.
- `bot/config.py` (+11/-0) — added `psp_webhook_secret: str | None` to `RuntimeSettings`, `_psp_webhook_secret()` validator (`psp_webhook_secret.invalid` if 1-31 chars), wired into `parse_runtime_settings`.
- `bot/casino_api.py` (+~111/-~65 net, 176 lines touched) —
  - new import `psp_webhook_auth`, `from urllib.parse import urlencode`.
  - `_psp_webhook_secret()` accessor (reads `SETTINGS.psp_webhook_secret`; tests monkeypatch `api.SETTINGS` via `dataclasses.replace`, matching the existing `test_readiness.py` convention).
  - `me_psp_cargar`: fails closed with 503 (no DB access at all) when the secret is missing; signs `clientCallbackUrl` with `psp_webhook_auth.cashin_callback_query`.
  - `psp_webhook_cashin`: verifies `uid`/`n`/`sig` query params before touching the DB (503 unconfigured / 401 invalid); unified `SELECT ... FOR UPDATE` inside one transaction for both `EXPIRED` and `MATCHED`, bound to `uid`; `MATCHED` credits once from `pendiente` or `vencido`; `EXPIRED` only marks `vencido` from `pendiente`.
  - `_ejecutar_payout`: fails closed with 503 before touching the connection or the PSP when the secret is missing; signs `callbackUrl` with `psp_webhook_auth.payout_callback_query`.
  - `psp_webhook_payout`: verifies `rid`/`sig` before touching the DB; `SELECT ... FOR UPDATE` bound to `rid == id`; `COMPLETED`/`FAILED` only applied from a non-terminal state (`completado`/`fallido` are both terminal).
- `bot/tests/test_psp_webhook_auth.py` (new, 35 tests) — pure sign/verify unit tests, route auth tests (401/503 without DB access, including cash-in-signature-on-payout-endpoint replay), idempotency/binding settlement tests with an in-memory fake pool/connection, and signed-callback-URL tests for `me_psp_cargar` / `_ejecutar_payout`.
- `bot/tests/test_runtime_config.py` (+21) — 3 config tests: absent secret accepted, valid secret accepted, short secret rejected with `psp_webhook_secret.invalid` and without leaking the value.

## Deviations From Design

- **Secret-missing guard placement**: design.md says "raise HTTP 503 before any PSP call." For `me_psp_cargar` the guard was placed before *any* DB access at all (before `pool = await get_db()`), not just before the `_psp_get`/`_psp_post` calls — this is a strictly stronger, simpler, and more testable interpretation of "calls neither the PSP nor the database write" (scope proposal.md), and matches the existing `get_db`-raises-`AssertionError` test convention used elsewhere in the suite. `_ejecutar_payout`'s guard is the first statement in the function, before its own `fetchrow`, for the same reason.
- **Cash-in EXPIRED handling restructured**: the original code did a blind `UPDATE ... WHERE estado='pendiente'` on `EXPIRED` with no row fetch. Per design ("EXPIRED also requires signature and `user_id == uid`"), this was changed to fetch-then-check-then-update inside the same locked transaction as `MATCHED`, so the `uid` binding can be enforced. This is a behavior change from the original (now requires the signed `uid` to match), which is the explicit intent of the spec, not an incidental side effect.
- **Cash-in MATCHED from expired records (corrected in review)**: the first GREEN pass credited only from `pendiente`, which would leave money received after expiry uncredited. Orchestrator review restored the original business behavior: `MATCHED` credits from `pendiente` or `vencido` and never again once `acreditado`. RED: `test_cashin_matched_after_expiry_still_credits_received_money_once` failed (`1 failed`); GREEN: full suite `137 passed`.
- No other deviations. Message format, key order, `hmac.compare_digest`, `secrets.token_urlsafe(18)`, and the `urlencode` construction all match design.md exactly.

## Rollback Boundary

Revert this PR (`bot/psp_webhook_auth.py`, `bot/config.py`, `bot/casino_api.py`, `bot/tests/test_psp_webhook_auth.py`, `bot/tests/test_runtime_config.py`). No schema change, no data migration, no Railway/Supabase state touched. `PSP_WEBHOOK_SECRET` is optional so this is safe to deploy without setting it (callbacks/requests answer 503 until the owner sets it, matching current production reality where `PSP_API_KEY` is also unset).

## Blocked

Nothing blocked. Phase 4 (PR creation, setting `PSP_WEBHOOK_SECRET` in Railway) was explicitly out of scope for this apply pass per the task instructions (no commit/push, no Railway/Supabase access).
