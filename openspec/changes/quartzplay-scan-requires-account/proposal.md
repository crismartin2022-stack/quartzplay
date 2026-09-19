# Proposal: An Account Is Needed To Scan

## Intent

In the browser, scanning a rival's ticket requires an account. Without one, the
camera and the file picker do not open: the screen offers signing in or
creating an account instead.

## Evidence

- The not-signed-in modal shipped on the bet button only:
  `frontend/src/Web.jsx:2017`, inside `apostar`. Scanning, analysing and seeing
  the improved combination are anonymous today, and the site says so at
  `:1474`: "No hace falta cuenta ni registrarse."
- The two entry controls are the camera button (`:2110`) and the file input
  (`:2120`). Both act with no check.
- A defect in the same function, found while reading it: `apostar` validates
  the stake at `:2016` **before** checking the session at `:2017`. A person
  without an account who presses the bet button with an empty amount is told to
  enter an amount, and only learns they need an account after typing one.

## Decision

From the product owner: the account comes first. Analysing an image costs us a
call to the vision provider on every scan, and the improved odds are the
product — neither should be given to someone who has not identified themselves.

The cost is accepted and worth naming: the scanner was also the front door. A
stranger who scanned, saw us beat their odd and signed up because of it no
longer has that path. Whoever measures the funnel should know the change is
deliberate.

## Scope

- Without an identity, the camera button and the file picker open the modal
  instead of acting. No image is read and no request is sent.
- Identity means either an open browser session or the identity Telegram
  provides. The public site can be opened inside Telegram, and a player
  identified that way must not be stopped.
- The modal is the one that already exists, with its link to sign in and its
  link to create an account.
- `apostar` checks the identity before the amount, so the first thing a person
  without an account is told is that they need one.
- The copy that says no account is needed stops saying it.

Out of scope: the Telegram mini-app screen, where the player is always
identified; and the agency terminal.

## Rollback

Revert the PR. Scanning goes back to being anonymous.
