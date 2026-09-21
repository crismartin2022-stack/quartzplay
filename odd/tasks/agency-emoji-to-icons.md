# Drawn icons in the agency panel

## Objective

`/agencia` stops drawing meaning with emoji, the way the player's screens
already do.

## Who this is for

The agency. Not the player — nobody outside the business sees this screen.
That is worth saying plainly: this is the lowest-return slice of the
migration by audience, and it is being done because the owner chose to close
the stage, not because a player is waiting for it.

What it does buy: an agency that shows this panel to a player sees the
brand, not the emoji font of whatever computer it is open on. And the panel
stops looking different on every machine in the same office.

## What is here

Counted against this branch with the regex in `appEmojiCeiling.test.js` —
not from `docs/icon-inventory.md`, whose figures are stale:

**`Agencia.jsx` — 269 uses, 73 distinct, spread across 55 components.**

## How it is sliced, and why

269 replacements is roughly 540 authored changed lines: too much for one
reviewable commit. The cut falls at a boundary that means something rather
than at a line number:

- **T1 — the daily operation**, from the top of the file through
  `Historial` (~line 5803): ticket flows, combos, clients, bonuses, printing,
  providers, terminals, channels. **134 uses.**
- **T2 — closings, account and influencers**, from `Cierres` (~line 5903) to
  the end: closings, password and account config, sub-agencies, and the whole
  influencer sub-product. **135 uses.**

Both land in one PR. The total is over the usual per-slice budget and that is
reported rather than worked around: splitting a single mechanical pass over
one file into two PRs costs the owner two merges and buys nothing.

## What to draw them with

`docs/icon-inventory.md` has the mapping. Read it for that; ignore its counts.

1. `frontend/src/Icon.jsx` — 36 ported icons. Prefer these.
2. `lucide-react` — already a pinned dependency.

`App.jsx` and `Web.jsx` are the worked examples for sizing, colour and
`aria-hidden`. Match them; do not invent a third style.

## The standing rule on choices

Cosmetic icon choices belong to the agent, not the owner. Pick the best fit
and move on; the per-site detail goes in this document, not into a list for
approval.

Where no icon is defensible, leave the emoji and record it. A wrong icon
tells the reader something untrue, which is worse than an emoji.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces. No new colours.
- A row of related items migrates as a row, or not at all.
- This file's message components use the `{text, ok}` contract. The `✅`/`⚠️`
  prefixes leave the message strings and become
  `<Icon name={msg.ok?"circle-check":"triangle-alert"}/>` in the render, as
  in `App.jsx` and `Web.jsx`. Do not reshape the contract itself —
  `messageStatusNotSniffed.test.js` fails if it moves.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- Extend the emoji-ceiling guard to `Agencia.jsx`, keeping its positive
  control.
