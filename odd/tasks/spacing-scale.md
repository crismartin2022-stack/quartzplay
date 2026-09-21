# One spacing grid instead of two hundred guesses

## The measurement

2.494 spacing declarations across the six screens:

| Property | Uses |
|---|---:|
| `padding` | 1.753 |
| `gap` | 592 |
| `paddingTop` | 108 |
| `paddingBottom` | 32 |
| `paddingLeft` / `paddingRight` | 9 |

By the shape of the value:

- **1.294 are a plain number**, in 27 distinct values. The most used:
  `8×236  20×168  6×159  16×121  10×95  14×82  5×60  0×53  7×52  12×49`
- **1.186 are a string** like `"12px 14px"` — two to four numbers each, so the
  real count of spacing decisions hidden in there is higher than 1.186.
- 11 are a variable and 3 a template literal.

The prototype defines eight steps and nothing else: **4, 8, 12, 16, 20, 24,
32, 40**. They are already in `theme.js` as `SPACING`, added by the type-floor
slice and still unconsumed.

## The change

Every number in a spacing declaration maps to the nearest step. Ties round
**up**, for the same reason the type floor went up: the product reads cramped,
and the cheapest honest way to make it breathe is to stop rounding air away.

`0` is a real value — no space — and stays `0`.

The 11 variables and 3 template literals stay. Report what they are.

## The risk, and why it is bigger than the radius slice

A corner radius changes no box's size. **Padding does.** Every one of these
2.494 declarations moves something, boxes grow, and content that fit on one
line may stop fitting. This is the same class of risk as the type floor, on
more sites.

And as always here: **this project's tests never render a component.** The
guard can prove no spacing value sits off the grid. It cannot prove a screen
still looks right. Staging is the check, and this slice goes alone so that if
something breaks there is one change to look at.

## Scope

Authorized: the six screens' spacing declarations, plus test files.
`theme.js` already holds `SPACING` and does not change.

Out of scope: the per-screen pass that raises real body text from 12 to 13.

## Constraints

- Only spacing values change: `padding`, its four sides, `gap`, `rowGap`,
  `columnGap`. Nothing else on a line you pass through.
- `0` stays `0`.
- Strings keep their shape: `"12px 14px"` becomes `"12px 16px"`, not a
  different number of values and not a number where a string was.
- Consume `SPACING` from `theme.js` for plain numbers, the way the radius
  slice consumed `RADII`. A string of several values cannot reference it
  cleanly; leave those as strings and say so.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that every spacing number is a step or `0`, covering **both** plain
  numbers and the numbers inside strings, with a positive control proving the
  matcher sees spacing at all.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed, and the full
  value-to-step mapping with counts — including the values found inside
  strings, counted separately from the plain numbers.

## Tasks

- [x] **T1** Plain numeric spacing values map to the grid.
- [x] **T2** The numbers inside spacing strings map to the grid.

## The measurement, reconciled

The stated totals (2.494 declarations; 1.294 plain numbers; 1.186 strings)
were reproduced exactly by a raw text search for `padding:`/`gap:`/etc, but
a real scan of the six screens' `style={{...}}` objects (skipping strings,
template literals and comments, so it never matches spacing-shaped text
sitting inside an unrelated JS string) finds **2.480** real spacing
declarations, not 2.494. The 14-declaration gap is a finding, not a
rounding difference:

- **5** are `padding:0` inside a literal `*{box-sizing:border-box;margin:0;
  padding:0}` CSS-reset string, injected via `<style>{\`...\`}</style>` once
  per screen root (App.jsx, Web.jsx, Casino.jsx, Admin.jsx, and Agencia.jsx
  a second time in a print helper) — CSS text, not a JSX style object.
- **9** are inside Agencia.jsx's print-receipt/ticket HTML generators
  (`abrirVentanaImpresion`, `printCierre`, the `cssText`/`innerHTML` blocks
  around lines 306–411): `padding:16px`, `gap:8px`, `padding:13px` (×2),
  `padding:0` (×2), `padding:4mm` (×2), `padding:3px` — raw CSS text for a
  browser print window (a thermal receipt), one of them even in millimetres,
  not the SPACING scale's unit at all.

A naive `padding:\s*(\d+)` regex (matching leading digits regardless of what
follows, e.g. capturing "16" out of "16px") would count every one of these
14 as a plain number, which reconciles the totals exactly:
**1.294 measured plain numbers = 1.280 real ones + these 14.** The 1.186
string figure needed no such reconciliation: it already equals this scan's
1.173 mappable px-strings + 13 calc/env/% strings exactly. All are left
untouched — not part of this change's scope, and `padding:4mm` isn't even
expressible on the SPACING grid.

