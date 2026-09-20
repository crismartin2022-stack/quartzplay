# The Telegram app gets the brand typeface

## Objective

`App.jsx` renders in Poppins, like the rest of the product, instead of in
whatever font the player's operating system defaults to.

## Problem

`App.jsx` writes `fontFamily:"'Inter',system-ui"` inline in about 365 style
objects. **Inter is not served anywhere**: `frontend/src/fonts.css` declares
only `@font-face` families for `Poppins`, and nothing else loads Inter. So
every one of those 365 sites falls through to `system-ui` — the OS default.

Meanwhile the same file already imports `F_BODY`/`F_NUM` from `theme.js` and
uses them correctly in about 16 places, which do render in Poppins. The
screen is currently a mix of two typefaces for no reason anyone chose.

`Box.jsx` shows the intended pattern: it imports the constants and uses them.

## Why now

The visual foundation shipped Poppins and the mark, the theme was cut to one,
and the home screen was homologated against the prototype. The most-looked-at
screen in the product is still not using the brand's typeface, which undoes
part of what those changes were for.

## Scope

Authorized: `frontend/src/App.jsx` and a test file.

Out of scope, each its own piece of work: `Web.jsx` (268 occurrences),
`Admin.jsx` (967), `Agencia.jsx` (622) and `Casino.jsx` (11). They carry the
same defect at a larger scale and in files still on the old palette.

## Constraints

- **Rendering must not change except for the typeface.** No size, weight,
  spacing, colour or layout edits ride along.
- `F_BODY` and `F_NUM` are the same string today. Replace the hardcoded
  literal with `F_BODY` mechanically; do **not** hand-pick `F_NUM` across 365
  sites to express a numeric/body distinction that has no effect yet. Say so
  in the report: when the two constants diverge, choosing per site becomes
  real work and should be done deliberately, not guessed now.
- Leave the ~16 sites that already use `F_BODY`/`F_NUM` exactly as they are.
- Do not touch `fonts.css`, `theme.js` or any other file.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Record the baseline count before changing anything.
- A new test asserting `App.jsx` contains no hardcoded font-family string
  literal — written first, observed failing, then made to pass.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with staging-shaped `REACT_APP_*` values.

## Acceptance

No font-family string literal remains in `App.jsx`. The suite is green at
baseline plus the new test. The build succeeds.

## Tasks

- [x] **T1** Write the guard test (RED), then replace every hardcoded
      `'Inter',system-ui` in `App.jsx` with `F_BODY` (GREEN).
      Commit: `031a692` — `fix(frontend): render App.jsx in the brand typeface`.
      Replaced 376 occurrences of `fontFamily:"'Inter',system-ui"` with
      `fontFamily:F_BODY`, mechanically (no `F_NUM` hand-picking; the two
      constants are identical strings today). The ~15 pre-existing
      `F_BODY`/`F_NUM` sites were left untouched. Two unrelated,
      pre-existing font-family literals — `fontFamily:"monospace"` on the
      error boundary's stack-trace display, and
      `fontFamily:"system-ui,-apple-system,sans-serif"` on the
      registration wrapper — were deliberately left alone: they are not
      the Inter defect and naming a different typeface on purpose is out
      of this change's scope.

- [x] **T2** The same defect on `/box`, and a guard that covers every clean
      screen instead of only `App.jsx`. Commit `8f3000d`. `Box.jsx` named
      `'Inter'` in four places (lines 397, 405, 412, 1200); it already
      imported `F_BODY`/`F_NUM` and used them elsewhere, so these four were
      stragglers. `appTypeface.test.js` now runs over `App.jsx`, `Web.jsx`,
      `Casino.jsx` and `Box.jsx`, and additionally rejects `'Space Grotesk'`
      so the literal cannot spread from the panels that still carry it.
      Observed RED first: with `Box.jsx` unfixed the suite reported
      `2 failed, 14 passed, 16 total`, both failures on `Box.jsx`.
      Full suite 416 -> **429 passed**. ESLint clean on `Box.jsx`.
      Production build `Compiled successfully`, 284.5 kB gzip.

