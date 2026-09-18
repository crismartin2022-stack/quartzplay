# Proposal: Finish The Improved-Bet Screen

## Intent

After the scanner improves a combination, the player must be able to do two
things from both channels — the app opened inside Telegram and a browser
session: bet the improved combination with their balance, or generate a code to
play it elsewhere. Today the screen offers only the code, and the code button
can fail without saying anything.

## Evidence

- `frontend/src/Web.jsx:2002` and `frontend/src/App.jsx:2289`: `generarBoleto`
  returns early on `if(!validos.length) return;` without touching any state. No
  error, no spinner, nothing moves. This is the reported "when I press Generate
  code nothing happens" in production. The button renders while
  `res.picks_ok>0` (`Web.jsx:2226`, `App.jsx:2510`), and a manual correction
  through `aplicarCorreccion` or `quitarPickM` can leave the button visible
  while no pick carries `odd_final`.
- The improved combination has no stake field and no confirm button in either
  file; the only action is "Generar mi código para jugar"
  (`Web.jsx:2234`, `App.jsx:2518`).
- `frontend/src/Web.jsx` never calls `POST /api/apuesta`; the browser site has
  no betting path at all.
- `frontend/src/App.jsx:154` `enviarApuesta` posts `/api/apuesta` and is wired
  only to the ordinary betslip confirm, not to the scanner screen. Its mapper
  `normalizarPicks` (line 137) reads `p.label || p.sel` and ignores
  `selection`, the field the scanner returns — the same class of bug already
  fixed for the ticket path in `frontend/src/betslipPicks.js`.
- The backend is ready. `bot/casino_api.py` resolves a browser player from
  `Authorization: Bearer <token>` through `jugador_de_sesion` and refuses an
  unidentified request with 401 and the dict detail
  `{"reason": "login_required", "message": "..."}`. Both frontends do
  `throw new Error(e.detail || ...)`, which renders `[object Object]` for that
  dict.
- There is no web self-registration: `bot/casino_api.py` exposes only
  `/api/cliente/login`, `/api/cliente/password`, `/api/cliente/me` and
  `/api/cliente/cambiar-clave`. Accounts are created by an agency or by the
  Telegram bot `/start`.

## Scope

- A stake field and a confirm button on the improved combination, in both
  channels, betting with balance through `POST /api/apuesta`.
- The code button keeps working and never fails in silence: when no pick
  carries a final odd, the screen says so and offers to scan again.
- No session in the browser: the action opens a modal with a link to sign in
  and a link to create an account through the Telegram bot, built from the
  already validated `REACT_APP_BOT_USERNAME`, the same
  `https://t.me/<bot>?start=<ref>` pattern the agency screens use.
- The dict-shaped refusal is read as a reason and a message, so the player sees
  "Iniciá sesión para apostar" instead of `[object Object]`.
- Picks are mapped once, from the same source of truth the ticket path uses, so
  the selection and the event identity survive into the bet.

Out of scope: the visual reskin, the new sportsbook integration, and the
anti-rescan protection; each is its own change.

## Rollback

Revert the PRs. The scanner and the code path return to their current
behaviour, and the backend keeps accepting both identities without a caller.
