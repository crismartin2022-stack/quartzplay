# Proposal: Bet With Balance From The Browser

## Intent

A player must be able to bet and to generate a code from both channels: the app opened inside Telegram and a browser session. Today only Telegram can bet.

## Evidence

- `POST /api/apuesta` authenticates solely with Telegram `init_data` and answers 401 "Abri la app desde el bot de Telegram para apostar".
- Players created by an agency log in with `POST /api/cliente/login`, which issues a bearer token stored as `cliente:<id>` in the sessions table, the same store agency sessions use.
- Every other guard of the bet path (limits, balance in cents, bonus mode, influencer attribution) is independent of how the player was identified.

## Scope

- The bet endpoint accepts either the Telegram identity or a web client session, resolves the same player, and keeps every existing rule.
- An unauthenticated request answers a stable, machine-readable reason so the interface can offer registering or signing in.
- Tests covering both identities, their equivalence, rejection when both are absent or invalid, and that a web session cannot bet for another player.

Out of scope: the interface (stake field, confirm button, modal), the scanner, and anti-rescan protection.

## Rollback

Revert the PR; Telegram betting is unaffected.
