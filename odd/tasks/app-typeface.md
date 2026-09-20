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

- [ ] **T1** Write the guard test (RED), then replace every hardcoded
      `'Inter',system-ui` in `App.jsx` with `F_BODY` (GREEN).

## Delivery

One work-unit commit. Branch `fix/quartzplay-app-typeface` off `staging`.
After the commit, run
`gentle-ai review assess --cwd . --agent claude-code --base-ref staging --committed-only --json`
and report `review_due`/`review_due_reason`/`risk`. If review is due, hand the
returned `next_transition.command` back verbatim — do not run it.

## Progress

Not started.

## Next step

T1.
