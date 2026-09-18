# Tasks: Finish The Improved-Bet Screen

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 550–700 (tests about a third) |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 shared module + browser screen; PR 2 Telegram screen |
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
- [ ] 3.7 Open PR 1 into `staging`.

## Phase 4: Telegram screen (`App.jsx`)

- [ ] 4.1 Same three behaviours on `ScreenMejorar`, reusing the module: visible
      outcome, stake field and confirm, refusal message as text.
- [ ] 4.2 Bet with the Telegram identity; no account modal is needed inside the
      mini-app.
- [ ] 4.3 Make the scanner path send picks through the ticket mapper, never
      through `normalizarPicks`, so the selection survives.
- [ ] 4.4 Tests for the added decisions.
- [ ] 4.5 Open PR 2 on top of PR 1.

## Phase 5: Delivery

- [ ] 5.1 Exercise both channels in staging with the demo player: bet with
      balance, generate a code, and try both while signed out.
- [ ] 5.2 Release to `main` after the owner merges both PRs.
