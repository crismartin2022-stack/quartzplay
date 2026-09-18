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

- [ ] 4.1 Test that the improved-bet item carries the start time of the event
      it was matched to, including through a corrected candidate.
- [ ] 4.2 Add the start time to the scanner item in `/api/mejorar-combinada`,
      from the event the odd was resolved against.
- [ ] 4.3 Tests that `betslipPicks` forwards `market` and `commence_time` when
      the pick carries them, and omits them when it does not.
- [ ] 4.4 Forward both fields in `betslipPicks`.
- [ ] 4.5 Open PR 2 on top of PR 1.

## Phase 5: Telegram screen (`App.jsx`)

- [ ] 5.1 Same three behaviours on `ScreenMejorar`, reusing the module: visible
      outcome, stake field and confirm, refusal message as text.
- [ ] 5.2 Bet with the Telegram identity; no account modal is needed inside the
      mini-app.
- [ ] 5.3 Make the scanner path send picks through the ticket mapper, never
      through `normalizarPicks`, so the selection survives.
- [ ] 5.4 Tests for the added decisions.
- [ ] 5.5 Open PR 3 on top of PR 2.

## Phase 6: Delivery

- [ ] 6.1 Exercise both channels in staging with the demo player: bet with
      balance, generate a code, and try both while signed out.
- [ ] 6.2 Release to `main` after the owner merges the three PRs.