- `npx eslint src/Agencia.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build. Report the bundle size before and after.

## Tasks

- [x] **T1** The daily operation — top of file through `Historial`. 134
      emoji occurrences become icons or stay, per the rules below. Commit
      `ff886fb`. The 13 `{text, ok}` `setMsg` render sites in the whole
      file (4 land in T1) gain
      `<Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/>`
      before `{msg.text}`; the `✅`/`⚠️` prefix leaves every `setMsg({text,
      ok})` call, exactly as in `App.jsx` and `Web.jsx`. Plain-string
      `setMsg`/`setOkMsg`/`setErr` calls (not the `{text,ok}` shape) are
      untouched, same exclusion as the prior two slices.
- [x] **T2** Closings, account and influencers — `Cierres` to the end. 135
      occurrences. Commit `28364a3`, which also extends
      `appEmojiCeiling.test.js` with Agencia.jsx's final ceiling (only
      once both slices were done, since T1 alone could not report an
      accurate number for the whole file).

## What was mapped, and from where

- **`✅`/`⚠️` message-contract render sites** (13 across the file — 4 in
  T1: `CrearComboAgencia`, `OtorgarBonoCliente`, `FichaCliente`,
  `TicketHistorial`; 9 in T2: `CambiarMiPassword`,
  `DetalleInfluencerAgencia`, `ConfigurarCuentaAg`, `ResetPassword`,
  `MisAgencias`, `CrearSubAgencia`, `CargarCreditoSub`,
  `CrearInfluencerAgencia`, `CrearComboInfluencer`): `circle-check` /
  `triangle-alert` — `Icon.jsx`.
- **Other standalone `✅`/`⚠️` JSX text** (not a `setMsg` prefix, no row
  conflict): the `AlertaError` shared component's icon, `CazaError`'s
  fallback screen heading, several always-warning banners
  (`MejorarCombinada`, `CrearComboAgencia`, `SoporteAgencia`, `AutoLiquidar`'s
  aviso_tope banner), and two `"✅ X":"Y"` ternaries whose other branch is
  plain text, not an emoji (`u.jugo?"Jugó":"Escaneó"` in two places).
- **`💰`/`💵`**: `wallet-cards` — `Icon.jsx`. Every Cash out / Crédito /
  saldo header and empty-state icon across `FlujoManual`, `HistorialCashout`,
  `MisAgencias`, `CargarCreditoSub`, `AgenciaPanel`'s saldo modal.
- **`📊`**: `chart-no-axes-combined` — statistics button/heading in
  `EstadisticasPartidoBoton`.
- **`🔍`**: `search` — every search-box icon (`FiltroEventos`, `Clientes`,
  `CrearComboAgencia`).
- **`👤`**: `users` — `Icon.jsx`, the set's own accepted approximation
  ("only the plural mark"), same as `Web.jsx`'s "Mi cuenta" precedent:
  `Clientes`' empty state, the `BonosAgencia` cross-reference to the
  Clientes tab, and the `AgenciaPanel` TABS array's Clientes tab.
- **`🎟️`**: `ticket` — the "Esperando pago" reservation banner and the two
  influencer "Copiar código para agencia" buttons (`InfluencerCombosIA`,
  `InfluencerCombos`). Two other `🎟️` uses inside `textoCombo` (a plain
  WhatsApp-share text builder, not JSX) cannot host a React component and
  stay emoji — see left-behind.
- **`🔴`/`🟡`/`🔵`**: `circle-dot`, coloured by the value already driving
  the emoji choice (`c` in `CarruselAvisos`, or a literal `Q.gold`/`Q.cyan`
  where there was no such variable): the live-league filter chips
  (`FlujoManual`'s and `EnVivo`'s synthesized `ligas` arrays — client-built
  data, unlike the backend-supplied `d.icon`/`s.icon` left below), the
  Prematch/En Vivo tab pair, and the aviso-level dot in `CarruselAvisos`.
- **`📋`**: `clipboard-list` — the Prematch tab label and
  `CrearComboInfluencer`'s "Elegí partidos" heading.
- **`🏦`/`🏛️`**: `landmark` — `PSPAgencia`'s heading and empty state,
  `HistorialCashout`... `SaldoCC` is untouched (no emoji there); the "De la
  casa" badge (`🏛️`) shares the mark with `🏦`, same as `Admin.jsx`'s own
  entry in the inventory.
- **`⚙️`**: `sliders-horizontal` — every "Config"/"Configurar" control
  (`MisAgencias`' list buttons, the influencer detail's "Configurar
  influencer", the sub-agency config modal heading).
- **`🎫`/`🧾`**: `receipt-text` — the one JSX `🎫` use (`PagoLocalForm`'s
  "Cash out para cobrar") and the one JSX `🧾` use (`Historial`'s empty
  state). The `🎫`/`🧾` inside `Cierres`' 7-tab view-switcher stay — see
  the row-rule entry below.
- **`🎰`**: `spade` — the casino/roulette closing-report heading and the
  Proveedores provider-type filter tab.
- **`⚽`/`🏆`**: `trophy` — `EnVivo`'s and `FlujoManual`'s "no live
  matches" empty state (`⚽`, matching `App.jsx`'s own dead-ball mark); the
  sole `🏆` use is inside the decorative sticker pool (see left-behind), so
  no live `🏆` site was migrated.
- **`➕`/`⬆️`/`⬆`/`⬇️`/`⬇`**: `plus`/`arrow-up-right`/`arrow-down-left` —
  the PSP Cargas/Retiros tabs and the `CargarCreditoSub` modal's
  Cargar/Retirar tabs (both sides mapped, no row conflict); `📤`/one `⬆`
  use also became `arrow-up-right` ("Compartir este combo",
  "Descargar" in `EditorPlaca`, using the same bare-arrow mapping the
  inventory gives `⬆`). The one `➕`/`➖` pair in `FichaCliente`
  (Cargar/Retirar) stays — `➖` has no mark, row rule.
- **`📨`**: `message-circle` — `MensajesAgencia`'s heading.
- **`📷`**: `camera` — `EditorPlaca`'s "Mi foto" background-upload button.
- **`🕓`**: `clock-3` — `InfluencerCombosIA`'s Historial tab (paired with
  the now-`Zap` Activos tab).
- **`📸`**: role-dependent, both from `Icon.jsx`: `scan-line` for a
  scan/read flow heading (`MejorarCombinada`'s "Mejorar combinada",
  `InfluencerEscaner`'s "Tu escáner de apuestas"), `camera` for a
  take-a-photo control (`MejorarCombinada`'s "Sacar foto" tile). The three
  `📸` uses inside mixed tab rows (`Cierres`' 7-tab bar,
  `DetalleInfluencerAgencia`'s 3-tab bar, `InfluencerPanel`'s 4-tab bar)
  stay — row rule.
- **`lucide-react` extensions** — only the four icons already established
  by `App.jsx`/`Web.jsx`/`Box.jsx` (`Handshake`, `Video`, `Zap`, `Gift`),
  never a new pick:
  - `🤝` → `Handshake`: `DesafiosAgencia`'s heading (the same "Desafíos"
    concept `App.jsx`/`Web.jsx`/`Box.jsx` already draw this way).
  - `🎥`/`🎰` → `Video`/`spade`: `ProveedoresAgencia`'s slots/vivo filter
    tabs and its per-provider live badge, matching `App.jsx`'s identical
    casino filter pattern exactly.
  - `⚡` → `Zap`: every "automatic"/"AI" heading and tab —
    `CombosIA`, `AutoLiquidar` ("Liquidar automático"), the `AgenciaPanel`
    TABS array's Combos IA tab, `InfluencerCombosIA`'s Activos tab,
    `CrearComboInfluencer`'s heading. Not migrated where paired with an
    unmapped sibling in `Cierres`'/`InfluencerPanel`'s tab rows (row rule).
  - `🎁` → `Gift`: every bonus control — `OtorgarBonoCliente` (button +
    heading), `BonosAgencia` (heading + empty state), the `AgenciaPanel`
    TABS array's Bonos tab.

## The row rule, applied at three sizes

- **Small ternaries/pairs** (2–3 sibling states, one glyph has no icon):
  the risk-trio pattern from `App.jsx`/`Web.jsx` repeats here as the
  `✅`/`💵`/`🎉` cash-out-result ternary (`🎉` unmapped), the `🔇`/`🔔`/`🔊`
  sound-level row, the `🔔`/`🔕` toggle, and the many `"✅ Copiado":"📲/🌐/📝
  …"` clipboard-button ternaries (10 sites) where the un-copied label uses
  an unmapped glyph. All stay whole. The two exceptions where the sibling
  label *is* mapped (`🎟️`, in two influencer "Copiar código" buttons) were
  migrated instead.
