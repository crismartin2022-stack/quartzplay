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
- [x] **T2** Remove the light palette from `theme.js` and the light half of the
      contrast suite, keeping every assertion that still has a subject.
      Commit: `465fc7d` — feat(theme): remove the light palette.
      `theme.js` now exports one palette: `oscuro`. `claro` and the
      `THEMES = { oscuro, claro }` lookup are deleted; nothing else imported
      `THEMES` (the three screens already take `oscuro` directly after T1,
      and `Admin.jsx`/`Agencia.jsx`/`Casino.jsx` already did). The header
      comment and the `inkOn` comment block are rewritten to stop describing
      a light column that no longer exists, without touching `inkOn`'s shape
      or behaviour.
      `inkOn`: kept working and kept tested, one theme to sweep instead of
      two. Recomputed against the surviving palette: every current accent
      resolves to `INK_DARK` (worst pair 5.75:1 on violet/blue, best
      14.91:1 on lime) — `INK_LIGHT` is unused by today's single theme, not
      unreachable code; the per-accent "better of the two inks" comparison
      still runs and is still asserted for every accent, and the constant
      stays exported and tested for the day a second, differently-toned
      surface needs it.
      Vacuous-after-removal tests deleted from `theme.test.js` (had no
      subject once `claro`/`THEMES` are gone, not just no data):
        - "light theme carries exactly the mapped value for every key"
        - "neither theme is missing a key the other has"
        - "THEMES exposes both themes under their existing names"
        - "the bright accent (goldBg) never darkens for a theme, unlike
          gold/green" (a claim about *not moving between two themes*, with
          only one theme left to not move between)
      Everything else collapsed from `describe.each(["dark","light"])` /
      `[oscuro, claro].forEach` to the single `oscuro` case, same
      assertions, one theme. Added one new test pinning the module's export
      shape (`oscuro`, `inkOn`, `INK_DARK`, `INK_LIGHT`, `F_NUM`, `F_BODY`
      only) so a `claro`/`THEMES` reintroduction fails the suite.
      Review: `gentle-ai review assess --base-ref 8b7a362 --committed-only`
      → risk `medium` (executable_change in `theme.js`), 270 changed lines,
      `review_due: false`, reason `under_budget`. No consent envelope
      raised; boundary advances to `465fc7d`.

## Delivery

One work-unit commit per task. **Review each commit as it lands**, with
`gentle-ai review assess --cwd . --agent claude-code --base-ref <last reviewed
boundary> --committed-only --json`, and follow its `next_transition` when
`review_due` is true. Do not let the branch accumulate unreviewed commits: a
whole branch does not fit the reviewer's context budget, which is how the last
change ended with a failed review at the end.

## Progress

Both tasks done and committed. T1: `4b4840f` (code) + `8b7a362` (doc
update). T2: `465fc7d`. Both reviewed under budget, no consent envelope
raised on either. Full suite green: 384 passing (392 baseline + 31 new in
`noThemeSwitch.test.js`, minus 39 light-theme tests `theme.test.js` no
longer runs). ESLint clean on every touched source file. Production build
succeeds with staging-shaped `REACT_APP_*` values (bundle 1.66 kB smaller).
Not pushed; no PR opened.

## Next step

None — both tasks are done. Awaiting human review/merge decision.