- [x] **T3** The admin and agency panels adopt Poppins. The owner decided
      this on 2026-09-20, choosing it over shipping Space Grotesk: one visual
      system, and no extra font file on every load. `Admin.jsx` (966 sites)
      and `Agencia.jsx` (620 sites) named `'Space Grotesk',system-ui`, a
      typeface served nowhere, so both panels rendered in `system-ui`.
      Both files already imported `oscuro as Q` from `./theme`, so they were
      on the current palette; they simply never imported the font constants.
      Commit: `6979a7b` — `fix(frontend): render admin and agency panels in
      the brand typeface`.

      Replaced 966 occurrences of `fontFamily:"'Space Grotesk',system-ui"`
      in `Admin.jsx` and 620 in `Agencia.jsx` with `fontFamily:F_BODY`,
      mechanically (no `F_NUM` hand-picking; the two constants are identical
      strings today). `F_BODY` was added to each file's existing `./theme`
      import rather than a second import statement. One extra site was
      found and fixed beyond the literal `fontFamily:` pattern:
      `Admin.jsx:1967` passed `F_BODY={"'Space Grotesk',system-ui"}` as a
      prop into `<CameraCapture>`, which itself uses `fontFamily: F_BODY`
      internally — the same defect one level of indirection deep. Changed
      to `F_BODY={F_BODY}`, matching how `App.jsx` and `Web.jsx` already
      call the same component. After the fix, `rg "Space Grotesk"` over
      both files returns zero matches (verified by exit code, not silence).

      Baseline: `CI=true npx react-scripts test --watchAll=false` —
      29 suites, 429 tests, all passed.

      Guard test extended first: added `Admin.jsx`/`Agencia.jsx` to
      `CLEAN_SCREENS` and rewrote the header comment (it previously said
      the two files were deliberately excluded pending a product decision;
      that decision is now made, so the comment now states it and the date).
      Observed RED before the fix: `Test Suites: 1 failed, 1 total`,
      `Tests: 2 failed, 22 passed, 24 total` — both failures on
      `"still uses the theme's font constants"` for `Admin.jsx` and
      `Agencia.jsx` (neither imported `F_BODY`/`F_NUM` yet). After the fix:
      GREEN, `24/24` passed.

      Full suite after the fix: 29 suites, **437 passed** (429 baseline +
      8 new tests, 4 per newly-covered file).

      `git diff --stat`: `Admin.jsx` 968 insertions / 968 deletions (966
      `fontFamily` sites + 1 import line + 1 `CameraCapture` prop line);
      `Agencia.jsx` 621 insertions / 621 deletions (620 `fontFamily` sites +
      1 import line). Programmatically verified every changed line differs
      from its removed counterpart solely by the expected substitution
      (`fontFamily:"'Space Grotesk',system-ui"` → `fontFamily:F_BODY`, the
      import addition, or the `CameraCapture` prop fix) — **0 mismatches**.

      `npx eslint Admin.jsx --no-eslintrc --env browser,es2021
      --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true}
      --rule '{"no-undef":"error"}'` — exit 0, no output. Same command on
      `Agencia.jsx` — exit 0, no output.

      Production build with staging-shaped `REACT_APP_*` placeholder
      values: succeeded both before and after the fix (`git stash` on the
      three changed files for the "before" build, matching the T1/T2
      method). Bundle size (gzip, `main.*.js`): **284.5 kB before →
      283.01 kB after** (−1.49 kB; `F_BODY` is a shorter token than the
      repeated literal).

      `gentle-ai review assess --cwd . --agent claude-code --base-ref
      staging --committed-only --json` on commit `6979a7b`: `risk:
      "medium"`, `review_due: true`, `review_due_reason:
      "slice_budget_reached"`. Returned `next_transition.command` (not run —
      consent belongs to the repository owner):
      `gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true`

      Deliberately left alone: the unrelated `fontFamily:"system-ui,-apple-system,sans-serif"`
      literal in both files, and `fontFamily:"monospace"` in `Agencia.jsx`
      — they name a different typeface on purpose. No size, weight,
      spacing, colour or layout changed.

## Delivery