- **Small tab clusters** (3–7 view-switcher tabs for one screen, mixed
  availability): `Cierres`' 7-tab bar (`📊🧾💸🎫🏦⚡🖨️`),
  `DetalleInfluencerAgencia`'s 3-tab bar (`🌟💸📸`), and
  `InfluencerPanel`'s 4-tab bar (`📊⚡🤖📸`) each mix mapped and unmapped
  glyphs on one visible strip; left whole rather than showing some tabs
  with a drawn icon and others with a bare emoji.
- **The main 18-tab `AgenciaPanel` navigation strip** was judged
  differently: 10 of its 18 tabs already carry no emoji at all today, so
  the strip is not a tight same-concept cluster the way the smaller ones
  above are — it is general navigation furniture, like `Web.jsx`'s
  `BarraWeb` bottom nav. The 6 tabs with a mapped glyph
  (`🔴⚡📸👤💰🎁`) were migrated individually; `🏢` and `🌟` (no icon) stay.

## Non-JSX contexts (new category this slice needed)

Two kinds of site cannot host a React `<Icon/>` regardless of mapping, and
both are new to this slice:

- **Plain-text/canvas builders**: `textoCombo` (a WhatsApp share-text
  template literal) and `descargarPlacaCombo`/`EditorPlaca`'s canvas
  `fillText`/layer-`texto` calls draw literal characters onto a message or
  an image, not JSX. `🔥🎟️👉📲` inside these stay regardless of whether the
  same glyph is mapped elsewhere.
- **`<option>` contents**: a native `<option>` only renders its text, so
  `👤` inside `Cierres`' client-filter `<select>` stays even though `👤`
  is mapped everywhere else.

## Left behind (157 uses, 56 distinct) in `Agencia.jsx` — every one, with line and reason

