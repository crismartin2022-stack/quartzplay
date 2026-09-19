# Proposal: Quote The Line The Ticket Actually Names

## Intent

When the scanner reads an over/under selection from a rival's ticket, it must
answer about that selection, not about a different one that happens to share
the word "over".

## Evidence

`bot/casino_api.py:21903-21912`, inside `buscar_cuota_nuestra`:

```python
if "over" in sel_low or "más" in sel_low or "mas" in sel_low:
    tot = markets.get("totals", {})
    for k, v in tot.items():
        if k.lower().startswith("over"):
            return v, ev
```

The threshold the ticket named is never read. The function returns the price of
whichever total the feed listed first, and the caller has no way to know a
different line was used.

Both directions are wrong, and one of them costs money:

- The ticket says Over 3.5 and our first total is Over 1.5: we quote a low
  price for a selection that deserves a high one. The player is offered a worse
  deal than the rival's and walks.
- The ticket says Over 1.5 and our first total is Over 3.5: we quote a high
  price for a much more likely outcome, then improve it further
  (`:22187-22190`). That is a direct loss on every ticket it happens to.

The bug is latent rather than routine today only because the current feed
exposes a main-market view with few lines per event. It is not latent in
principle, and it stops being latent with any feed that returns several lines
per market, which is the norm.

The same applies to `under` at `:21908-21912`.

## Decision

From the product owner: when the ticket names a threshold we do not carry, the
odd is **not improved** — we offer the line we do have, at our own price.

That makes the behaviour three cases rather than two:

| The ticket's threshold | What we quote | Can it be improved |
|---|---|---|
| We carry it | Our price for that exact line | Yes, as today |
| We carry a different one | Our price for the nearest line we carry | No |
| We carry no total at all | Nothing | — |

A substituted line MUST be visible on the screen. Offering Over 2.5 against a
ticket that says Over 2.25 without saying so turns a comparison into a
sleight of hand: the player reads two numbers side by side and believes they
are about the same bet.

## Scope

- `buscar_cuota_nuestra` reads the threshold from the selection and matches it,
  and tells its caller when it had to fall back to a different line.
- The scanner marks those picks with a state of their own and leaves their odd
  untouched by the improvement.
- Both scanner screens show that state, with the line we are actually quoting.
- Its four call sites (`:15298`, `:15339`, `:22093`, `:22135`) keep working.

Out of scope: the market vocabulary itself. We understand ganador and
over/under and nothing else, and widening that is a separate decision.

## Rollback

Revert the PR. The scanner goes back to quoting the first total it finds.