## The mapping (applied)

Nearest step, round up on a tie. `SPACING` (`theme.js`) has no `0` key, so
`0` stays the literal `0`, not a `SPACING[...]` reference. All six screens
already `import { ... } from "./theme"`, so a plain number now reads
`padding:SPACING[16]` (bracket notation — `SPACING`'s keys are numeric, so
`SPACING.16` isn't valid JS). A string cannot reference `SPACING` cleanly,
so a string keeps its own shape and its numbers become plain `Npx` text.

### T1 — plain numbers (1.280 sites, 27 distinct values)

| value | count | → step | value | count | → step |
|---|---|---|---|---|---|
| 8 | 235 | 8 | 15 | 17 | 16 |
| 20 | 168 | 20 | 2 | 12 | 4 |
| 6 | 159 | 8 | 3 | 12 | 4 |
| 16 | 120 | 16 | 18 | 12 | 20 |
| 10 | 95 | 12 | 28 | 7 | 32 |
| 14 | 82 | 16 | 11 | 6 | 12 |
| 5 | 60 | 4 | 22 | 6 | 24 |
| 7 | 52 | 8 | 30 | 3 | 32 |
| 12 | 49 | 12 | 17 | 2 | 16 |
| 0 | 46 | 0 (stays 0) | 26 | 2 | 24 |
| 9 | 35 | 8 | 40 | 2 | 40 |
| 13 | 34 | 12 | 1 | 1 | 4 |
| 24 | 33 | 24 | 166 | 1 | **exception — see below** |
| 4 | 29 | 4 | | | |

1.280 total. 1.233 sites converted to `SPACING[<step>]`; 46 zero-value sites
stay `0` (no text change); 1 site (166) is a documented exception, also
untouched.

**`App.jsx`'s `paddingRight:166` is left unchanged — a judgment call, not a
rounding call.** It sits on `BarraSuperior`'s mascot panel
(`onNav("mejorar")`, around App.jsx:5433), and the comment directly above it
says it and `minHeight:244` are "los mismos números que
`.hero-balance:has(.mascot-header)` en html/styles.css:876-891" — a reserved
image slot copied from a specific prototype selector, not a rhythm gap.
Forcing it onto the grid's 40px ceiling would cut the mascot's reserved
space by 126px and very likely make it overlap the panel's title/button —
the exact failure that comment says the number exists to prevent, and a
regression no automated check here would catch. Left as `166` and
allow-listed by exact site in `spacingScale.test.js`.

### T2 — numbers inside spacing strings (1.173 mappable sites, 33 distinct values)

| value | count | → step | value | count | → step |
|---|---|---|---|---|---|
| 12 | 272 | 12 | 20 | 37 | 20 |
| 10 | 237 | 12 | 1 | 28 | 4 |
| 9 | 204 | 8 | 15 | 28 | 16 |
| 0 | 185 | 0 (stays 0) | 18 | 20 | 20 |
| 11 | 185 | 12 | 40 | 19 | 40 |
| 8 | 158 | 8 | 30 | 14 | 32 |
| 14 | 133 | 16 | 24 | 12 | 24 |
| 13 | 113 | 12 | 22 | 7 | 24 |
| 6 | 108 | 8 | 17 | 6 | 16 |
| 7 | 82 | 8 | 50 | 4 | 40 |
| 4 | 73 | 4 | 36 | 3 | 40 |
| 5 | 69 | 4 | 80 | 3 | 40 |
| 3 | 44 | 4 | 120 | 3 | 40 |
| 2 | 43 | 4 | 26 | 2 | 24 |
| 16 | 43 | 16 | 90 | 2 | 40 |
| | | | 28 | 1 | 32 |
| | | | 34 | 1 | 32 |
| | | | 260 | 1 | 40 |

2.140 numbers found across 1.173 strings (a string holds two to four
values, so the count of numbers exceeds the count of strings, as the
measurement warned). 1.002 strings changed text; the rest already matched
the grid exactly (e.g. `"12px 14px"` → `"12px 16px"` changes text, `"8px
16px"` does not, since 8 and 16 are already steps).

**One further exception, discovered by the checks, not predicted in
advance: `App.jsx`'s `BarraSuperior` padding, `"5px 13px 5px"`.**
`topBarLogoSize.test.js` pins this exact string, measured with headless
Chromium, to keep the top bar exactly 51px tall now that its logo draws at
40px instead of 20px (see that file's own comment: 9px padding would make
the row 59px; 5px brings it back to 51px). Rounding 5→4 mechanically would
shave 2px off a height that was deliberately measured, not chosen for
rhythm, and would have silently detuned a fix a pre-existing test exists
specifically to hold in place. Reverted to `"5px 13px 5px"` and allow-listed
by exact string in `spacingScale.test.js`, the same shape of exception as
`paddingRight:166` above.

### Left untouched, as scoped

- **13 `calc(...)`/`env(...)`/`%` strings** — none rewritten:
  - 8 contain `calc(Npx + env(safe-area-inset-bottom))`, where the `calc`'s
    own number can be paired with a sibling value in the same string (e.g.
    App.jsx:2733 `"18px 16px calc(18px + env(safe-area-inset-bottom))"` —
    the top padding and the calc's addend are both 18 on purpose). Rewriting
    one without the other risks decoupling that pairing, so the whole
    string is left alone: App.jsx:2733, Web.jsx:4952, Box.jsx:1341,
    Agencia.jsx:1674/7012/8047, Admin.jsx:2291/14327.
  - 2 are `"env(safe-area-inset-bottom)"` alone (Web.jsx:2835,
    Admin.jsx:14346) — no number to map either way.
  - 1 is App.jsx:5361 `"5px 8px env(safe-area-inset-bottom)"` — no `calc()`,
    so no coupling risk, but left untouched anyway for consistency with the
    other 12 (a single blanket rule — "any string with calc/env/% stays" —
    is easier to verify and to re-check on the next pass than a rule with
    one carve-out).
  - 2 are `paddingTop:"100%"` (App.jsx:3808, Web.jsx:2996) — the
    aspect-ratio-box hack, a percentage of the element's own width, not a
    spacing value.
- **11 ternary/computed values** (the hazard this document called out in
  advance) — left exactly as written:
  - `padding:compacto?"10px 12px":"14px"` — App.jsx:2822, Agencia.jsx:3867,
    Admin.jsx:2092
  - `padding:logo?"6px 13px":"9px 15px"` — App.jsx:3771, Web.jsx:2959
  - `padding:critico?"16px":"12px 14px"` — Agencia.jsx:243
  - `paddingBottom:k<emitidos.length-1?18:0` — Web.jsx:616
  - `gap:ancho?22:12` — Web.jsx:4620
  - `padding:ancho?"0 18px":"0 10px"` — Web.jsx:4621
  - `padding:ancho?"9px 18px":"8px 10px"` — Web.jsx:4700
  - `padding:ancho?"14px 18px 60px":"12px 10px 30px"` — Web.jsx:4787
- **3 template literals** — left exactly as written:
  - `` padding:`0 ${size==="sm"?"10px":"20px"}` `` — App.jsx:225
  - `` padding:`0 ${size==="sm"?"10px":"18px"}` `` — Agencia.jsx:273
  - `` padding:`0 ${size==="sm"?"10px":"16px"}` `` — Admin.jsx:67
- **14 non-declarations** (out of scope, see "The measurement, reconciled"
  above) — the global CSS-reset string's `padding:0` (×5) and Agencia's
  print-receipt CSS text (×9, including two `padding:4mm`).

## Per-screen changed count

| screen | T1: plain-number sites | T1 changed | T2: mappable strings | T2 text changed |
|---|---:|---:|---:|---:|
| App.jsx | 195 | 181 (1 exception) | 252 | 205 (1 exception) |
| Web.jsx | 123 | 113 | 176 | 152 |
| Box.jsx | 55 | 54 | 45 | 32 |
| Casino.jsx | 19 | 17 | 10 | 7 |
| Agencia.jsx | 348 | 341 | 270 | 227 |
| Admin.jsx | 540 | 527 | 420 | 378 |
| **total** | **1.280** | **1.233** | **1.173** | **1.001** |

"T1 changed" excludes the 46 zero-value sites (no text change) and the one
`paddingRight:166` exception. "T2 text changed" counts a string only when
at least one of its numbers actually moved (e.g. an all-already-on-grid
string like `"8px 16px"` is touched by the guard but produces no diff); it
excludes the one `BarraSuperior` exception. 1.280 + 1.173 + 13 + 11 + 3 =
2.480, matching the reconciled real-declaration count exactly (see above) —
no further discrepancy to investigate.

## Checks (observed)

- Baseline: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend` — 40 suites, 703 tests, all passed (run against the
  unmodified tree; T1's changes were stashed for this run specifically to
  get a true baseline after already having written them).
- Guard written first (`frontend/src/spacingScale.test.js`), watched fail
  against the unmodified source: 12 of 24 tests failed — one "declares no
  bare/SPACING[] spacing value off the scale" and one "declares no
  in-string spacing number off the scale" failure per screen (12 sites × 2
  categories); the 12 positive-control tests (6 screens × plain-number and
  string) all passed. Exact failure shape: `expect(offenders).toEqual([])`
  received each screen's full list of off-scale values, e.g. Admin.jsx's
  plain-number offenders included 13, 10, 9, 18, 10, 6, 1, 6, 11, 13, 1 …
  (every value not itself already 4/8/12/16/20/24/32/40).
- After T1 (numbers): re-ran the guard — the 6 plain-number assertions now
  passed; the 6 string assertions still correctly failed (T2 not done yet).
  Full suite: 41 suites, 728 total (6 failed, 722 passed) — the 6 failures
  were exactly the not-yet-done T2 string assertions, nothing else broke.
- After T2 (strings): full suite went to **41 suites, 728 tests, all
  passed** — except for one pre-existing test that failed on the first
  pass, `topBarLogoSize.test.js`, because its pinned string
  `"5px 13px 5px"` had been mechanically rounded to `"4px 12px 4px"`. That
  is the `BarraSuperior` exception described above; once reverted and
  allow-listed, the full suite passed clean (41/41 suites, 728/728 tests).
- ESLint (`--no-eslintrc --env browser,es2021 --parser-options
  ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
  '{"no-undef":"error"}'`) on the six touched screens after both commits:
  **0 errors**. `spacingScale.test.js` reports 12 `no-undef` errors
  (`__dirname`, `describe`, `test`, `expect`) under the identical command —
  the same category `radiusScale.test.js`/`fontSizeFloor.test.js` report,
  because the check's environment omits Jest/Node globals by design; not a
  regression.
- Production build (`CI=true REACT_APP_ENV=staging ... npx react-scripts
  build`), staging placeholders only: compiled successfully before and
  after. Measured directly (a worktree checked out at `5f32019`, the
  commit immediately before this slice, built with the same node_modules)
  rather than inferred from a stale build folder.
  - Before (`5f32019`): `main.2c7675a5.js` — 284.56 kB gzip.
  - After (`df4eb89`): `main.24a87976.js` — 283.17 kB gzip (−1.39 kB;
    consolidating repeated numeric literals into repeated `SPACING[<step>]`
    references minifies slightly smaller, as the radius slice's `RADII`
    consumption did).
- This project's tests never render a component, so nothing automated
  checks a layout that breaks from a size change. Padding changes box
  sizes — unlike the radius slice, this is not a visually-inert change.
  Staging is the real check; the two exceptions above (`paddingRight:166`,
  `BarraSuperior`'s padding) are exactly the kind of regression that
  mechanical rounding could have caused silently, and both were caught
  before shipping — one by reading the surrounding comment, one by an
  existing pixel-measured test.

## Delivery

- Commit `fd8a928` — `fix(frontend): map plain numeric spacing literals to
  the SPACING steps` (T1).
- Commit `df4eb89` — `fix(frontend): map numbers inside spacing strings to
  the SPACING steps` (T2).

Both on `fix/quartzplay-spacing-scale`, off `staging`.

`gentle-ai review assess --cwd . --agent claude-code --base-ref staging
--committed-only --json` after each commit: `risk: medium`
(`executable_change` on `Admin.jsx`), `review_due: true`,
`review_due_reason: slice_budget_reached` (2.678 changed lines after T1;
4.641 after T2, across 8 paths — the reviewed boundary never advanced past
`staging` since neither review was acknowledged). Returned
`next_transition.command` after both commits (identical apart from the
line/path totals already assessed):

```
gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true
```

Handed back to the owner, not run.

## Progress

T1 and T2 done. Commits `fd8a928` (T1) and `df4eb89` (T2) on
`fix/quartzplay-spacing-scale`. Review is due after both (medium risk,
slice budget reached) — the consent envelope belongs to the owner.

## Next step

The per-screen pass that raises real body text from 12 to 13.
