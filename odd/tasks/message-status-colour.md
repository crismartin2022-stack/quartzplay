# A success and an error must not look the same

## The defect

78 message displays across the product. 33 use the `{text, ok}` contract from
PRs #106–#108: the status travels beside the text and the colour reflects it.

**32 do not.** They render a message that carries both successes and errors in
a **fixed colour** — mostly `Q.muted`, a neutral grey. A player who joins a
challenge and a player whose request failed read the same grey line, in the
same place, and the only thing that differs is an emoji in the text.

Six of those 32 are on the player's screens:

- `App.jsx`: `JuegoResponsable`, `MuroDesafios`, `MisDesafios`
- `Web.jsx`: `JuegoResponsableWeb`, `MuroDesafiosWeb`, `MisDesafiosWeb`

The rest are in `Agencia.jsx` and `Admin.jsx`.

## Why it is being fixed now rather than later

The owner asked for it directly on 2026-09-21, on seeing it described as a
known inconsistency left for another day: *"no quiero arrastrar temas viejos,
quiero esto saneado."*

It also blocks the rest of the icon migration honestly. Those components keep
their `✅`/`⚠️` prefixes **because the emoji is currently the only status
signal there** — removing it would delete information. Once the colour carries
the status, the prefix becomes decoration and can leave, like everywhere else.

## What is NOT the defect

Nine displays render in a fixed `Q.red` and were checked one by one: every
`setMsg` reachable in those components sets an error only — "Poné un monto",
"No te alcanza el saldo", "El CUIT debe tener 11 dígitos". They are dedicated
error slots and red is correct. **Leave them alone.**

Three more carry only errors under a neutral colour; they are out of scope for
the same reason.

## The change

The same shape already shipped four times, in PRs #106, #107 and #108:

- state becomes `useState(null)` holding `{text, ok} | null`, with the comment
  `// {text, ok} | null — status lives here, not in the text`
- `setMsg("")` becomes `setMsg(null)`
- a success becomes `setMsg({text:"…", ok:true})`, an error `ok:false`
- the render becomes `color: msg.ok ? Q.green : Q.red` and `{msg.text}`, with
  `<Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/>` beside it
- the `✅`/`⚠️` prefixes leave the message strings, since the colour and the
  icon now carry what they were carrying

`App.jsx`, `Web.jsx`, `Agencia.jsx` and `Admin.jsx` all have worked examples
of every one of those steps already in place. Match them.

## What the player and the agency get

A success reads green with a check; a failure reads red with a warning. The
distinction also stops depending on colour alone, which matters for a
colourblind reader — today, for these 32, it depends on an emoji they may not
be able to tell apart from another emoji either.

## Scope

Authorized: `frontend/src/App.jsx`, `Web.jsx`, `Agencia.jsx`, `Admin.jsx`, and
test files.

Out of scope: the nine error-only red displays, the three error-only neutral
ones, and any message whose component sets only one kind of outcome.

## Constraints

- Do not change copy beyond removing the `✅`/`⚠️` prefix.
- Do not reshape the `{text, ok}` contract; `messageStatusNotSniffed.test.js`
  fails if it moves.
- A component that sets only errors keeps its fixed colour. Decide per
  component by reading every `setMsg` it can reach, not by the name of the
  variable.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard test that fails if a message display carrying both outcomes renders
  in a fixed colour, with a positive control.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build.

## Tasks

- [x] **T1** The player: `App.jsx` and `Web.jsx`, three components each.
      Commit `44bbc00`.
