# Drawn icons on the public site and the cashier screen

## Objective

`/sitio` and `/box` stop drawing meaning with emoji, the way the Telegram
app already does.

## Why this is safe

The 35 places that decided a message's colour by reading its first character
are gone (PRs #106, #107, #108). Nothing reads a glyph to decide anything, so
glyphs can move.

## What is here

Counted against this branch with the same regex the existing guard uses —
not from `docs/icon-inventory.md`, whose figures are stale:

| File | Route | Who sees it | Uses | Distinct |
|---|---|---|---:|---:|
| `Web.jsx` | `/sitio` | player, public web | **71** | 38 |
| `Box.jsx` | `/box` | cashier | **10** | 10 |

`Web.jsx`'s most frequent: ⚠️×11, ✅×6, 🤝×5, 💬×4, 📋×4, 🎰×3.

## What to draw them with

`docs/icon-inventory.md` maps emoji to icons. Read it for the mapping; ignore
its counts.

1. `frontend/src/Icon.jsx` — 36 ported icons. Prefer these.
2. `lucide-react` — already a pinned dependency.

`App.jsx` was migrated in the previous slice and is the worked example for
sizing, colour and `aria-hidden` usage. Match it; do not invent a second
style.

## The standing rule on choices

Cosmetic icon choices are the agent's to make, not the owner's. Pick the
best fit and move on. Do not produce a list of choices for approval — the
per-site detail belongs in this document, where it can be looked up.

Where no icon is defensible, leave the emoji. A wrong icon tells the reader
something untrue, which is worse than an emoji.

## Scope

Authorized: `frontend/src/Web.jsx`, `frontend/src/Box.jsx`, and test files.

Out of scope: `Agencia.jsx` (310 uses) and `Admin.jsx` (537), each its own
slice.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces. No new colours.
- Decorative icons get `aria-hidden`; an icon carrying meaning the text does
  not repeat gets an accessible name.
- A row of related items migrates as a row, or not at all.
- `Web.jsx`'s message components use the `{text, ok}` contract. Reading it is
  fine; changing its shape is not — a guard test fails if it moves.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- Extend the emoji-ceiling guard to `Web.jsx` and `Box.jsx`, with a positive
  control proving the counter can see an emoji.
- `npx eslint <file> --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build. Report the bundle size before and after.

## Tasks

- [x] **T1** `Web.jsx` — the public site the player sees before signing up.
      39 emoji occurrences become icons (some are `setMsg` prefix strips with
      no new JSX tag; see below), guided by the inventory and matching
      `App.jsx`'s prior slice exactly wherever the same component exists in
      both files. 32 uses, 26 distinct, stay emoji. Commit `6b9021a`.
      `PerfilWeb`, `CrearDesafioWeb` and `PanelIacoinWeb` — the three named
      in the brief — lose the `✅`/`⚠️` prefix from their `setMsg({text,ok})`
      calls; the render gains
      `<Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/>`
      before `{msg.text}`, coloured by the existing `msg.ok?Q.green:Q.red`,
      exactly like `App.jsx`'s T1. The `{text, ok}` contract itself is
      unchanged.
- [x] **T2** `Box.jsx` — nine uses left after this task (ten before). Commit
      `117d37c`. Only `🤝` (`DESAFÍOS ABIERTOS`) had a defensible
      equivalent — `Handshake` from `lucide-react`, the same source
      `App.jsx`'s T2 used for it, since `Icon.jsx` has no handshake path.
      The other nine (`🛠️ 🚀 🖼️ 🔁 🎲 🌙 ✏️ ⚖️ 📭`) have no mark in either
      source and stay emoji. `boxIcons.test.js`, the guard from `Box.jsx`'s
      own earlier migration PR, moved `🤝` from its `AWAITING_AN_ICON` map
      to its `REPLACED` list to match.

## What was mapped, and from where

- **`Web.jsx` T1-style message icons** (3 render sites — `PerfilWeb`,
  `CrearDesafioWeb`, `PanelIacoinWeb`; 9 `setMsg` prefix strips across them):
  `circle-check` / `triangle-alert` — `Icon.jsx`.
- **Ayuda** (floating button + chat-panel header, 2 sites): `message-circle`
  — `Icon.jsx`.
- **`BotonCompartir`** (2 sites, compact and full): `arrow-up-right` —
  `Icon.jsx`. Byte-identical component to `App.jsx`'s; same icon, same
  sizing.
- **"Mejorá tu apuesta" scan flow** (5 sites: `Cámara` button, `Analizar N
  fotos`, two `⚠️` warnings, `Generar mi código para jugar`): `camera`,
  `search`, `triangle-alert` ×2, `ticket` — `Icon.jsx`. Same component
  pattern as `Box.jsx`'s (already-migrated) and `App.jsx`'s "Mejorar mi
  apuesta"; `🖼️` (`Archivo`) and `✏️` (`Está mal`) in the same flow stay
  emoji, matching both.
- **`QKBWeb`** `{label:"◀ Sports",...}` (1 site): gained an `icon` prop the
  same way `App.jsx`'s identical `QKB` component already did; the `◀`
  left the label string.
- **`PerfilWeb`'s `ICONO` lookup** (5 of its 6 keys): `trophy`, `spade` —
  `Icon.jsx`; `Video`, `Handshake` — `lucide-react`, already the source
  `App.jsx`'s own `ICONO` object uses for the same two keys; `wallet-cards`
  for `carga`. `retiro`'s `💸` stays emoji (see left-behind).
- **`BarraWeb`** bottom navigation (6 tabs + the Bet Best button, 7 sites):
  `trophy`, `circle-dot`, `spade`, `clipboard-list` — `Icon.jsx`; `Video`,
  `Handshake` — `lucide-react`; `camera` for the Bet Best button, matching
  the camera-shaped mark `App.jsx`'s own bottom nav already draws for the
  same feature (a separate, pre-existing SVG icon set unrelated to this
  migration, but the same concept). Icon colour now follows the tab's own
  active-state colour (`Q.gold`/`Q.muted`, both already used one line below
  for the label) instead of opacity alone.
- **`CasinoWeb`** empty state (1 site): `spade`.
- **`DesafiosWeb`** two empty states (not-signed-in, product-disabled):
  `Handshake` at size 40, matching `App.jsx`'s identical pair at size 38.
- **`MuroDesafiosWeb`** Comentar buttons (2 sites): `message-circle`.
- **Header "Mi cuenta" button** (1 site, icon-only): `users` with
  `label="Mi cuenta"` — the inventory's own accepted approximation ("the
  set has only the plural mark"), never exercised by `App.jsx` since it has
  no `👤` use to test it against.
- **Historial, not signed in** (1 site): `clipboard-list`.
- **Footer "Juego responsable"** (1 site): `shield-check`, matching
  `App.jsx`'s identical link exactly.

## Left behind (32 uses, 26 distinct) in `Web.jsx` — every one, with line and reason

- **No mark in either source** — `🔁` line 645 (`Mantener selecciones`, no
  repeat); `🎲` line 690 (`O armala automáticamente` heading, no dice);
  `🖼️` line 2125 (`Archivo` upload button, no image mark); `✏️` line 2223
  (`Está mal`, no pencil); `📲` line 2341 (`Anotá o captura este código`,
  no phone); `🔔` line 2466 (`CampanaWeb` notification-bell button, no
  bell); `💸` line 2595 (`ICONO['retiro']`, no single mark — ambiguous
  which direction alone would mean, same as `App.jsx`'s); `👀` line 3330
  (paired with `🤝`, see row rule below); `🎧` line 4644 (header `Ayuda`
  icon-only button, no headset).
- **Row rule — a sibling in the same row has no equivalent anywhere** —
  `🛡️`/`⚖️` line 692, `🚀` line 693 (risk-profile trio, exactly `App.jsx`'s
  same trio, same reason: `⚖️`/`🚀` have no mark); `🔔`/`🔕` line 955
  (`ChatSoporte` sound toggle, neither has one); `🔥`/`➕`/`📋`/`🪙` lines
  3153-3154 (Desafíos tabs, exactly `App.jsx`'s same tab row: `🔥`/`🪙` have
  no mark); `🤝`/`👀` line 3330 (activity-feed ternary, exactly `App.jsx`'s
  same case: `👀` has none).
- **Dead code, not rendered anywhere** — `🏠`/`📋`/`🔴`/`⚡`/`📊` lines
  2411-2415, the module-level `STEPS` array. Unlike `App.jsx`'s
  same-named/same-content `STEPS` (a hidden dev step-bar, at least wired to
  something), `Web.jsx`'s `STEPS` has no reference anywhere else in the
  file — confirmed with a search for the identifier before deciding this.
  Left alone rather than deleted: removing dead code was not requested and
  is not an emoji decision.
- **Message-string prefix outside T1's named scope** — `⚠️` lines 1468,
  1488 (`LimitesJugador`); `✅` line 3400, `⚠️` line 3401
  (`MuroDesafiosWeb`); `⚠️` lines 3862, 3876 (`MisDesafiosWeb`). All five
  components use a plain-string `setMsg(...)`, not the `{text,ok}` shape,
  and the brief named only `PerfilWeb`, `CrearDesafioWeb` and
  `PanelIacoinWeb`. Giving these three more components the `{text,ok}`
  shape is real, separate work outside this task's scope, exactly as in
  the player slice.
- **Copy, not an icon stand-in** — `👋` line 3537 (`Todavía no hay nada por
  acá` empty state — the identical text and identical inventory
  classification `App.jsx` already left as copy); `♥` line 3567 (like
  button, no heart mark, paired with the already-non-emoji `♡`).

## Checks — exact observed results

- **Baseline** (before any edit, this branch already carries the player
  slice's App.jsx work): `CI=true npx react-scripts test --watchAll=false`
  from `app/frontend` — `31 suites passed, 31 total; 460 tests passed, 460
  total; 3.525s`.
- **Guard test extended, run against the pristine (pre-edit) `Web.jsx` and
  `Box.jsx`** (both `git stash`ed back to `c973ff3` momentarily, only the
  extended `appEmojiCeiling.test.js` applied; `App.jsx`'s two tests were
  unaffected): `FAIL src/appEmojiCeiling.test.js` — `Web.jsx does not gain
  emoji back`: `Expected: <= 32, Received: 71` and `Expected: <= 26,
  Received: 38`; `Box.jsx does not gain emoji back`: `Expected: <= 9,
  Received: 10` (both total and distinct). 4 failed, 3 passed (positive
  control plus `App.jsx`'s two, green throughout). Working tree restored
  (`git stash pop`) immediately after.
- **After T1** (Web.jsx edited, Box.jsx's guard block deliberately not yet
  added so the T1 commit stays self-consistent): full suite —
  `31 suites passed, 31 total; 462 tests passed, 462 total; 3.32s`.
- **After T1+T2**: `CI=true npx react-scripts test --watchAll=false` —
  `31 suites passed, 31 total; 464 tests passed, 464 total; 3.29s-3.45s`
  across repeated runs.
- **ESLint**, both files, same ruleset as the brief: `Web.jsx` — no output,
  exit code 0. `Box.jsx` — no output, exit code 0.
- **Production build**, staging placeholders, before (pristine `c973ff3`,
  built from an isolated `git worktree` sharing this checkout's
  `node_modules` via a symlink, torn down after) vs after (this branch's
  HEAD, `117d37c`): `main.3025385a.js` **283.44 kB** gzip →
  `main.aa37215c.js` **283.65 kB** gzip. **+0.21 kB** for the `Handshake`/
  `Video` lucide imports (new to `Web.jsx` and `Box.jsx`, already pinned as
  a dependency) plus the added `Icon`/lucide call sites — no new package
  was installed.
- **Diff size**: T1 79 lines (2 files, `Web.jsx` + guard test), T2 25 lines
  (3 files, `Box.jsx` + `boxIcons.test.js` + guard test) — both well under
  the ~400-line stop-and-slice threshold.

## Review assess — exact outcomes

- **After T1** (`base-ref feat/quartzplay-player-icons`, `6b9021a`):
  `risk: medium` (reason: `executable_change` on `Web.jsx`),
  `changed_lines: 223`, `review_due: false`, `review_due_reason:
  "under_budget"`. No review action taken.
- **After T2** (`base-ref 6b9021a`, `117d37c`): `risk: medium`,
  `changed_lines: 29`, `review_due: false`, `review_due_reason:
  "under_budget"`. No review action taken.

## Progress

T1 and T2 done. Working tree clean.

## Next step

None for this slice. Next in the inventory's stated order: `Agencia.jsx`
(310 uses), then `Admin.jsx` (537) — each its own slice, per this
document's Scope section.
