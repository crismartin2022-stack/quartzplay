# Drawn icons in the agency panel

## Objective

`/agencia` stops drawing meaning with emoji, the way the player's screens
already do.

## Who this is for

The agency. Not the player — nobody outside the business sees this screen.
That is worth saying plainly: this is the lowest-return slice of the
migration by audience, and it is being done because the owner chose to close
the stage, not because a player is waiting for it.

What it does buy: an agency that shows this panel to a player sees the
brand, not the emoji font of whatever computer it is open on. And the panel
stops looking different on every machine in the same office.

## What is here

Counted against this branch with the regex in `appEmojiCeiling.test.js` —
not from `docs/icon-inventory.md`, whose figures are stale:

**`Agencia.jsx` — 269 uses, 73 distinct, spread across 55 components.**

## How it is sliced, and why

269 replacements is roughly 540 authored changed lines: too much for one
reviewable commit. The cut falls at a boundary that means something rather
than at a line number:

- **T1 — the daily operation**, from the top of the file through
  `Historial` (~line 5803): ticket flows, combos, clients, bonuses, printing,
  providers, terminals, channels. **134 uses.**
- **T2 — closings, account and influencers**, from `Cierres` (~line 5903) to
  the end: closings, password and account config, sub-agencies, and the whole
  influencer sub-product. **135 uses.**

Both land in one PR. The total is over the usual per-slice budget and that is
reported rather than worked around: splitting a single mechanical pass over
one file into two PRs costs the owner two merges and buys nothing.

## What to draw them with

`docs/icon-inventory.md` has the mapping. Read it for that; ignore its counts.

1. `frontend/src/Icon.jsx` — 36 ported icons. Prefer these.
2. `lucide-react` — already a pinned dependency.

`App.jsx` and `Web.jsx` are the worked examples for sizing, colour and
`aria-hidden`. Match them; do not invent a third style.

## The standing rule on choices

Cosmetic icon choices belong to the agent, not the owner. Pick the best fit
and move on; the per-site detail goes in this document, not into a list for
approval.

Where no icon is defensible, leave the emoji and record it. A wrong icon
tells the reader something untrue, which is worse than an emoji.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces. No new colours.
- A row of related items migrates as a row, or not at all.
- This file's message components use the `{text, ok}` contract. The `✅`/`⚠️`
  prefixes leave the message strings and become
  `<Icon name={msg.ok?"circle-check":"triangle-alert"}/>` in the render, as
  in `App.jsx` and `Web.jsx`. Do not reshape the contract itself —
  `messageStatusNotSniffed.test.js` fails if it moves.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- Extend the emoji-ceiling guard to `Agencia.jsx`, keeping its positive
  control.
- `npx eslint src/Agencia.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build. Report the bundle size before and after.

## Tasks

- [ ] **T1** The daily operation — top of file through `Historial`.
- [ ] **T2** Closings, account and influencers — `Cierres` to the end.

## Delivery

Two work-unit commits on `feat/quartzplay-agency-icons`, off `staging`.
Assess after each; when review is due, hand the returned command back rather
than running it.

## Progress

Not started.

## Next step

T1.
