# Drawn icons for the player, starting with the message contract

## Objective

The player's screens stop drawing meaning with emoji, which every operating
system renders differently and which carry none of the brand's colours.
This first step removes the obstacle that would make the swap dangerous.

## The obstacle

In 35 places across the product, an emoji is not decoration — it is the data.
The pattern:

```jsx
<div style={{color: msg.startsWith("✅") ? Q.green : Q.red, ...}}>{msg}</div>
```

The code decides a message's colour by reading the first character of the
string. Anything not starting with `✅` renders red.

This is not broken today. Every message that reaches those components either
carries the `✅` prefix on success or is a validation error, for which red is
correct. It works by coincidence of convention, not by design, and nothing
tests it.

It becomes broken the moment the migration replaces the glyph with an icon:
**every message in those components turns red**, including successful
payments and accepted bets. In `Agencia.jsx` and `Admin.jsx` — 30 of the 35
sites — that means an agency is told a successful transaction failed.

So the status has to stop living in the text before any glyph moves.

## Scope

Authorized: `frontend/src/App.jsx` and a test file.

`App.jsx` is the Telegram mini-app: the player, and the most-looked-at screen
in the product. Two of its components sniff the prefix — `CrearDesafio`
(line 4538) and `PanelIacoin` (line 4884).

Out of scope, each its own slice: `Web.jsx` (3 sites), `Agencia.jsx` (13),
`Admin.jsx` (17), and the emoji-to-icon replacement itself. This change moves
no glyph.

## Constraints

- **Nothing visible changes.** The same messages, with the same text including
  their emoji prefix, in the same colours. This is a change of where the
  status comes from, not of what the player reads.
- Do not introduce a state library, a context, or a shared module for this.
  The two components hold their message in local state; the fix belongs there.
- Do not touch the components that do not sniff.
- Leave the emoji in the message text alone. Removing them is the next slice,
  and it is only safe once this one has landed.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Record the baseline first.
- A test that fails on the sniffing pattern, so it cannot return.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with the staging-shaped placeholder values.

## Acceptance

No component in `App.jsx` decides a colour by reading a message's first
character. The player sees exactly what they saw before.

## Tasks

