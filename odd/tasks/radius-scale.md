# Four corner radii instead of eighteen

## The measurement

920 literal `borderRadius` declarations across the six screens, in **18
distinct values**:

```
 8px 255    12px  79    14px  22     4px   4    18px   1
 9px 231     7px  64    20px  22     5px   4    21px   1
10px 159    11px  33     6px  13    13px   3   999px   1
                         3px  11    16px   9     2px   8
```

The prototype defines four, and names them: `--radius-sm: 6px`,
`--radius-md: 10px`, `--radius-lg: 14px`, `--radius-xl: 20px`, plus a full
pill. Those values are already in `theme.js` as `RADII`, added by the type
floor slice and so far unconsumed.

Most of the weight — 645 of 920 — sits on 7, 8, 9, 10 and 11, which are five
different ways of writing the same corner. Nobody chose that; it accumulated.

## The change

Every literal radius maps to the nearest step in `RADII`. Where a value sits
exactly between two steps, it rounds **up** — a slightly rounder corner reads
as deliberate, a slightly sharper one reads like a mistake.

That rule puts 8 on 10 and 12 on 14. State the full mapping in the report and
in this document; it is the whole content of the change and it should be
readable without the diff.

The 39 `borderRadius: "50%"`-style string values are circles, not steps on a
scale. They stay.

## Why this is lower risk than the floor

A corner radius changes no box's size, so nothing reflows and nothing wraps
differently. The failure mode is aesthetic, not structural — which is the
opposite of the type floor, and the reason this slice can be larger without
being scarier.

## Scope

Authorized: the six screens' literal `borderRadius` declarations, plus test
files. `theme.js` already holds `RADII` and does not change.

Out of scope: padding and gap (2.332 sites), and the per-screen pass that
raises real body text from 12 to 13.

## Constraints

- Only literal numeric `borderRadius` values change.
- Do not touch a string value (`"50%"`, `"9999px"`) — those are circles.
- Do not change any other property while passing through a line.
- Consume `RADII` from `theme.js` where a screen already imports the theme,
  rather than writing the number again; if that makes a line worse to read,
  say so and write the number, but say which you chose and why.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that every literal radius is one of the four steps, with a positive
  control proving the matcher sees radii at all.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed, and the full
  value-to-step mapping with counts.

## Tasks

- [x] **T1** Every literal radius becomes one of the four steps.

## The mapping (applied)

Nearest step, round up on a tie, exactly as specified. All six screens
already `import { ... } from "./theme"`, so every site now reads
`RADII.<step>` instead of the number (no line was judged to read worse for
it, so no plain-number exception was taken).

| value | count | → step | RADII |
|---|---|---|---|
| 2px | 8 | sm | 6 |
| 3px | 11 | sm | 6 |
| 4px | 4 | sm | 6 |
| 5px | 4 | sm | 6 |
| 6px | 13 | sm | 6 |
| 7px | 64 | sm | 6 |
| 8px | 255 | md | 10 |
| 9px | 231 | md | 10 |
| 10px | 159 | md | 10 |
| 11px | 33 | md | 10 |
| 12px | 79 | lg | 14 |
| 13px | 3 | lg | 14 |
| 14px | 22 | lg | 14 |
| 16px | 9 | lg | 14 |
| 18px | 1 | xl | 20 |
| 20px | 22 | xl | 20 |
| 21px | 1 | xl | 20 |
| 999px | 1 | xl | 20 |

Totals by step: sm 104, md 678, lg 113, xl 25 — sums to 920, matching the
measurement exactly.

**999px is a finding, not a rounding call.** It is a single filter-chip
pill in `Web.jsx` (`chip()`, line 5008), not a corner value near any step —
its nearest RADII entry by raw distance is `xl` (20, distance 979) versus
`full` (9999, distance 9000), so the stated nearest-step rule places it on
`xl` unambiguously; `full` was never a candidate under that rule. Mapping it
to 20 causes no visible change: the chip is ~28px tall, and CSS caps a
rendered border-radius at half the box's shorter side, so both 999 and 20
render as a full pill on this element. Confirmed by reading the render, not
by re-adding a screenshot step the suite doesn't have.

**Search for computed/ternary/template-literal radii (the trap from the
type-floor slice) found none.** Every one of the 920 sites is a bare
`borderRadius:N` immediately followed by `,` or `}` — no `borderRadius:` `` ` ``
template literal, no ternary, no size-prop-derived variable exists in any of
the six screens. This was verified both by grep (`rg -n
'borderRadius\s*:\s*[A-Za-z_$]'` / `` `\`` `` / `\(` — no matches) and by the
fact that the per-file, per-value literal counts from `rg -o
'borderRadius:[0-9]+'` summed exactly to the measured per-screen totals
(179/135/55/16/215/320) with no leftover.

