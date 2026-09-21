# Finish the icon migration, with no exceptions left standing

## Why this exists

The owner reviewed staging and reported remaining emoji screen by screen,
then said the thing that matters: *"si voy uno por uno me quedo aquí por
siempre."*

He is right, and the cause is a rule we made. The **row rule** — a row of
related items migrates whole or not at all — was correct while the local icon
set was the only source: migrating half a row leaves a drawn icon beside two
emoji and reads like a failed load. But `lucide-react` is in the project and
covers nearly everything the local set lacks, so the rule stopped protecting
quality and started protecting unfinished work.

**The row rule is retired for this pass**, by the owner's decision. Where a
row needs a mark the local set lacks, take it from lucide and migrate the row
whole.

## What is left

Measured against this branch:

| Screen | UI emoji | In text that leaves the app |
|---|---:|---:|
| `Admin.jsx` | 207 | 1 |
| `Agencia.jsx` | 141 | 3 |
| `App.jsx` | 33 | 0 |
| `Web.jsx` | 26 | 0 |
| `Box.jsx` | 9 | 0 |
| **Total** | **416** | **4** |

**416 of the 420 render in the interface.** That is the whole remaining
migration, and it is finite.

## The one exception that stays

An emoji inside a string that **leaves the application** is not a migration
candidate: the WhatsApp message an agency forwards to a player, the HTML of
the print window, text drawn onto a canvas image. A React icon cannot go
there, and the emoji is right there — WhatsApp renders it consistently.

Classify by reading the code around each one, not by counting. The heuristic
that produced the "4" above is a window scan and is not authoritative; the
real number may be higher.

## Also in this pass

**The refresh button is standardised.** Today two sites draw a bare `🔄` and
three write "Actualizar". The owner wants the shape used on the Combos page —
**the word and the icon together** — everywhere a refresh button exists.
Find them all; they are not only the five the search above found.

## What the owner will see

Nothing moves, nothing is renamed, nothing changes colour. Emoji become drawn
icons that look the same on every device and take the brand's colours, and
the refresh control reads the same wherever it appears.

## Note on the black icons

Those are already fixed in PR #122, open at the time of writing: the document
declares its text colour for all six screens. Do not attempt to fix them
again here, and do not be surprised to see them black on a branch that
predates that merge.

## Scope

Authorized: `App.jsx`, `Web.jsx`, `Box.jsx`, `Agencia.jsx`, `Admin.jsx`, and
test files. `Icon.jsx` may gain marks; never change an existing one.

Out of scope: the tablet and desktop shell, which is a different layout and
its own stage.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces.
- Decorative icons get `aria-hidden`; one carrying meaning the text does not
  repeat gets an accessible name.
- Every new `lucide-react` name is named explicitly in the report, and the
  import-shape guards are updated to name them — never loosened.
- Where genuinely no icon fits, leave the emoji **and say which and why**.
  That list should be short now; if it is long, something is wrong.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- The emoji-ceiling guard drops to the new counts per screen.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.

## Tasks

- [ ] **T1** The player: `App.jsx`, `Web.jsx`, `Box.jsx` — 68 sites.
- [ ] **T2** `Agencia.jsx` — 141 sites.
- [ ] **T3** `Admin.jsx` — 207 sites.
- [ ] **T4** One refresh button everywhere.

## Delivery

One commit per task on `feat/quartzplay-finish-icons`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
