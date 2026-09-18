# Proposal: Send The Resolved Event When Generating A Ticket

## Intent

Production validates every odd against the live feed and rejects a ticket it cannot verify. Names read from a photo rarely match the feed spelling, so a scanned play can still be refused after the selection fix.

## Evidence (2026-09-18)

- Production answers "Las cuotas cambiaron o no se pudieron verificar" when the event cannot be matched in the feed; the validator matches by team names.
- The scanner already resolves the event against our own feed and returns its names and identifiers alongside the scanned ones.
- The ticket payload was sending the scanned names and no identifiers.
- Staging does not set the validation mode, so it never reproduced this behavior.

## Scope

- The payload prefers the names our feed resolved and carries the event and sport identifiers when known.
- Staging is aligned with the production validation mode (operational step).

Out of scope: the validator, the scanner, and the feed.

## Rollback

Revert the PR.
