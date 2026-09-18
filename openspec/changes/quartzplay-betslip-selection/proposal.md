# Proposal: Generate A Ticket From A Scanned Bet

## Intent

After a successful scan, generating the play fails: the request is rejected with "Faltan datos de la selección" and the visitor is left without a code.

## Evidence (2026-09-18)

- The scanner returns each pick with `home`, `away`, `market`, `selection`, and `odd_final`.
- The screens built the ticket payload reading `sel`, `seleccion`, or `label`, none of which the scanner sets, so the selection travelled empty.
- The endpoint rejects an empty selection. Reproduced against the staging API: the empty payload answers 400 with that message, and the same payload carrying the selection answers 200 with a code.

## Scope

- One shared function builds the ticket payload from scanned picks, accepting the scanner field, the corrected selection, and the short shapes used elsewhere.
- Both the public site and the player app use it.

Out of scope: the endpoint, the scanner, and the correction flow.

## Rollback

Revert the PR.
