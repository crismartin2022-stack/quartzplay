# Dark only

## Objective

The product has one theme. The switch that offered a light one is gone, and so
is the light palette behind it.

## Problem

The brand's own logo is drawn in near-white with a faint outline: it was made
for a dark surface. On the light theme's white surfaces the wordmark is
effectively invisible, and no CSS can repair a raster without inverting its
green accents too. Keeping a theme whose logo cannot be read is worse than not
offering it.

The light palette also costs on every change: every colour decision has to be
made twice, and the contrast suite guards a theme nobody would see.

## Why now

The product owner decided it. The logo landed in the previous change, and the
light theme is the one place it does not work.

## Scope

Authorized: `frontend/src` in the `app` repository.

- The theme switch disappears from the three screens that offer it.
- The product renders dark regardless of what a browser has stored.
- The light palette and the light half of the contrast suite go with it.

Out of scope: the accents themselves, the ink helper's shape, the 378
hardcoded `'Inter'` declarations in `App.jsx`, the emoji migration, and the
type and spacing scale.

## Constraints

- A player who chose light will see dark on their next visit. That is the
  intent; it is still a visible change for them and must not error.
- Nothing else in the touched files changes: no layout, no reordering.
- `ov()` currently answers differently per theme. With one theme it has one
  answer; collapse it rather than leaving a branch that can never be taken.
- Leave no unreachable theme code behind. Dead colour values are how a palette
  drifts back into the product.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`.
- `npx eslint <touched files> --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with staging-shaped `REACT_APP_*` values.

## Acceptance

No screen offers a theme switch. Nothing reads a stored theme preference. The
theme module exports one palette. The suite is green and says why the light
half is gone.

## Tasks

- [x] **T1** Remove the switch from `Web.jsx`, `App.jsx` and `Box.jsx`, force
      dark, and collapse `ov()`. A test that no screen renders a theme control
      and none reads a stored preference.
      Commit: `4b4840f` — feat(frontend): remove theme switch, render dark
      unconditionally.
      `aplicarTema()` keeps its one real job (painting `document.body` to
      `Q.void`) but drops its name argument and its `qp_tema` write — nothing
      reads that key anymore, so nothing should keep writing it either. A
      visitor who previously stored `"claro"` simply renders dark next visit;
      the stale key is left untouched in their browser (never read, never an
      error) rather than actively purged, since purging it needs no new
      machinery this task doesn't already have reason to add. `Q` is now
      `oscuro` imported directly (`oscuro as Q`) instead of a mutable
      reassignable binding. `ov()` collapses to its one answer
      (`rgba(255,255,255,${a})`). `BotonTema` and the `tema`/`onTema` wiring
      (including `BarraSuperior`'s props in `App.jsx` and the now-empty
      button wrapper `div` in `Box.jsx`) are deleted.
      Test: `frontend/src/noThemeSwitch.test.js`, scanning all three screens.
      Review: `gentle-ai review assess --base-ref staging --committed-only`
      → risk `medium` (executable_change in `App.jsx`), 247 changed lines,
      `review_due: false`, reason `under_budget`. No consent envelope raised;
      boundary advances to `4b4840f`.
- [ ] **T2** Remove the light palette from `theme.js` and the light half of the
      contrast suite, keeping every assertion that still has a subject.

## Delivery

One work-unit commit per task. **Review each commit as it lands**, with
`gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed
boundary> --committed-only --json`, and follow its `next_transition` when
`review_due` is true. Do not let the branch accumulate unreviewed commits: a
whole branch does not fit the reviewer's context budget, which is how the last
change ended with a failed review at the end.

## Progress

T1 done and committed (`4b4840f`), reviewed under budget, no consent needed.
T2 not started.

## Next step

T2.