- [x] **T1** Give the two components' messages their own status, and guard the
      pattern against returning. Commit `bd93e09` on
      `fix/quartzplay-message-status`.

  **Baseline** (`CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`, before any change): 29 suites passed, 437 tests passed.

  **`setMsg` inventory** (read both components in full, not just the render
  sites):
  - `CrearDesafio` (App.jsx:4467-4655): 6 `setMsg` calls — `crear()` sets
    `""` to clear, then `"✅ "+(d.aviso||"Listo")` on success or
    `"⚠️ "+e.message` on failure; `aceptarExistente()` sets `""` to clear,
    then `"✅ "+(d.aviso||"Aceptado")` on success or `"⚠️ "+e.message` on
    failure. Every content-carrying call already prefixed `✅` or `⚠️`; no
    non-conforming site found.
  - `PanelIacoin` (App.jsx:4811-4965): 4 `setMsg` calls — `operar()` sets
    `""` to clear, then a `✅ Compraste…` / `✅ Vendiste…` message on
    success or `"⚠️ "+e.message` on failure; the Comprar/Vender mode
    button sets `""` to clear. Every content-carrying call already
    prefixed `✅` or `⚠️`; no non-conforming site found.
  - No finding to report: both components' fallback-to-red was correct
    today, as the feature document already stated.

  **Shape chosen**: one piece of state holding both, `const [msg,
  setMsg] = useState(null)` where `msg` is `{text, ok} | null` (was a
  bare string). Chosen over a second `msgOk` boolean because `msg &&
  <div>` / `setMsg(null)` reads the same as the original empty-string
  guard, and there is exactly one state variable to keep in sync per
  component — no risk of the text and status updating out of step.
  Render now reads `msg.ok ? Q.green : Q.red` and `{msg.text}` instead of
  `msg.startsWith("✅")` and `{msg}`.

  **Guard test**: `frontend/src/messageStatusNotSniffed.test.js`, modelled
  on `appTypeface.test.js` / `noThemeSwitch.test.js` (reads `App.jsx` from
  disk, no testing-library). Asserts no `.startsWith("✅")` and, more
  broadly, no `.startsWith` on either status glyph anywhere in the file —
  covers the pattern reappearing in a different syntactic shape (bare JSX
  prop, single quotes), not just the exact style-object literal fixed
  here. Also asserts the `✅`/`⚠️` prefixes are still present in the
  message text, since this change does not touch them.

  Run against the **pre-fix** source: 2 of 4 tests failed —
  `does not call .startsWith("✅") anywhere` and `does not call
  .startsWith on either status glyph anywhere` — matching the two sites
  at `App.jsx:4538` and `App.jsx:4884`. The positive-control test and the
  "emoji still present" test passed, confirming the guard's assertions
  were exercised, not vacuous.

  **Player-visible before/after** (text and colour, per `setMsg` call
  site touched):

  | Component | Call site | Text before | Text after | Colour before | Colour after |
  |---|---|---|---|---|---|
  | CrearDesafio | `crear()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearDesafio | `crear()` success | `"✅ "+(d.aviso\|\|"Listo")` | same | green | green |
  | CrearDesafio | `crear()` catch | `"⚠️ "+e.message` | same | red | red |
  | CrearDesafio | `aceptarExistente()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearDesafio | `aceptarExistente()` success | `"✅ "+(d.aviso\|\|"Aceptado")` | same | green | green |
  | CrearDesafio | `aceptarExistente()` catch | `"⚠️ "+e.message` | same | red | red |
  | PanelIacoin | `operar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | PanelIacoin | `operar()` success (comprar) | `` `✅ Compraste ${n} IACOIN por ${d.pagaste.toLocaleString("es-AR")}` `` | same | green | green |
  | PanelIacoin | `operar()` success (vender) | `` `✅ Vendiste ${n} IACOIN por ${d.recibiste.toLocaleString("es-AR")}` `` | same | green | green |
  | PanelIacoin | `operar()` catch | `"⚠️ "+e.message` | same | red | red |
  | PanelIacoin | mode-switch button clear | `""` (no render) | `null` (no render) | n/a | n/a |

  No text or colour differs. Confirmed by diffing `App.jsx`: only the
  `useState` initial value, the object shape passed to `setMsg`, and the
  two render sites (`msg.startsWith("✅")` → `msg.ok`, `{msg}` →
  `{msg.text}`) changed.

  **Checks, exact observed results:**
  - `CI=true npx react-scripts test --watchAll=false` (guard test only,
    pre-fix): 1 suite, 2 failed / 2 passed of 4 tests — confirms the
    guard fails on the sniffing pattern.
  - `CI=true npx react-scripts test --watchAll=false` (guard test only,
    post-fix): 1 suite passed, 4/4 tests passed.
  - `CI=true npx react-scripts test --watchAll=false` (full suite,
    post-fix): 30 suites passed, 442 tests passed. Delta from baseline
    (29/437) is exactly the new file's own 4 tests plus one more
    `test.each` entry in `testsStayInRepo.test.js`, which enumerates
    `*.test.js` files and gained one.
  - `npx eslint App.jsx --no-eslintrc --env browser,es2021
    --parser-options
    ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
    '{"no-undef":"error"}'`: no output, exit clean — no `no-undef`
    violations.
  - Production build with the staging-shaped placeholder values
    (`CI=true REACT_APP_ENV=staging REACT_APP_API_URL=…
    npx react-scripts build`): `Compiled successfully.`,
    `283.04 kB (+31 B) build/static/js/main.f59cfc3d.js`.
  - Post-fix scan for the *concept*, not just the pattern edited:
    `rg -n 'startsWith\(\s*["'"'"'](✅|⚠️)["'"'"']\s*\)' App.jsx` — no
    output (positive control: plain `rg -c "startsWith" App.jsx` reports
    5, all unrelated — market-key matching at lines 400-401, a Sportradar
    event-id prefix check at 605, and Telegram start-param prefix checks
    at 6552-6553 — none is a colour decision).

  **Review assess**, run after the commit:
  `gentle-ai review assess --cwd . --agent claude-code --base-ref staging
  --committed-only --json` → `risk: "medium"` (reason:
  `executable_change` on `frontend/src/App.jsx`), `changed_paths: 3`,
  `changed_lines: 173`, `review_due: false`,
  `review_due_reason: "under_budget"`. No `next_transition` returned;
  nothing further run.

## Delivery

One work-unit commit on `fix/quartzplay-message-status`, off `staging`. After
the commit, run `gentle-ai review assess --cwd . --agent claude-code
--base-ref staging --committed-only --json` and report the outcome. If review
is due, hand the returned command back verbatim rather than running it.

## Progress

T1 done (commit `bd93e09`). Baseline recorded, full suite green
(30/442), guard test proven to fail before the fix and pass after,
ESLint clean, staging-shaped production build clean, review assess
under budget so no review was due.

## Next step

The same fix in `Web.jsx` (3 sites), then `Agencia.jsx` (13), then
`Admin.jsx` (17) — each its own slice — before any emoji-to-icon glyph
move.
