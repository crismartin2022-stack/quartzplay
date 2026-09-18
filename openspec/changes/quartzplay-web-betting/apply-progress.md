# Apply Progress: Bet With Balance From The Browser

## Status

done (tasks 1.1–2.3)

## TDD Evidence

| Stage | Command | Result |
|-------|---------|--------|
| Baseline | `bot-venv/bin/python -m pytest tests/ -q` | `169 passed, 132 warnings in 5.04s` |
| RED | `bot-venv/bin/python -m pytest tests/test_apuesta_web_session.py -q` | `7 failed, 5 passed, 52 warnings in 1.29s` — failures: `test_jugador_de_sesion_returns_the_player_id_for_a_valid_client_token` (`AttributeError`: `jugador_de_sesion` did not exist), `test_jugador_de_sesion_returns_none_for_an_agency_session_token`, `test_jugador_de_sesion_returns_none_for_an_unknown_token`, `test_jugador_de_sesion_never_raises_for_a_missing_or_malformed_header` (same `AttributeError`), `test_bet_with_web_session_only_is_placed_for_the_session_player` (`assert 401 == 200`, no web-session path existed), `test_401_answers_carry_the_login_required_reason_and_no_player_information` (`assert 'Abri la app desde el bot de Telegram para apostar' == {'message': ..., 'reason': 'login_required'}`), `test_web_session_bet_debits_only_that_sessions_player_balance` (`assert 401 == 200`). The 5 tests that already passed at RED (telegram-only, both-present-prefers-telegram, agency-refused, unknown-refused, missing-header-refused) only assert the existing 401/200 status codes, which the unmodified endpoint already produced. |
| GREEN | `bot-venv/bin/python -m pytest tests/test_apuesta_web_session.py -q` | `12 passed, 52 warnings in 1.47s` |
| Full suite | `bot-venv/bin/python -m pytest tests/ -q` | `181 passed, 180 warnings in 5.15s` (169 baseline + 12 new) |
| `git diff --check` | `git diff --check` | exit 0, no output (no whitespace errors) |
| `git status --short` | `git status --short` | ` M bot/casino_api.py`, `?? bot/tests/test_apuesta_web_session.py`, plus pre-existing untracked `docs/` and this change's own `openspec/changes/quartzplay-web-betting/` (unrelated to this task, not touched) |

Venv used: a fresh one created for this session at
`/private/tmp/claude-501/.../scratchpad/bot-venv` (the one named in the task
brief no longer existed in this session's scratchpad), installed from
`bot/requirements.txt` + `bot/requirements-dev.txt`.

## Changed Files

- `bot/casino_api.py`
  - Added `async def jugador_de_sesion(authorization)` next to the session
    helpers (after `sesion_buscar`, before `requiere_agencia`). Extracts the
    bearer token, looks it up with `sesion_buscar`, and returns the int
    player id only when the stored value has the `cliente:` prefix.
    Never raises: missing/malformed header, unknown token, or a
    non-`cliente:` token (e.g. an agency session) all return `None`.
  - `crear_apuesta`: when `validar_init_data` does not resolve a Telegram
    user, now calls `jugador_de_sesion(request.headers.get("authorization"))`
    as a fallback before refusing. `tg_id` (used in the existing
    `WHERE telegram_id::text=$1 OR id::text=$1` lookup) is set to the web
    session's player id in that case, so the rest of the function (modes,
    picks validation, `MAX_PICKS`, stake/balance handling, influencer
    attribution) is untouched.
- `bot/tests/test_apuesta_web_session.py` (new) — 12 tests: `jugador_de_sesion`
  unit contract (4), identity-resolution table at `/api/apuesta` (6, incl.
  the two channels producing identical rejection with no DB access), the
  401 reason-code contract (1), and balance isolation for a web session (1).
- `openspec/changes/quartzplay-web-betting/tasks.md` — marked 1.1–2.3 `[x]`.

## Deviations

- **401 detail shape**: every existing `HTTPException(...)` in `casino_api.py`
  uses a plain string `detail` (34 call sites checked via
  `rg 'HTTPException\(401'`, none use a dict). Since the contract requires a
  stable machine-readable reason, this endpoint's unauthenticated response
  now uses `HTTPException(401, {"reason": "login_required", "message": "..."})`,
  which FastAPI serializes as `{"detail": {"reason": "login_required",
  "message": "Iniciá sesión para apostar"}}`. This is the first dict-shaped
  `detail` in the file; no other endpoint was changed to match, since scope
  was limited to `/api/apuesta`.
- The original refusal message ("Abri la app desde el bot de Telegram para
  apostar") is replaced by a channel-neutral Spanish message ("Iniciá sesión
  para apostar"), since the same 401 now covers both an absent Telegram
  identity and an absent/invalid web session.

## Rollback Boundary

Two isolated, revertible edits in `bot/casino_api.py`:
1. The new `jugador_de_sesion` function (self-contained, no other code calls it).
2. The four added/changed lines inside `crear_apuesta` (the `web_player_id`
   fallback block and the `tg_id` assignment).

Everything from `tg_id = ...` onward in `crear_apuesta` — modo handling,
picks validation, odds checks, stake/balance debit, influencer attribution —
is byte-for-byte unchanged. Reverting both edits (or just deleting
`bot/tests/test_apuesta_web_session.py` and reverting `bot/casino_api.py`)
restores Telegram-only betting exactly as it was; no migrations, no cloud
resources, no other files touched.