One work-unit commit. Branch `fix/quartzplay-app-typeface` off `staging`.
After the commit, run
`gentle-ai review assess --cwd . --agent claude-code --base-ref staging --committed-only --json`
and report `review_due`/`review_due_reason`/`risk`. If review is due, hand the
returned `next_transition.command` back verbatim — do not run it.

## Progress

All three tasks are done: T1 (`031a692`), T2 (`8f3000d`), T3 (`6979a7b`,
on this branch `fix/quartzplay-panel-typeface`). Every clean screen —
`App.jsx`, `Web.jsx`, `Casino.jsx`, `Box.jsx`, `Admin.jsx`, `Agencia.jsx` —
now renders in Poppins via the theme's `F_BODY`/`F_NUM` constants, and the
guard test covers all six. T3's full check output is recorded under its
task entry above. The detail below is T1's original record, kept as-is.

T1 done, committed as `031a692` on `fix/quartzplay-app-typeface`
(branched off `staging`). Checks run and observed:

- Baseline: `CI=true npx react-scripts test --watchAll=false` (from
  `app/frontend`) — 28 suites, 412 tests, all passed.
- Guard test written first
  (`frontend/src/appTypeface.test.js`), run against the pre-fix source
  (verified via `git stash` on `App.jsx`) and observed RED: 2 of 3 tests
  failed (`does not hardcode the Inter/system-ui font-family string` and
  `does not hardcode 'Inter' as a font-family anywhere, in any shape`);
  only the positive-control test passed.
- After the fix: guard suite GREEN, 3/3 passed.
- Full suite after the fix: `CI=true npx react-scripts test
  --watchAll=false` — 29 suites, 416 tests, all passed (412 baseline + 3
  new tests + 1 dynamic `testsStayInRepo.test.js` entry for the new test
  file itself).
- `git diff --stat frontend/src/App.jsx`: 376 insertions / 376 deletions.
  Verified programmatically that every changed line differs from its
  removed counterpart solely by
  `fontFamily:"'Inter',system-ui"` → `fontFamily:F_BODY` — 0 mismatches.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021
  --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true}
  --rule '{"no-undef":"error"}'` — exit 0, no output.
- Production build with staging-shaped `REACT_APP_*` placeholder values
  (own fixture, not `config.test.js`'s): succeeded both before and after
  the fix. Bundle size (gzip, `main.*.js`): 284.77 kB before →
  284.51 kB after (−274 B; `F_BODY` is a shorter token than the repeated
  literal).
- `gentle-ai review assess --cwd . --agent claude-code --base-ref staging
  --committed-only --json` on commit `031a692`: `risk: "medium"`,
  `review_due: true`, `review_due_reason: "slice_budget_reached"`.
  Returned `next_transition.command` (not run — consent belongs to the
  repository owner):
  `gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true`

Not done: pushing, opening a PR, merging, and running the review status
command above — all left for the repository owner.

## What the audit of the other screens found

Counting `fontFamily` occurrences is not the same as reading their value, and
the first pass through this made that mistake. The corrected map:

| Route | File | Role | State |
|---|---|---|---|
| Telegram (default) | `App.jsx` | Player | fixed, T1 |
| `/sitio` | `Web.jsx` | Player | already correct, 227 `F_BODY` + 41 `F_NUM` |
| `/casino` | `Casino.jsx` | Player | already correct |
| `/box` | `Box.jsx` | Cashier | fixed, T2 |
| `/agencia` | `Agencia.jsx` | Agency | fixed, T3 |
| `/admin` | `Admin.jsx` | Admin | fixed, T3 |

`'Space Grotesk'` was served nowhere: it appeared only as a literal inside
those two files, in no `@font-face` rule and no font file in the repository.
The admin and agency panels therefore never rendered in it — they fell back
to `system-ui` exactly as the player screens did.

The product decision — admin and agency adopt Poppins, rather than actually
shipping Space Grotesk as a font file — was made by the owner on 2026-09-20
and executed as T3. The guard test now covers both files and rejects the
`'Space Grotesk'` and `'Inter'` literals on all six clean screens, so the
defect cannot reappear.

## Next step

Nothing pending on this branch. Open for the owner: the review consent for
this branch (see T3's `gentle-ai review assess` outcome above).