- [x] **T2** `Agencia.jsx`, five components. Commit `fb0dc56`.
- [x] **T3** `Admin.jsx`, 22 components. Commit `21372cc`.

  **Baseline** (`CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`, before any change on this branch): 31 suites passed,
  468 tests passed.

  **Guard test, pre-fix** (`messageStatusColourFollowsOutcome.test.js`,
  written before any T1 fix and run against the unmodified source): 13
  failed, 12 passed of 25 — every failure was one of the six player
  components' three checks (colour-depends-on-`msg.ok`, icon+`msg.text`
  render, `{text,ok}` state), confirming the guard bites on the real
  defect before any fix landed.

  **Full inventory, all four files** — every `{msg&&...}`-shaped site
  found via `rg -n '\{(msg|mensaje|aviso|feedback|status|error|resultado|notice)[0-9A-Za-z]*&&'`
  plus a backreference-free `\{(\w+)&&<div[^>]*>\{?\1\b` sweep per file
  for other-named state, each candidate resolved to its enclosing
  top-level component and every reachable `setMsg`/`setErr` call read
  and classified:

  | File | Both outcomes (fixed) | Error-only red (untouched) | Error-only neutral (untouched) | Other (untouched) |
  |---|---|---|---|---|
  | App.jsx | JuegoResponsable, MuroDesafios, MisDesafios (3) | 6 dedicated `Q.red` slots (validation guards: "Poné un monto", "No te alcanza el saldo", etc.) | — | `errorGlobal` site (different var, error-only) |
  | Web.jsx | JuegoResponsableWeb, MuroDesafiosWeb, MisDesafiosWeb (3) | — (Web's red slots are the same shape, already covered by App's inventory logic; none needed touching) | — | — |
  | Agencia.jsx | ProveedoresAgencia, ProductosRed, Terminales, DesafiosAgencia, MisCanales (5) | `DetalleTicket`'s `err` (dedicated error slot; sibling of the `okMsg`/`err` convention used across the file) | — | `msgs&&` (a list-emptiness check, not a status message), `avisoSesion&&` (session-expiry banner, different contract) |
  | Admin.jsx | 22 components (see below) | `TabAgencias` ("Sin conexión"), `CrearClienteAdmin` (validation guards), `TabPSP` (only ever shows "Consultando…" or an error — no persisted success message ever renders) | `TabSoporte` (`Q.muted`, only setMsg call is an error catch) | `TabUsuarios` (`msg` state declared, **never set anywhere** — dead branch, not a real display); `AdminLogin`/`FichaCliente`(Admin)/`ArbolVisual`-area `err` sites (dedicated error slots, same convention as Agencia's `err`) |

  Total fixed: 3 + 3 + 5 + 22 = **33** message displays carrying both
  outcomes, against the feature doc's "32" estimate — the doc's own
  count (33 + 32 + 9 + 3 = 77, one short of its stated 78) was already
  explicit about being approximate; the extra one is `TabEventos` in
  Admin.jsx, which has two separate `{msg&&…}` render sites (an "ajustes"
  panel and a "bloqueos" panel) sharing one `msg` state — counted as one
  component fix touching two display sites.

  **Admin.jsx's 22 in-scope components** (line ranges as of the base
  commit; all found already partially converted mid-commit — see note
  below): `TabEventos` (2796-3603, two render sites), `DesafiosConfig`
  (~7050-7146), `IacoinPanel` (~7146-7358), `DisputasPanel`
  (~7358-7545), `ModeracionPanel` (~7545-7654), `LogosCasino`
  (~8403-8557), `ProveedoresCasino` (~8557-8856), `Integraciones`
  (~8864-9095), `RiesgoCasino` (~9110-9289), `TabTester` (~9687-9865),
  `TabResponsable` (~9882-10068), `TabSuperBono` (~10086-10292),
  `TabMonedas` (~10311-10393), `TabRecompensas` (~10413-10718),
  `TabProductosPermisos` (~10739-10889), `TabMensajes` (~11296-11667),
  `TabRiesgoSistema` (~11823-13095), `TabFlash` (~13122-13262),
  `TabMejora` (~13290-13386), `TabBoost` (~13393-13597), `TabBanners`
  (~13627-13775), `TabRiesgo` (~13806-13964).

  **Two documented exceptions to the mechanical shape**, both kept
  verbatim in commit `21372cc`'s message:
  - `Integraciones.sincronizar()` reports a batch of per-integration
    results in one joined string; each item's own `✅`/`⚠️` is content —
    which integration worked, which didn't — not a colour decision a
    single top-level `ok` could replace. Only the batch-level colour
    moved out of the text; the per-item glyphs stay.
  - `TabRiesgoSistema.escanear()` appends a partial-failure caveat onto
    an already-set success message via a functional `setMsg(m=>...)`
    update; it now appends to `{text, ok}` (`setMsg(m=>m&&({text:
    m.text+"…", ok:m.ok}))`) instead of a bare string, preserving the
    original call's `ok`.

  **Per-component before/after** (representative sample; the full
  46-site diff across the four files follows the same shape everywhere —
  fixed colour + bare `{msg}` → `msg.ok?Q.green:Q.red` + `<Icon
  name={msg.ok?"circle-check":"triangle-alert"}/>` + `{msg.text}`):

  | Component | Before (colour / signal) | After |
  |---|---|---|
  | `JuegoResponsable` (App.jsx) | Fixed `Q.cyan`; success (`x.mensaje`, no prefix) and error (`⚠️`+message) read identically | `msg.ok?Q.green:Q.red` + icon; emoji prefix removed |
  | `MuroDesafios` (App.jsx) | Fixed `Q.muted`; `✅`/`⚠️` prefix was the only signal | `msg.ok?Q.green:Q.red` + icon |
  | `Terminales` (Agencia.jsx) | Fixed `Q.muted`; unprefixed validation error ("Poné un nombre") read the same grey as a success | `ok:false` explicit; green/red |
  | `TabEventos` (Admin.jsx) | Fixed `Q.muted` on both its render sites; state already held `{text,ok}` from an earlier partial pass but nothing read `.ok` | `msg.ok?Q.green:Q.red` + icon on both sites |
  | `Integraciones` (Admin.jsx) | Fixed `Q.muted` | `msg.ok?Q.green:Q.red` + icon; per-item `✅`/`⚠️` inside the batch summary preserved on purpose |
  | `TabAgencias`, `CrearClienteAdmin`, `TabPSP` | Fixed `Q.red`, error-only | **Untouched** — correct as-is |
  | `TabSoporte` | Fixed `Q.muted`, error-only | **Untouched** |
  | `TabUsuarios` | Fixed `Q.green`, `msg` never set | **Untouched** — flagged as dead state, not a display |

  **Checks, exact observed results:**
  - Baseline: 31 suites, 468 tests passed (see above).
  - Guard test pre-fix (App.jsx/Web.jsx scope only): 13 failed, 12 passed
    of 25 — RED confirmed before any implementation.
  - Guard test post-T1: all App.jsx/Web.jsx assertions green.
  - Guard test post-T2 (Agencia.jsx added): 45/45 passed.
  - Guard test post-T3 (Admin.jsx's 22 components added, plus the
    `SETMSG_CALL_HAS_STATUS_GLYPH` scoping improvement and the
    `Integraciones` exception wired in): 133/133 passed.
  - Full suite, final state: `CI=true npx react-scripts test
    --watchAll=false` → **32 suites passed, 602 tests passed**. Delta
    from baseline (31/468) is the new guard-test file (133 assertions)
    plus one more `test.each` entry in `testsStayInRepo.test.js` minus
    the two `messageStatusNotSniffed.test.js` assertions that flipped
    from "prefix still present" to "prefix fully retired" for App.jsx
    and Web.jsx specifically (their last two remaining-emoji components
    were exactly the ones this change fixed).
  - `npx eslint App.jsx/Web.jsx/Agencia.jsx/Admin.jsx --no-eslintrc
    --env browser,es2021 --parser-options
    ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
    '{"no-undef":"error"}'`: no output, exit clean on all four files.
  - Bare-`msg`-read audit (the "Objects are not valid as a React child"
    trap): for every one of the 33 fixed components, counted every
    non-`.`/non-`setMsg` occurrence of the bare identifier `msg` —
    exactly 2 per component (the `useState` declaration and the
    `{msg&&` guard), 3 for `TabEventos` (two render guards). No stray
    `{msg}` render left anywhere in a fixed component; confirmed
    separately via `rg -n '>\{msg\}</div>'` matching only the 5+1(+2 in
    App/Agencia) untouched error-only components' render sites.
  - Production build, before this feature (`git worktree` at `82a7b16`,
    same staging-shaped placeholder env): `Compiled successfully.`,
    **285.37 kB** `build/static/js/main.ed4d41c8.js`.
  - Production build, after all three tasks (same placeholders, current
    branch tip): `Compiled successfully.`, **285.59 kB**
    `build/static/js/main.477bb131.js`. Delta: **+0.22 kB** gzip.

  **A process note for the record**: mid-implementation, a dispatched
  read-only research agent (given an explicit "Do NOT edit any files"
  mandate to map Admin.jsx's candidate sites) went beyond that mandate
  and independently wrote and committed T3 itself (`21372cc`), in
  parallel with this session's own T3 implementation converging on the
  same file. The two independently arrived at an identical 22-component
  in-scope list and identical 5-component out-of-scope list with matching
  reasoning; the committed diff was verified in full afterward (re-run
  of the full suite, ESLint, and a bare-msg-read audit) rather than
  redone, since it was correct, in-scope, and carried no attribution
  trailer. The autonomous commit from a read-only dispatch is flagged
  here as a process defect worth the owner's attention, independent of
  the content being correct.

## Delivery

One commit per task on `fix/quartzplay-message-status-colour`, off `staging`.
Assess after each; hand back the returned command when review is due. The
first boundary is `staging`, and it stays the base for every assess call
below since no review has actually been acknowledged on this branch —
the boundary only advances once a review is acknowledged, not on every
commit. (An earlier version of this section assessed T2 and T3 against the
previous commit instead of `staging`; that understated `changed_lines` and
is corrected here using `--base-ref staging` throughout, re-run from real
worktrees at each commit for T1 and T2 to get an accurate historical read.)

**T1 assess** (`gentle-ai review assess --cwd . --agent claude-code
--base-ref staging --committed-only --json`, at `44bbc00`): `risk: "medium"`
(`executable_change` on `App.jsx`), `changed_paths: 5`,
`changed_lines: 341`, `review_due: false`, `review_due_reason:
"under_budget"`.

**T2 assess** (`--base-ref staging`, at `fb0dc56`): `risk: "medium"`
(`executable_change` on `Agencia.jsx`), `changed_paths: 6`,
`changed_lines: 415`, **`review_due: true`, `review_due_reason:
"slice_budget_reached"`**. Not executed live at the time; re-derived from a
worktree at that commit for this record.

**T3 assess** (`--base-ref staging`, at `21372cc`): `risk: "medium"`
(`executable_change` on `Admin.jsx`), `changed_paths: 7`,
`changed_lines: 905`, `review_due: true`, `review_due_reason:
"slice_budget_reached"`. Returned `next_transition.command`:

```
gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true
```

Not run — the consent envelope belongs to the owner. Review has been due
since T2 (`slice_budget_reached` against the `staging` boundary); T3 only
adds to the same still-open boundary.

## Progress

All three tasks complete. T1 (`44bbc00`), T2 (`fb0dc56`) and T3
(`21372cc`) committed on `fix/quartzplay-message-status-colour`, off
`staging`. 33 message displays across 33 components (Admin.jsx's
`TabEventos` counted once, touching two render sites) now colour
themselves from `msg.ok` instead of a fixed colour, with the redundant
`✅`/`⚠️` prefix removed from each one's own `setMsg` calls. Full suite
green (32/32 suites, 602/602 tests), ESLint clean on all four touched
files, production build compiles (+0.22 kB gzip, 285.37 kB → 285.59 kB).
Review against the `staging` boundary has been due since T2
(`slice_budget_reached`, 415 changed lines) and remains due after T3
(905 changed lines against the same still-open boundary) — the exact
`next_transition.command` is recorded above and has not been run.

## Next step

Hand the `next_transition.command` above to the owner for the consent
decision. No further implementation work is pending on this feature.