- **No mark in either source** — `💸` lines 1195, three "Movs"/"Cuestan"
  labels (no movement mark); `🛠️` line 1459 (no tools); `📭` line 1585,
  `🌙` line 2946 (no empty-state mark); `🔗` line 1723 (no link); `🖨️`
  lines 318, 1830, 3154, 3171, 6029, 6625 (no printer); `🖼️` lines 2191,
  8740, 8863 (no image mark); `✏️` line 2279, `✍️` line 6597 (no pencil);
  `🌟`/`⭐` lines 2468, 2515, 6373, 7128, 7137, 7309, 7383, 7960, 8519 /
  6478 (no star); `🏢` lines 2490, 6029, 7190, 7682, 7718, 7805, 7959 (no
  storefront); `🔒`/`🔐` lines 3074, 3199, 3213 (in the row below), 3433,
  3500, 3614, 7715 / 9135 (no padlock); `📲` lines 154, 3621, 6698, 6926,
  8125–8126, 8286, 8397, and every `"📲 Copiar/Link…"` clipboard-button
  branch (no phone); `🔑` lines 3618, 6748×2, 7410, 7617, 7740 (no key);
  `🔇`/`🔔`/`🔊`/`🔕` lines 4145–4146, 4425 (no bell/mute/speaker); `🎧`
  line 4414 (no headset); `🤖` lines 4963, 6594, 6695, 8527, 8695 (no
  robot); `🔄` lines 4968, 6896 (no refresh); `🌐` lines 8454, 8592, 8724,
  8847 (no globe); `✈️` lines 3103, 3487 (Telegram's own mark not in the
  set); `📝` lines 8735, 8858 (no note); `💾` lines 7577, 8990 (no
  save/disk); `🎨` lines 8296, 8745, 8868, 8998 (no palette); `🗑` line
  8337 (no bin); `🚀` line 8286 (no rocket); `🎯` line 8286 (no target);
  `👑`/`💎`/`💪` line 8286 (copy — see the sticker-pool entry below).
- **Row rule — small ternary/pair with an unmapped sibling** — `✅`/`💵`/`🎉`
  line 1803 (`🎉` unmapped); `🔒`/`✅` line 3213 (`🔒` unmapped, same
  `BloqueosRama` history row `FichaCliente` already treats this way at its
  own `setMsg`); `➕`/`➖` line 3538 (`➖` has no minus mark); the ten
  `"✅ Copiado":"📲/🌐/📝 …"` clipboard-button ternaries at lines 8449,
  8454, 8587, 8592, 8719, 8724, 8735, 8842, 8847, 8858.
- **Row rule — small tab cluster, mixed availability** — the `Cierres`
  7-tab bar line 6029 (`📊🧾💸🎫🏦⚡` mapped, `🖨️` is not); the
  `DetalleInfluencerAgencia` 3-tab bar line 7137 (`🌟💸` unmapped, `📸`
  mapped); the `InfluencerPanel` 4-tab bar line 8527 (`🤖` unmapped,
  `📊⚡📸` mapped).
- **Plain-text/canvas builders, not JSX** — `🔥` lines 92 (×2), 8286;
  `💰` lines 94, 8286; `🎟️` lines 95–96; `👉` lines 97, 151, 8125; `📲`
  lines 154, 8126.
- **`<option>` contents, not JSX-renderable** — `👤` line 6069.
- **Backend-supplied data, not this file's own** — the sport-list `d.icon`
  reads inside `CrearComboAgencia` and `CrearComboInfluencer` (fed by the
  API's `deportes`/`prematch` payload, same exclusion `App.jsx`'s
  `ScreenPrematch` `s.icon` already has) and the product-catalog `c.icono`
  reads inside `ProductosRed` (fed by `datos.catalogo`). Neither renders a
  literal `🔴`/`📋`/etc. in this file's own source, so the ceiling script
  never sees them and they are not in the count above.
- **The "Editor de placa" sticker pool** (`EditorPlaca`, line 8286) — a
  12-glyph array (`🔥⚽💰🏆⭐💎🚀✅🎯👑💪📲`) the agent picks from to stamp
  stickers onto a combo share-image the agency builds by hand. This is the
  product's own creative feature, not interface chrome — matching the
  inventory's note that a similar `⭐` placa pool in `PerfilWeb`/`App.jsx`
  stays as it is. None of the 12 were touched, including the ones (`✅`
  `🏆` `⚽` `💰`) that have icons at their *other* sites elsewhere in this
  file.
