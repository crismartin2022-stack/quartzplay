# Drawn icons on the public site and the cashier screen

## Objective

`/sitio` and `/box` stop drawing meaning with emoji, the way the Telegram
app already does.

## Why this is safe

The 35 places that decided a message's colour by reading its first character
are gone (PRs #106, #107, #108). Nothing reads a glyph to decide anything, so
glyphs can move.

## What is here

Counted against this branch with the same regex the existing guard uses —
not from `docs/icon-inventory.md`, whose figures are stale:

| File | Route | Who sees it | Uses | Distinct |
|---|---|---|---:|---:|
| `Web.jsx` | `/sitio` | player, public web | **71** | 38 |
| `Box.jsx` | `/box` | cashier | **10** | 10 |

`Web.jsx`'s most frequent: ⚠️×11, ✅×6, 🤝×5, 💬×4, 📋×4, 🎰×3.

## What to draw them with

`docs/icon-inventory.md` maps emoji to icons. Read it for the mapping; ignore
its counts.

1. `frontend/src/Icon.jsx` — 36 ported icons. Prefer these.
2. `lucide-react` — already a pinned dependency.

`App.jsx` was migrated in the previous slice and is the worked example for
sizing, colour and `aria-hidden` usage. Match it; do not invent a second
style.

## The standing rule on choices

Cosmetic icon choices are the agent's to make, not the owner's. Pick the
best fit and move on. Do not produce a list of choices for approval — the
per-site detail belongs in this document, where it can be looked up.

Where no icon is defensible, leave the emoji. A wrong icon tells the reader
something untrue, which is worse than an emoji.

## Scope

Authorized: `frontend/src/Web.jsx`, `frontend/src/Box.jsx`, and test files.

Out of scope: `Agencia.jsx` (310 uses) and `Admin.jsx` (537), each its own
slice.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces. No new colours.
- Decorative icons get `aria-hidden`; an icon carrying meaning the text does
  not repeat gets an accessible name.
- A row of related items migrates as a row, or not at all.
- `Web.jsx`'s message components use the `{text, ok}` contract. Reading it is
  fine; changing its shape is not — a guard test fails if it moves.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- Extend the emoji-ceiling guard to `Web.jsx` and `Box.jsx`, with a positive
  control proving the counter can see an emoji.
- `npx eslint <file> --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build. Report the bundle size before and after.

## Tasks

- [ ] **T1** `Web.jsx` — the public site the player sees before signing up.
- [ ] **T2** `Box.jsx` — ten uses, the cashier screen.

## Delivery

One work-unit commit per task on `feat/quartzplay-site-icons`, stacked on
`feat/quartzplay-player-icons` because both edit the emoji-ceiling guard and
that PR is still open. Assess after each commit; when review is due, hand the
returned command back rather than running it.

## Progress

Not started.

## Next step

T1.
