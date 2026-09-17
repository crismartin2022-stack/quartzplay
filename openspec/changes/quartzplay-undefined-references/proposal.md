# Proposal: Remove Undefined References That Blank The Screen

## Intent

Opening Bet Best on the public site leaves a black screen. The cause is a variable that does not exist, evaluated while rendering, which unmounts the whole application before any error boundary can catch it.

## Evidence (2026-09-17/18)

- Loading `juego.iaqp.lat/sitio` at phone width and clicking the Bet Best control reproduces `ReferenceError: refCode is not defined`; the page content drops to zero.
- `refCode` is passed to the scanner from the site root component but never declared there; the player app derives it from the link.
- A scan of every browser source for undefined references also found `cargar` used by the admin bonuses tab, which never defines it and never loads its list: saving, activating, or deleting a bonus blanks the admin.

## Scope

- Derive the referral code in the site root from the link, as the player app does.
- Add the missing loader to the admin bonuses tab and load the list on mount.
- Add a test that fails when any browser source references an undefined variable.

## Rollback

Revert the PR.