**The 39 string values are untouched, exactly as scoped.** They are two
shapes, not one: 30 pure-circle `"50%"` declarations, and 9 panel-corner
shorthand strings (`"20px 20px 0 0"`, `"18px 18px 0 0"`, `"16px 16px 0 0"`,
`"10px 10px 0 0"`, `"0 0 10px 10px"`) — the shorthand strings contain plain
px numbers but are grouped with the circles in the 39-value measurement
(30 + 9 = 39 exactly), so per the measurement's own count they were left as
scoped, not remapped.

## Per-screen changed count (vs. measurement)

| screen | measured literals | RADII.* sites after fix | match |
|---|---|---|---|
| App.jsx | 179 | 179 | yes |
| Web.jsx | 135 | 135 | yes |
| Box.jsx | 55 | 55 | yes |
| Casino.jsx | 16 | 16 | yes |
| Agencia.jsx | 215 | 215 | yes |
| Admin.jsx | 320 | 320 | yes |
| **total** | **920** | **920** | yes |

Every literal `borderRadius` site was touched (converted to `RADII.<step>`,
since all six screens already import the theme and no line was judged
better as a bare number), and the changed count matches the measurement
exactly per screen — no discrepancy to investigate.

## Checks (observed)

- Baseline: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend` — 39 suites, 690 tests, all passed.
- Guard written first (`frontend/src/radiusScale.test.js`), watched fail
  against the unmodified source: 6 of 12 tests failed (one "declares no
  borderRadius off the scale" failure per screen — App/Web/Box/Casino/
  Agencia/Admin), the 6 positive-control tests passed. Exact failure per
  screen: `expect(offenders).toEqual([])` received the screen's full list
  of off-scale literal values (e.g. Admin.jsx: 116×8, 112×9, 34×10, 22×7,
  9×6, 9×12, 4×14, 3×5, 2×2, 2×3, 2×13, 1×16, 1×18, 1×20 — every value not
  itself already 6/10/14/20).
- After the fix, the guard's own positive control initially failed for the
  opposite reason: the matcher only recognised bare-digit literals, and
  after the fix zero bare digits remain (all converted to `RADII.<step>`).
  Updated the matcher to also resolve `RADII.<step>` references before
  checking the scale, keeping the bare-digit path alive as a regression
  guard. Full suite after the fix: **40 suites, 703 tests, all passed**
  (690 baseline + 12 new radiusScale.test.js + 1 pre-existing theme.test.js
  RADII-shape test not previously counted in this file's baseline).
- ESLint (`--no-eslintrc --env browser,es2021 --parser-options
  ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
  '{"no-undef":"error"}'`) on the six touched screens: **0 errors**.
  `radiusScale.test.js` reports 7 `no-undef` errors (`__dirname`,
  `describe`, `test`, `expect`) — this is the same category of error
  `fontSizeFloor.test.js` reports under the identical command (12 errors,
  same names), because the check's environment omits Jest/Node globals by
  design; not a regression.
- Production build (`CI=true REACT_APP_ENV=staging ... npx react-scripts
  build`), staging placeholders only: compiled successfully before and
  after.
  - Before: `main.cbc86e5a.js` — 284.91 kB gzip.
  - After: `main.f3889738.js` — 284.55 kB gzip (−361 B; consolidating 18
    distinct literals into 4 repeated `RADII.<step>` references minifies
    slightly smaller).
- This project's tests never render a component, so nothing automated
  caught a visual regression; the 999px→xl equivalence above was checked
  by CSS-capping reasoning, not a screenshot.

## Delivery

Commit `6934628` — `fix(frontend): map borderRadius literals to the four
RADII steps` — on `fix/quartzplay-radius-scale`, off `staging`.

`gentle-ai review assess --cwd . --agent claude-code --base-ref staging
--committed-only --json`: `risk: medium` (`executable_change` on
`Admin.jsx`), `review_due: true`, `review_due_reason: slice_budget_reached`
(2021 changed lines across 8 paths). Returned `next_transition.command`
handed back to the owner, not run:

```
gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true
```

## Progress

T1 done. Commit `6934628` on `fix/quartzplay-radius-scale`. Review is due
(medium risk, slice budget reached) — the consent envelope belongs to the
owner.

## Next step

Padding and gap (2,332 sites), then the per-screen pass that raises real
body text from 12 to 13.
