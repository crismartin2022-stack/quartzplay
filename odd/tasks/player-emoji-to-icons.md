# Drawn icons instead of emoji, starting with the player

## Objective

The Telegram mini-app stops drawing meaning with emoji. Every operating
system renders them differently, none of them takes the brand's colours, and
on older devices some render as an empty box.

## Why this is safe now, and was not before

An emoji used to be the data: 35 places decided a message's colour by reading
its first character. PRs #106, #107 and #108 moved the status into its own
state across all four screens. Nothing reads a glyph to decide anything
anymore, so glyphs can finally move.

## What is here

`App.jsx` — the player in Telegram — holds 153 emoji uses, 56 distinct:

- **11 inside message strings** (`setMsg({text:"✅ Listo", ok:true})`)
- **100 inside JSX**, the chrome: card headers, buttons, labels, empty states
- **42 elsewhere**, mostly strings built for display

## What to draw them with

`docs/icon-inventory.md` (272 lines) already maps emoji to icons and was
written for exactly this migration. Read it; do not redo it.

Two sources, in this order:

1. `frontend/src/Icon.jsx` — 22 icons ported from the prototype. Prefer these:
   they are the product's own set and already carry its stroke and sizing.
2. `lucide-react`, already a pinned dependency and already used by `App.jsx`.
   The inventory lists 64 emoji with no equivalent in the local set; lucide
   covers essentially all of them.

If neither has a defensible equivalent for a given emoji, **leave that emoji
alone and list it in the report**. A wrong icon is worse than an emoji: it
tells the player something untrue.

## Scope

Authorized: `frontend/src/App.jsx`, `frontend/src/Icon.jsx` (only to add
icons, never to change existing ones) and test files.

Out of scope: `Web.jsx` (85 uses), `Agencia.jsx` (310), `Admin.jsx` (537),
`Box.jsx` (13). Each is its own slice, in that order, player-facing first.

## Constraints

- **Nothing else changes.** No copy, no layout, no colour, no sizing beyond
  what placing an icon in a line of text requires.
- An icon that replaces an emoji inherits the colour of the text it sat in.
  Do not introduce new colours; use the theme.
- Decorative icons get `aria-hidden`. An icon that carries meaning the text
  does not repeat gets an accessible name.
- A row of related items migrates as a row. If three buttons sit together and
  only two have equivalents, either find the third or leave all three — one
  drawn icon beside two emoji looks like a bug. The inventory names this case.
- Do not touch the `{text, ok}` message contract. Reading it is fine; changing
  its shape is not.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Record the baseline first.
- A guard test that counts emoji in `App.jsx` and fails if the count rises,
  with a positive control proving the counter can see them.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with staging-shaped placeholders. Report the bundle size:
  each icon costs bytes and has to earn them.

## Tasks

- [ ] **T1** The status messages. The `✅`/`⚠️` prefixes leave the message
      text and become a drawn icon in the render, beside the text, coloured
      by `msg.ok`. This is what the three previous PRs were for.
- [ ] **T2** The chrome: the emoji in `App.jsx`'s JSX become icons, guided by
      the inventory.

## Delivery

One work-unit commit per task on `feat/quartzplay-player-icons`, off
`staging`. Assess after each with `gentle-ai review assess --cwd . --agent
claude-code --base-ref <last boundary> --committed-only --json`. When review
is due, hand the returned command back verbatim rather than running it.

If T2's diff passes about 400 authored changed lines, stop and report where a
second slice should cut, rather than delivering one unreviewable change.

## Progress

Not started.

## Next step

T1.