- **Message-string prefix outside T1/T2's contract scope** — `✅`/`⚠️` at
  lines 2130/2132, 2679/2681, 2877/2879 (`MejorarCombinada`,
  `MisCombosAgencia`, `CombosIA` — all plain `setOkMsg`/`setErr` strings,
  not the `{text,ok}` shape); lines 4531–4532, 4671–4672, 4791–4792,
  4950, 5129–5130, 5355–5356 (`ProveedoresAgencia`, `ProductosRed`,
  `Terminales`, `AsesorAgencia`, `DesafiosAgencia`, `MisCanales` — plain
  `setMsg(string)`, same exclusion). Matches the player/site slices'
  documented boundary: only components already using the `{text,ok}`
  contract were touched.
- **Embedded mid-message, not a leading prefix** — `⚠️` line 7495
  (`ConfigurarCuentaAg`): `` ` ⚠️ ${n} hija(s) quedaron con % mayor.` ``
  is appended as a sub-warning onto an otherwise-`ok:true` success
  message, not a leading status prefix the render already draws an icon
  for. Touching it would mean inventing a second status signal inside one
  message; left as text.
- **Code comment, not rendered** — `✅` line 3431 (`// … carried no ✅
  prefix,`), explaining `FichaCliente`'s history, not shown to anyone.

## Checks — exact observed results

- **Baseline** (before any edit): `CI=true npx react-scripts test
  --watchAll=false` from `app/frontend` — `31 suites passed, 31 total;
  464 tests passed, 464 total; 3.569s`.
- **Guard test extended, run against the pristine (pre-edit) `Agencia.jsx`**
  (`git stash` of only `Agencia.jsx`, the extended `appEmojiCeiling.test.js`
  applied on top): `FAIL src/appEmojiCeiling.test.js` — `Agencia.jsx does
  not gain emoji back`: `total emoji uses do not rise above what this
  migration leaves behind`: `Expected: <= 157, Received: 269`; `distinct
  emoji do not rise above what this migration leaves behind`: `Expected:
  <= 56, Received: 73`. 2 failed, 7 passed in that file (positive control
  plus App.jsx/Web.jsx/Box.jsx's six, green throughout). Working tree
  restored (`git stash pop`) immediately after.
- **After T1** (T2 not yet edited, guard not yet extended): full suite —
  `31 suites passed, 31 total; 464 tests passed, 464 total; 3.41s`;
  `npx eslint src/Agencia.jsx …` — no output, exit code 0.
- **After T1+T2**: `CI=true npx react-scripts test --watchAll=false` —
  `31 suites passed, 31 total; 466 tests passed, 466 total; 3.18s–3.22s`
  across repeated runs (2 more than baseline: the new `Agencia.jsx`
  guard-test pair). `messageStatusNotSniffed.test.js` green throughout —
  the `{text, ok}` contract was never reshaped.
- **ESLint**, same ruleset as the brief: `Agencia.jsx` — no output, exit
  code 0, both after T1 alone and after T1+T2.
- **Production build**, staging placeholders, before (`33a3d74`, this
  branch's last commit before either slice, built from an isolated `git
  worktree` sharing this checkout's `node_modules` via a symlink, torn
  down after) vs after (`28364a3`, this branch's HEAD): `main.7e9c4ade.js`
  **283.65 kB** gzip → `main.54feab64.js` **284.29 kB** gzip. **+0.64 kB**
  for the ~140 new `Icon`/lucide call sites plus the `Handshake`/`Video`/
  `Zap`/`Gift` imports (all four already pinned, already imported by
  `App.jsx`/`Web.jsx`/`Box.jsx` elsewhere in the same bundle) — no new
  package was installed.
- **Diff size**: T1 124 lines (63+/61-, one file), T2 124 lines (71+/53-,
  two files including the guard test) — both comfortably under the
  ~400-line stop-and-slice threshold, despite the brief's own forecast
  that the combined total (269 replacements, ~540 authored lines) would
  run over. The actual authored diff came in far smaller than that
  forecast because most sites are single-line label swaps, not the
  4-line inserts the forecast assumed.

## Review assess — exact outcomes

- **After T1** (`base-ref staging`, `ff886fb`): `risk: medium` (reason:
  `executable_change` on `Agencia.jsx`), `changed_lines: 224` (includes
  the prior docs-only commit against `staging`), `review_due: false`,
  `review_due_reason: "under_budget"`. No review action taken.
- **After T2** (`base-ref ff886fb`, `28364a3`): `risk: medium`,
  `changed_lines: 124`, `review_due: false`, `review_due_reason:
  "under_budget"`. No review action taken.

## Progress

T1 and T2 done. Working tree clean.

## Next step

`Admin.jsx` (488 uses per the brief's figure; re-measure against the
branch with `appEmojiCeiling.test.js`'s regex before starting, the way
this slice did — every prior slice's inventory-quoted count has been
stale by the time work started).
