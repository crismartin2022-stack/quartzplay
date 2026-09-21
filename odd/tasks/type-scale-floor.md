# The product stops writing at sizes nobody can read

## The measurement

Counted against this branch, across the six screens:

| Property | Uses | Distinct values | The prototype uses |
|---|---:|---:|---:|
| `fontSize` | 3.354 | 38 | ~10 |
| `borderRadius` | 920 | 18 | 4 |
| `padding` | 1.741 | **211** | 8 steps |
| `gap` | 591 | 15 | — |

**1.521 of the 3.354 text sizes are below 12px.** By screen: Admin 53%,
Agencia 43%, Telegram 42%, `/sitio` 37%, `/box` 19%.

What is actually down there:

```
 7px    2 sites        10px   450 sites
 7.5px  2              10.5px 144
 8px   20              11px   518
 8.5px  6              11.5px 140
 9px  149
 9.5px 90
```

Text at 7 and 8 pixels is not small: it is unreadable on any device. The
prototype's body is 13px and it reaches for 10px four times in its entire
design.

## Why this slice, and why only this slice

The whole normalisation is 6.606 sites. That is not one reviewable change, so
it is split by property; this one takes the floor and nothing else.

It is also the only part with a product argument rather than a tidiness one.
Six of every ten texts the player reads are at a size that is uncomfortable on
a phone, and no typeface, colour or icon fixes that.

## An honest limit, already established

A mechanical pass can raise the floor. **It cannot decide what is body text
and what is a caption** — an 11px button label and an 11px legal note are the
same number to a script and deserve different sizes. Raising the body from 12
to 13 where it is genuinely body is a second pass, per screen, with judgment.

An earlier proposal for this work rounded every size up to the next step on a
scale with an 11px floor. Measured, it moved 1.529 declarations and left the
count of texts at 12px or less **exactly unchanged**. That proposal was
discarded before any code was written. This one sets a floor instead.

## The change

1. `theme.js` gains the three scales the prototype defines, so later passes
   have somewhere to point:
   - spacing, the prototype's 4px grid: 4, 8, 12, 16, 20, 24, 32, 40
   - radii: 6, 10, 14, 20, plus full
   - text sizes: the steps the prototype actually uses
2. Every `fontSize` below 12 becomes 12. Nothing else moves — not radii, not
   padding, not the sizes already at 12 or above.

## The risk, stated plainly

1.521 texts get bigger. Some will wrap differently, some containers will grow,
and **this project's tests never render a component**, so nothing automated
will catch a layout that breaks. The guard can only prove no size below the
floor survives.

That makes staging the real check, and it makes the order matter: floor first,
alone, so that if something looks wrong there is one change to look at.

## Scope

Authorized: `frontend/src/theme.js` and the six screens' `fontSize`
declarations, plus test files.

Out of scope, each its own slice: radii (920 sites), padding and gap (2.332),
and the per-screen judgment pass that raises real body text to 13.

## Constraints

- Only `fontSize` values strictly below 12 change, and only to 12.
- Do not touch a size that is already 12 or above, even if it is odd.
- Do not change any other property while passing through a line.
- The scales added to `theme.js` are additive: nothing that imports it today
  may break.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that no `fontSize` below 12 survives in any of the six screens, with
  a positive control proving the matcher sees sizes at all.
- A guard pinning the scales `theme.js` exports.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.
- Report, per screen, how many declarations changed.

## Tasks

- [x] **T1** `theme.js` gains the spacing, radius and text scales. Commit
      `e6606c5`.
- [x] **T2** Every text size below 12 becomes 12. Commit `28da8ae`.

## Delivery

One commit per task on `fix/quartzplay-type-floor`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Both tasks done.

**T1 — `e6606c5` feat(theme): add spacing, radii and text scales**

- `SPACING`, `RADII`, `TEXT` added to `theme.js` as plain objects keyed by
  their own value (`TEXT[13]`, `SPACING[16]`), additive only — nothing
  consumes them yet.
