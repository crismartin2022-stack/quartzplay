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

- [x] **T2** The same fix on `/sitio`. Commit pending in this branch.
      `PerfilWeb`, `CrearDesafioWeb` and `PanelIacoinWeb` in `Web.jsx`, 25
      lines across 15 `setMsg` sites and 3 renders. Two of them —
      `PerfilWeb`'s "La clave nueva tiene que tener al menos 6 caracteres"
      and "Las dos claves nuevas no coinciden" — carried no prefix and so
      rendered red by falling through; they now say `ok:false` explicitly,
      which is the colour they already had. The other three components in
      `Web.jsx` that hold a `msg` (lines 1442, 3355, 3840) never sniffed and
      were left untouched. Guard extended to run over `App.jsx` and
      `Web.jsx`; proven to bite by restoring the pre-fix `Web.jsx` and
      observing `3 failed, 6 passed`. Suite 442 -> **447 passed**. ESLint
      clean. Build `Compiled successfully`, 283.09 kB.

- [x] **T3** The same fix on `/agencia` — 13 sniffing sites, the first of the
      two money screens. Commit `369578a` on
      `fix/quartzplay-agency-message-status`.

  **Baseline** (`CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`, before any change): 30 suites passed, 447 tests passed
  — matches T2's ending state exactly (branch created off `staging`
  after T2 merged).

  **Component inventory** (13 sniffing sites, one per component, found via
  `rg -n '\.startsWith\(\s*["'"'"'](✅|⚠️)["'"'"']\s*\)' src/Agencia.jsx`
  then mapped to the nearest enclosing `function` above each match; no
  other status-glyph sniff shape — `charAt(0)`, `[0]===`, `indexOf`,
  `includes` — exists anywhere in the file):

  | Component | Line range | State var | `setMsg` calls | Unprefixed content |
  |---|---|---|---|---|
  | `CrearComboAgencia` | 2362-2618 | `msg` | 3 | none |
  | `OtorgarBonoCliente` | 3301-3376 | `msg` | 6 | `"Elegí un bono"` |
  | `FichaCliente` | 3378-3700 | `msg` | 6 | `"🔒 Cliente bloqueado"` |
  | `TicketHistorial` | 3883-4080 | `msg` | 6 | none |
  | `CambiarMiPassword` | 6716-6763 | `msg` | 5 | `"La contraseña debe tener 8+ caracteres"`, `"Las contraseñas no coinciden"` |
  | `CrearInfluencerAgencia` | 7279-7338 | `msg` | 5 | `"Completá nombre, usuario y clave"`, `"La clave debe tener 8+ caracteres"` |
  | `DetalleInfluencerAgencia` | 7340-7457 | `msg` | 3 | none |
  | `ConfigurarCuentaAg` | 7459-7578 | `msg` | 3 | none |
  | `ResetPassword` | 7580-7636 | `msg` | 5 | `"La contraseña debe tener 8+ caracteres"`, `"Las contraseñas no coinciden"` |
  | `MisAgencias` | 7638-7769 | `msg` | 4 | none |
  | `CrearSubAgencia` | 7771-7839 | `msg` | 5 | `"Completá nombre, usuario y clave"`, `"La clave debe tener 8+ caracteres"` |
  | `CargarCreditoSub` | 7841-7900 | `msg` | 4 | `"Ingresá un monto"` |
  | `CrearComboInfluencer` | 8877-9063 | `msg` | 4 | `"Elegí al menos un partido"` |

  59 `setMsg` calls total. No component used `setMensaje`, `setAviso` or
  `setLiqMsg` for a sniffing message; every sniffing site used the local
  variable `msg`. Other components in the file (`Clientes`, `AltaCliente`,
  `SoporteAgencia`, `ProveedoresAgencia`, `ProductosRed`, `Terminales`,
  `DesafiosAgencia`, `MisCanales` and others) also hold local state called
  `msg` but never sniff it — left untouched, confirmed by the guard test's
  post-fix scan below still finding zero sniff sites (would have risen
  above 13 if a wrong component had been touched, or the untouched
  components had somehow started sniffing).

  **12 unprefixed messages found** — the ones needing a colour decision
  rather than a copied prefix, all validation/guard messages except one:

  | Component | Message | Colour given | Reasoning |
  |---|---|---|---|
  | `OtorgarBonoCliente` | `"Elegí un bono"` | red (`ok:false`) | Validation guard; fell through to red today. |
  | `FichaCliente` | `"🔒 Cliente bloqueado"` | red (`ok:false`) | The one non-validation case: a **successful** block action, but it carries no `✅` and fell through to red today (its sibling branch, `"✅ Cliente desbloqueado"`, is green). Preserving today's colour means preserving this asymmetry — fixing it is out of scope for a change that must not alter what the agency sees. |
  | `CambiarMiPassword` | `"La contraseña debe tener 8+ caracteres"` | red (`ok:false`) | Validation guard. |
  | `CambiarMiPassword` | `"Las contraseñas no coinciden"` | red (`ok:false`) | Validation guard. |
  | `CrearInfluencerAgencia` | `"Completá nombre, usuario y clave"` | red (`ok:false`) | Validation guard. |
  | `CrearInfluencerAgencia` | `"La clave debe tener 8+ caracteres"` | red (`ok:false`) | Validation guard. |
  | `ResetPassword` | `"La contraseña debe tener 8+ caracteres"` | red (`ok:false`) | Validation guard. |
  | `ResetPassword` | `"Las contraseñas no coinciden"` | red (`ok:false`) | Validation guard. |
  | `CrearSubAgencia` | `"Completá nombre, usuario y clave"` | red (`ok:false`) | Validation guard. |
  | `CrearSubAgencia` | `"La clave debe tener 8+ caracteres"` | red (`ok:false`) | Validation guard. |
  | `CargarCreditoSub` | `"Ingresá un monto"` | red (`ok:false`) | Validation guard. |
  | `CrearComboInfluencer` | `"Elegí al menos un partido"` | red (`ok:false`) | Validation guard. |

  **Shape**: identical to T1/T2 — `const [msg, setMsg] = useState(null)`,
  `msg` is `{text, ok} | null`, comment `// {text, ok} | null — status
  lives here, not in the text`. Renders changed from
  `msg.startsWith("✅")?Q.green:Q.red` / `{msg}` to `msg.ok?Q.green:Q.red`
  / `{msg.text}` at all 13 sites.

  **Guard test**: extended `FIXED_SCREENS` in
  `messageStatusNotSniffed.test.js` to `["App.jsx", "Web.jsx",
  "Agencia.jsx"]`; updated the header comment to name only `Admin.jsx`
  (17 sites) as still pending. Proven to bite in step 8 below by
  restoring the pre-fix `Agencia.jsx` from a scratch copy, running the
  guard, and observing the exact failure, then restoring the fix —
  performed after implementation rather than before, since the fix and
  the guard extension were written in the same pass; the restore test
  gives the same RED evidence the strict-TDD order would have given
  first.

  **Player-visible before/after**, every `setMsg` call site touched (13
  components, 59 calls; clears/`setTimeout` clears listed once per site
  since text and colour are both n/a for them):

  | Component | Call site | Text before | Text after | Colour before | Colour after |
  |---|---|---|---|---|---|
  | CrearComboAgencia | `guardar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearComboAgencia | `guardar()` success | `` `✅ Combo creado.${...}` `` | same | green | green |
  | CrearComboAgencia | `guardar()` catch | `"⚠️ "+e.message` | same | red | red |
  | OtorgarBonoCliente | `otorgar()` no bono | `"Elegí un bono"` | same | red | red |
  | OtorgarBonoCliente | `otorgar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | OtorgarBonoCliente | `otorgar()` success | `` `✅ Bono otorgado · ${ars(d.monto)}` `` | same | green | green |
  | OtorgarBonoCliente | `otorgar()` rejected | `"⚠️ "+(d.detail\|\|"No se pudo")` | same | red | red |
  | OtorgarBonoCliente | `otorgar()` catch | `"⚠️ Error"` | same | red | red |
  | OtorgarBonoCliente | Cerrar button | `""` (no render) | `null` (no render) | n/a | n/a |
  | FichaCliente | `toggleBloqueo()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | FichaCliente | `toggleBloqueo()` bloquear=true | `"🔒 Cliente bloqueado"` | same | red | red |
  | FichaCliente | `toggleBloqueo()` bloquear=false | `"✅ Cliente desbloqueado"` | same | green | green |
  | FichaCliente | `toggleBloqueo()` catch | `"⚠️ "+e.message` | same | red | red |
  | FichaCliente | `aplicar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | FichaCliente | `aplicar()` success | `` `✅ ${modo}...` `` | same | green | green |
  | FichaCliente | `aplicar()` catch | `"⚠️ "+e.message` | same | red | red |
  | TicketHistorial | `accion()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | TicketHistorial | `accion()` success | `"✅ "+okMsg` | same | green | green |
  | TicketHistorial | `accion()` catch | `"⚠️ "+e.message` | same | red | red |
  | TicketHistorial | `confirmarAnular()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | TicketHistorial | `confirmarAnular()` con devolución | `` `✅ Anulada. Devolvé ${ars(...)}...` `` | same | green | green |
  | TicketHistorial | `confirmarAnular()` sin devolución | `"✅ Anulada. El saldo volvió..."` | same | green | green |
  | TicketHistorial | `confirmarAnular()` catch | `"⚠️ "+e.message` | same | red | red |
  | CambiarMiPassword | `guardar()` clave corta | `"La contraseña debe tener 8+ caracteres"` | same | red | red |
  | CambiarMiPassword | `guardar()` no coincide | `"Las contraseñas no coinciden"` | same | red | red |
  | CambiarMiPassword | `guardar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CambiarMiPassword | `guardar()` success | `"✅ Contraseña actualizada"` | same | green | green |
  | CambiarMiPassword | `guardar()` catch | `"⚠️ "+e.message` | same | red | red |
  | CrearInfluencerAgencia | `crear()` faltan campos | `"Completá nombre, usuario y clave"` | same | red | red |
  | CrearInfluencerAgencia | `crear()` clave corta | `"La clave debe tener 8+ caracteres"` | same | red | red |
  | CrearInfluencerAgencia | `crear()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearInfluencerAgencia | `crear()` success | `` `✅ Creado: ${d.code}...` `` | same | green | green |
  | CrearInfluencerAgencia | `crear()` catch | `"⚠️ "+e.message` | same | red | red |
  | DetalleInfluencerAgencia | `liquidar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | DetalleInfluencerAgencia | `liquidar()` success | `` `✅ Liquidación generada · ${ars(j.comision)}` `` | same | green | green |
  | DetalleInfluencerAgencia | `liquidar()` catch | `"⚠️ "+e.message` | same | red | red |
  | ConfigurarCuentaAg | `guardar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | ConfigurarCuentaAg | `guardar()` success | `"✅ Configuración guardada."+extra` | same | green | green |
  | ConfigurarCuentaAg | `guardar()` catch | `"⚠️ "+e.message` | same | red | red |
  | ResetPassword | `guardar()` clave corta | `"La contraseña debe tener 8+ caracteres"` | same | red | red |
  | ResetPassword | `guardar()` no coincide | `"Las contraseñas no coinciden"` | same | red | red |
  | ResetPassword | `guardar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | ResetPassword | `guardar()` success | `"✅ Contraseña reseteada..."` | same | green | green |
  | ResetPassword | `guardar()` catch | `"⚠️ "+e.message` | same | red | red |
  | MisAgencias | `bloquear()` bloquear_flag=true | `"✅ Agencia bloqueada"` | same | green | green |
  | MisAgencias | `bloquear()` bloquear_flag=false | `"✅ Agencia desbloqueada"` | same | green | green |
  | MisAgencias | `bloquear()` setTimeout clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | MisAgencias | `bloquear()` catch | `"⚠️ "+e.message` | same | red | red |
  | MisAgencias | `bloquear()` catch setTimeout clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearSubAgencia | `crear()` faltan campos | `"Completá nombre, usuario y clave"` | same | red | red |
  | CrearSubAgencia | `crear()` clave corta | `"La clave debe tener 8+ caracteres"` | same | red | red |
  | CrearSubAgencia | `crear()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearSubAgencia | `crear()` success | `` `✅ Creada: ${d.code\|\|d.name\|\|"sub-agencia"}` `` | same | green | green |
  | CrearSubAgencia | `crear()` catch | `"⚠️ "+e.message` | same | red | red |
  | CargarCreditoSub | `cargar()` monto inválido | `"Ingresá un monto"` | same | red | red |
  | CargarCreditoSub | `cargar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CargarCreditoSub | `cargar()` retirar | `"✅ Crédito retirado"` | same | green | green |
  | CargarCreditoSub | `cargar()` cargar | `"✅ Crédito cargado"` | same | green | green |
  | CargarCreditoSub | `cargar()` catch | `"⚠️ "+e.message` | same | red | red |
  | CrearComboInfluencer | `guardar()` sin picks | `"Elegí al menos un partido"` | same | red | red |
  | CrearComboInfluencer | `guardar()` clear | `""` (no render) | `null` (no render) | n/a | n/a |
  | CrearComboInfluencer | `guardar()` success | `"✅ Combo creado"` | same | green | green |
  | CrearComboInfluencer | `guardar()` catch | `"⚠️ "+e.message` | same | red | red |

  No text or colour differs anywhere. Verified programmatically: `msg.ok`
  appears exactly 13 times (one per render site), `{msg.text}` exactly 13
  times, `setMsg({text:` exactly 42 times and `setMsg(null)` exactly 17
  times — 42+17=59, matching the full `setMsg` call count found in
  mapping.

  **Checks, exact observed results:**
  - `CI=true npx react-scripts test --watchAll=false` (guard test only,
    post-fix, run before the restore test): 1 suite passed, 13/13 tests
    passed (4 new `Agencia.jsx` tests alongside the existing `App.jsx`
    and `Web.jsx` ones).
  - `CI=true npx react-scripts test --watchAll=false` (full suite,
    post-fix): 30 suites passed, 451 tests passed. Delta from baseline
    (30/447) is exactly the 4 new `Agencia.jsx` guard assertions.
  - `npx eslint src/Agencia.jsx --no-eslintrc --env browser,es2021
    --parser-options
    ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
    '{"no-undef":"error"}'`: no output, exit clean.
  - Production build with the staging-shaped placeholder values: `Compiled
    successfully.`, `283.22 kB (+126 B) build/static/js/main.d6ee5dce.js`.
  - Post-fix scan for the *concept*: `rg -n '\.startsWith\(\s*["'"'"'](✅|⚠️)'
    src/Agencia.jsx` — no output (exit 1). Positive control:
    `rg -c "startsWith" src/Agencia.jsx` reports 5, all unrelated (an
    `event_id` prefix check, a ticket-code `RT-` prefix check, a
    `loc_` username prefix check, a `"carga"` tipo check, and
    `ConfigurarCuentaAg`'s own `INF`-code prefix check for whether an
    account is an influencer — none is a colour decision).
  - **Guard-bites-here proof (step 8)**: copied the fixed `Agencia.jsx`
    aside, ran `git checkout -- frontend/src/Agencia.jsx` to restore the
    pre-fix source (confirmed via
    `rg -c '\.startsWith\(\s*["'"'"'](✅|⚠️)' src/Agencia.jsx` → 13),
    ran the guard test: **3 failed, 10 passed of 13** — the 3 failures
    were exactly `Agencia.jsx does not call .startsWith("✅") anywhere`,
    `Agencia.jsx does not call .startsWith on either status glyph
    anywhere`, and `Agencia.jsx the status travels beside the text, not
    inside it`; the fourth Agencia.jsx assertion (`the ✅/⚠️ prefixes are
    still in the message text`) and all `App.jsx`/`Web.jsx` tests stayed
    green. Then restored the fixed `Agencia.jsx` from the scratch copy;
    full suite re-run afterward confirmed 30/30 suites, 451/451 tests.

  **Review assess**, run after the commit:
  `gentle-ai review assess --cwd . --agent claude-code --base-ref staging
  --committed-only --json` → `risk: "medium"` (reason:
  `executable_change` on `frontend/src/Agencia.jsx`), `changed_paths: 3`,
  `changed_lines: 212`, `review_due: false`,
  `review_due_reason: "under_budget"`. No `next_transition` returned;
  nothing further run.

## Delivery

One work-unit commit on `fix/quartzplay-message-status`, off `staging`. After
the commit, run `gentle-ai review assess --cwd . --agent claude-code
--base-ref staging --committed-only --json` and report the outcome. If review
is due, hand the returned command back verbatim rather than running it.

## Progress

T1 done (commit `bd93e09`) and T2 done (`/sitio`, `Web.jsx`, 3 sites,
merged to `staging`). T3 done (`/agencia`, `Agencia.jsx`, 13 sites,
commit `369578a` on `fix/quartzplay-agency-message-status`). Full suite
green (30/451), guard test extended to `Agencia.jsx` and proven to fail
on the pre-fix source (3/13 failing) and pass after (13/13), ESLint
clean, staging-shaped production build clean, review assess under
budget (`medium` risk, 212 changed lines) so no review was due.

## Next step

`Admin.jsx` (17 sniffing sites) — its own slice, same shape as T1-T3.
After that, the emoji-to-icon glyph move itself becomes safe across all
35 original sites.
