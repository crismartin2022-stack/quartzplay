# Design: PSP Webhook Authentication

## Decisions

| Decision | Choice | Rejected alternative | Reason |
|---|---|---|---|
| Authentication | HMAC-SHA256 signature in callback query parameters | IP allowlist; static URL token; PSP GET-back verification | PSP publishes no IPs or signature; a static token is fully reusable if leaked; no verified PSP read endpoint in code |
| Binding | Cash-in: `uid` + nonce `n`; payout: `rid` | Bind to PSP request id | PSP id is unknown when the callback URL is registered |
| Message | `"{purpose}:{k1}={v1}&{k2}={v2}"` with fixed key order, purpose `cashin` or `payout` | Raw concatenation | Prevents cross-endpoint replay and ambiguous concatenation |
| Comparison | `hmac.compare_digest` | `==` | Constant time |
| Secret source | `PSP_WEBHOOK_SECRET`, optional, validated in `bot/config.py` (min 32 chars, error `psp_webhook_secret.invalid`) | Required at startup | PSP is disabled in production today; requiring it would block unrelated deploys |
| Missing secret | Callbacks 503; request creation 503 before PSP and DB | Accept unsigned | Fail closed |
| Locking | `SELECT ... FOR UPDATE` inside `conn.transaction()` and terminal-state checks after the lock | Read then transaction | Removes double-credit race |

## Module

New `bot/psp_webhook_auth.py` (pure, no I/O):
- `sign(secret: str, purpose: str, params: Mapping[str, str]) -> str` (hex digest).
- `verify(secret: str | None, purpose: str, params: Mapping[str, str], signature: str | None) -> str` returning `"ok"`, `"unconfigured"`, or `"invalid"`.
- `cashin_callback_query(secret, user_id) -> dict` generating `uid`, `n` (`secrets.token_urlsafe(18)`), `sig`.
- `payout_callback_query(secret, retiro_id) -> dict` generating `rid`, `sig`.

## Integration (`bot/casino_api.py`)

- Read the secret from runtime settings; expose a small accessor so tests can monkeypatch.
- `me_psp_cargar` and `_ejecutar_payout`: when the secret is missing raise HTTP 503 before any PSP call; append `urlencode(query)` to the callback URL.
- Webhooks: parse query params, `verify` first; `unconfigured` → 503, `invalid` → 401 with a generic detail; only then `get_db()`.
- Cash-in MATCHED: inside a transaction, `SELECT ... FOR UPDATE`; require `estado` in `pendiente` or `vencido` (money received after expiry is still credited) and `user_id == uid`; otherwise return `{"ok": True}` without changes. EXPIRED also requires signature and `user_id == uid`.
- Payout: inside a transaction, `SELECT ... FOR UPDATE WHERE payout_id=$1`; require `id == rid`; `COMPLETED` only from non-terminal states; `FAILED` refund only from non-terminal states.
- Logs never include the secret, signature, or full callback URL.

## Testing

`bot/tests/test_psp_webhook_auth.py` using the existing `api` fixture and `httpx.ASGITransport`:
- Pure unit tests for sign/verify (valid, tampered param, wrong purpose, missing, unconfigured).
- Route tests with a `get_db` that fails if called for 401/503 paths.
- Settlement tests with a fake pool/connection recording executed SQL for idempotency and binding.
- Config tests for short and absent secret.
