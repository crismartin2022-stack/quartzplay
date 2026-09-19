# Tasks: Finish The Improved-Bet Screen

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 700–850 (tests about a third) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 shared module + browser screen; PR 2 market and start time end to end; PR 3 Telegram screen |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: Yes
Chain strategy: stacked
400-line budget risk: High

## Phase 1: RED — shared decision module

- [x] 1.1 Tests for `picksJugables(res)`: every pick matched, some matched, none
      matched, `res` null.
- [x] 1.2 Tests for `estadoDeAcciones(res)`: what the screen may offer and the
      message when nothing is playable.
- [x] 1.3 Tests for `stakeValido(texto)`: empty, zero, negative, non-numeric,
      decimal, valid.
- [x] 1.4 Tests for `mensajeDeDetalle(detail)`: plain string, dict with
      `reason` and `message`, dict without `message`, undefined.
- [x] 1.5 Tests for `cuerpoDeApuesta({picks, stake, initData, token})`: mode
      `saldo`, picks mapped through the ticket mapper, Telegram identity,
      bearer identity, referral code carried.

## Phase 2: GREEN — shared decision module

- [x] 2.1 Write `frontend/src/betBestActions.js` with those functions, reusing
      `betslipPicks` for the pick mapping. No JSX, no React, no fetch.
- [x] 2.2 Run the frontend suite green.

## Phase 3: Browser screen (`Web.jsx`)

- [x] 3.1 Replace the silent returns in `generarBoleto` with the module's
      decision and a visible message.
- [x] 3.2 Add the stake field and the confirm button under the total odd,
      betting with `Authorization: Bearer` from the stored session.
- [x] 3.3 Add the not-signed-in modal with a sign-in link opening the existing
      `Ingresar` component and an account link to
      `https://t.me/<botUsername>?start=<refCode>`.
- [x] 3.4 Render the dict-shaped refusal through `mensajeDeDetalle`, in this
      screen and in the other two places that read `e.detail`.
- [x] 3.5 Show the accepted bet with its stake and total odd; keep the code
      option when the bet is refused.
- [x] 3.6 Tests for the screen decisions that do not need a browser.
- [x] 3.7 Open PR 1 into `staging`.

## Phase 4: The scanned pick keeps its market and its start time

Found while reviewing work unit 1, and true of the code path already live in
production: `betslipPicks` sends neither `market` nor `commence_time`.

- `POST /api/apuesta` reads `market` (`bot/casino_api.py:15811`) and uses it for
  the same-match market limits, so a bet from the scanner escapes those limits.
  The scanner already returns `market` in every item; only the mapper drops it.
- Both `POST /api/apuesta` and `POST /api/betslip` store `commence_time`
  (`:15823`, `:15685`), and `_puede_anular` (`:13122`) refuses an agency
  cancellation without it: "No se pudo determinar cuándo empieza el evento.
  Pedile la anulación al administrador." The scanner never returns a start
  time, so every scanned ticket generated today is uncancellable by its agency.

- [x] 4.1 Test that the improved-bet item carries the start time of the event
      it was matched to, including through a corrected candidate.
- [x] 4.2 Add the start time to the scanner item in `/api/mejorar-combinada`,
      from the event the odd was resolved against.
- [x] 4.3 Tests that `betslipPicks` forwards `market` and `commence_time` when
      the pick carries them, and omits them when it does not.
- [x] 4.4 Forward both fields in `betslipPicks`.
- [x] 4.5 Open PR 2 on top of PR 1.

## Phase 5: Telegram screen (`App.jsx`)

- [x] 5.1 Same three behaviours on `ScreenMejorar`, reusing the module: visible
      outcome, stake field and confirm, refusal message as text.
- [x] 5.2 Bet with the Telegram identity; no account modal is needed inside the
      mini-app.
- [x] 5.3 Superseded: fixed `normalizarPicks` itself instead of routing the
      scanner around it. It now reads `home_real`/`away_real` before
      `h`/`home`/`a`/`away`, and the scanner's `selection` before `label`/`sel`,
      so every caller benefits, not just this screen. `ScreenMejorar` hands its
      playable picks to the same confirm flow every other screen uses (`onBet`
      → `confirmBet` → `HojaConfirmar` → `enviarApuesta`, which calls
      `normalizarPicks`) instead of a second, divergent bet path. `betslipPicks`
      stays reserved for the `/api/betslip` payload shape, which differs from
      what `confirmBet` expects — routing through it here would have been the
      wrong fix, not the right one.
- [x] 5.4 Tests for the added decisions.
- [ ] 5.5 Open PR 3 on top of PR 2.

### The same loss, two more places

Found while reviewing work unit 2. Both belong to the published-combo path, not
to the scanner, and both drop what work unit 2 just rescued.

- `App.jsx:1764` maps a combo's picks to `{id, label, odd, h, a}` before
  betting them, dropping `market`, `event_id`, `sport_key` and
  `commence_time`. Whatever the combo carries is thrown away at the last step.
- `/api/admin/escanear-combo` builds its item at `bot/casino_api.py:15299`
  without a start time, while `/api/admin/combos` (`:15173`) stores one from
  the picks it receives. So a combo published from the admin scanner is saved
  with no start time to store.

- [x] 5.6 Test that betting a combo keeps the identity of every pick.
- [x] 5.7 Superseded, same reasoning as 5.3: `betslipPicks` builds the
      `/api/betslip` payload shape, not the `confirmBet` one, so it was never
      the right mapper here either. Extracted `picksDeCombo`, a small mapper
      that shapes a combo pick the way `confirmBet` expects (the same shape
      `GenerarCombo`'s own mapper already used a few lines above), and pointed
      the "Apostar" button at it instead of the inline object literal that
      dropped `event_id`/`sport_key`/`market`/`commence_time` and put a team
      name where the event id belongs.
- [x] 5.8 Carry the start time in the admin scanner item too.

## Phase 6: Delivery

- [ ] 6.1 Exercise both channels in staging with the demo player: bet with
      balance, generate a code, and try both while signed out.
- [ ] 6.2 Release to `main` after the owner merges the three PRs.