- `SPACING` copies `html/styles.css` `--space-1`..`--space-10` verbatim
  (4, 8, 12, 16, 20, 24, 32, 40 — the prototype's own naming skips 7 and 9).
- `RADII` copies `--radius-sm/md/lg/xl` (6, 10, 14, 20) plus `full: 9999`,
  a conventional pill value with no prototype counterpart.
- `TEXT` — the literal, fixed `font-size` values `html/styles.css` actually
  applies at least once, read from the file rather than invented:
  `10, 11, 12, 13, 14, 15, 16, 20, 21, 28, 30, 32` (12 steps; the doc's
  "~10" was an approximation). Excluded: `font-size: 0` (an icon reset,
  not a text size), every `clamp(...)` declaration (a fluid range, not a
  fixed step — several of its endpoints, e.g. 30/38/40/64, already
  duplicate or extend past the fixed set), and `--text-display: 56px`,
  which is declared in `:root` but never applied anywhere in the
  stylesheet, so it is not a size the prototype *uses*.
- Guard: `theme.test.js`'s existing export-shape test extended to the new
  key list; three new tests pin `SPACING`/`RADII`/`TEXT` exactly.
- RED (before implementing): 4 failing —
  `SPACING is the prototype's 4px grid... Received: undefined`,
  `RADII matches... Received: undefined`,
  `TEXT is the fixed font-size steps... Received: undefined`,
  and the export-shape test (`Object.keys(themeModule)` missing the three
  new names). GREEN after implementing: `theme.test.js` 80/80.
- Checks: full suite 670/670 (was 667/667 baseline); ESLint on `theme.js`
  clean (exit 0) — `theme.test.js` was **not** run through that exact
  ruleset, since it (like the project's own `noUndefined.test.js`)
  deliberately excludes `.test.` files, which fail it on Jest globals
  (`describe`/`test`/`expect`) and `__dirname`, none of which are
  `no-undef` violations; production build compiled. Bundle: 286.3 kB
  before → 286.3 kB after (same hash), because nothing imports the new
  scales yet, so terser drops the unused exports in both builds.
- Assess (base `staging`): `risk: medium` (`executable_change` on
  `theme.js`), `changed_lines: 183`, `review_due: false`,
  `review_due_reason: under_budget`.

**T2 — `28da8ae` fix(frontend): raise the text-size floor to 12px**

- Guard written first: `frontend/src/fontSizeFloor.test.js`, a positive
  control per screen (`%s has literal fontSize declarations to check`)
  plus the floor assertion (`%s declares no fontSize under 12`). The
  matcher only captures a literal numeric `fontSize:` value immediately
  followed by the `,`/`}` that ends it — this is what correctly skips the
  file's handful of dynamic `fontSize` sites (`fontSize:fs`,
  `fontSize:fs+2`, `fontSize:size*0.42`, `fontSize:compacto?26:32`,
  `fontSize:critico?13:12`, `fontSize:"clamp(...)"`), none of which is a
  fixed value the measurement counted.
- RED (before the fix): 6 failing, one per screen — e.g.
  `App.jsx declares no fontSize under 12` listing offenders down to
  `8.5`; all 6 positive-control tests passed alongside them, proving the
  matcher does see sizes (12 passed/6 failed, 12 total). Fix applied via
  a run-once script mirroring the exact guard regex
  (`(fontSize\s*:\s*)(\d+(?:\.\d+)?)(\s*[,}])`, raise to 12 only when
  `< 12`), so what got touched is exactly what the guard checks.
  GREEN after: `fontSizeFloor.test.js` 12/12.
- Per-screen changed declarations (script output, cross-checked against a
  manual `rg` breakdown by value before the fix):
  | Screen | Changed | Measurement's screen-order total |
  |---|---:|---|
  | App.jsx | 239 | — |
  | Web.jsx | 139 | — |
  | Box.jsx | 26 | — |
  | Casino.jsx | 7 | — |
  | Agencia.jsx | 361 | — |
  | Admin.jsx | 749 | — |
  | **Total** | **1,521** | **1.521 (exact match)** |
  The value-by-value distribution also matched the measurement exactly:
  7px×2, 7.5px×2, 8px×20, 8.5px×6, 9px×149, 9.5px×90, 10px×450,
  10.5px×144, 11px×518, 11.5px×140 = 1,521.
- A `git diff` line-pairing check (before-line vs after-line with the
  fontSize number masked out) confirmed every one of the 1,521 changed
  lines differs *only* in the fontSize value — no radius, padding, or
  other property changed on any touched line.
- Checks: full suite 683/683 (0 failures); ESLint on all six screens
  clean (exit 0); production build compiled. Bundle: 286.3 kB → 284.92 kB
  (**-1.39 kB**), smaller — not predicted by the measurement. Collapsing
  many distinct decimal values (9, 9.5, 10, 10.5, 11, 11.5, …) into the
  single literal `12` gives terser/gzip more repetition to compress, at
  no cost since nothing else changed.
- Assess (base `staging`, cumulative): `risk: medium`
  (`executable_change` on `Admin.jsx`), `changed_lines: 3284`,
  `review_due: true`, `review_due_reason: slice_budget_reached`. Returned
  `next_transition.command` (not run — the consent envelope belongs to
  the owner):
  ```
  gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true
  ```

## What this pass did not do

No layout was rendered or visually checked — this project's tests never
render a component, so nothing here catches a layout that breaks because
1,521 texts got bigger. Staging is the real check. No body text was
raised from 12 to 13; that per-screen judgment pass is still ahead. Three
dynamic `fontSize` sites resolve to values under 12 for a "sm" button
variant (`App.jsx:221`, `Agencia.jsx:269`: `size==="sm"?11`; `Admin.jsx:63`:
`size==="sm"?10`) and two `fontSize=size*0.42`/`0.36` avatar-initial
sites (`Web.jsx:95`, `Box.jsx:161`, `Agencia.jsx:476`) — none of these are
literal `fontSize:` declarations, so none were in the measured 1,521 and
none were touched; they are visible for whoever does the per-screen pass.

## Next step

Radii slice (920 sites), then padding and gap (2.332), then the
per-screen judgment pass that raises real body text to 13. Review is due
on the current boundary (`slice_budget_reached`) — the owner should run
the returned `gentle-ai review status …` command before further work
lands on this branch.
