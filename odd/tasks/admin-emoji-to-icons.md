# Drawn icons in the admin panel — the last screen

## Objective

`/admin` stops drawing meaning with emoji. With this, every screen in the
product has been through the migration.

## Who this is for

The admin — the owner's own team. Nobody outside the business sees this
screen, so the return is the lowest of the whole migration, and that is
worth saying plainly. It is being done to close the stage, not because a
player is waiting for it.

## What is here

Measured against this branch with the regex in `appEmojiCeiling.test.js`,
not quoted from `docs/icon-inventory.md`, whose figures have been stale
every single time this week:

**`Admin.jsx` — 488 uses across 63 components.** The largest file in the
product.

Heaviest components: `TabDiag` 43, `TabRiesgoSistema` 38, `TabCierre` 29,
`TabEventos` 22, `TabBonos` 21, `FichaAgencia` 19, `TabConfig` 17,
`TabMensajes` 17, `FichaCliente` 16.

## How it is sliced

488 replacements is roughly 980 authored changed lines: far past one
reviewable commit. Three slices, cut at component boundaries:

- **T1** — from the top of the file through `TabDiag` (~line 6365).
- **T2** — from after `TabDiag` through `TabMensajes` (~line 11272).
- **T3** — from `TabRiesgoSistema` (~line 11798) to the end.

Verify the boundaries against the file before cutting; line numbers move as
you edit, and the cut is at a component boundary, not a line number.

## What to expect, from the agency slice

`Agencia.jsx` migrated only 42% of its emoji, against 60% on the player's
screen, and the reason was structural rather than sloppy: a large share of
its emoji live in **text that gets sent** — the WhatsApp message an agency
forwards to a player, the HTML of the print window, text drawn onto a canvas
image. A React icon cannot go there, and the emoji is right there anyway:
WhatsApp renders it consistently and it makes the message readable.

Expect the same here, and classify rather than force. An emoji inside a
string that leaves the application is **not** a migration candidate.

## What to draw them with

`docs/icon-inventory.md` has the mapping. Read it for that; ignore its counts.

1. `frontend/src/Icon.jsx` — 36 ported icons. Prefer these.
2. `lucide-react` — pinned dependency. The player and agency slices settled on
   `Handshake`, `Video`, `Zap`, `Gift` and `Image as ImageIcon`. Reuse those
   before reaching for a new name, and if a new one is genuinely needed, say
   so in the report.

## The standing rule on choices

Cosmetic icon choices belong to the agent. Pick the best fit and move on; the
per-site detail goes in this document, not into a list for approval.

Where no icon is defensible, leave the emoji and record it with line and
reason. A wrong icon tells the reader something untrue.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- A row of related items migrates as a row, or not at all.
- This file's message components use the `{text, ok}` contract from PR #108.
  The `✅`/`⚠️` prefixes leave those message strings and become
  `<Icon name={msg.ok?"circle-check":"triangle-alert"}/>` in the render, as on
  every other screen. Do not reshape the contract —
  `messageStatusNotSniffed.test.js` fails if it moves.
- `Admin.jsx` also renders `🔒` as a success state (client blocked, agency
  suspended) and its old render matched it alongside `✅`. Those already read
  `ok: true`; leave their colour alone.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- Extend the emoji-ceiling guard to `Admin.jsx`, keeping its positive control.
- `npx eslint src/Admin.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build. Report the bundle size before and after.

## Tasks

- [ ] **T1** Top of file through `TabDiag`.
- [ ] **T2** After `TabDiag` through `TabMensajes`.
- [ ] **T3** `TabRiesgoSistema` to the end.

## Delivery

Three work-unit commits on `feat/quartzplay-admin-icons`, stacked on
`feat/quartzplay-agency-icons` because both edit the emoji-ceiling guard and
that PR is still open. Assess after each; when review is due, hand the
returned command back rather than running it.

## Progress

Not started.

## Next step

T1.
