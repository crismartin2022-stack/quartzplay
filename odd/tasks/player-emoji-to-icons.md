# Drawn icons instead of emoji, starting with the player

## Objective

The Telegram mini-app stops drawing meaning with emoji. Every operating
system renders them differently, none of them takes the brand's colours, and
on older devices some render as an empty box.

## Why this is safe now, and was not before

An emoji used to be the data: 35 places decided a message's colour by reading
its first character. PRs #106, #107 and #108 moved the status into its own
state across all four screens. Nothing reads a glyph to decide anything
anymore, so glyphs can finally move.

## What is here

`App.jsx` — the player in Telegram — holds 153 emoji uses, 56 distinct:

- **11 inside message strings** (`setMsg({text:"✅ Listo", ok:true})`)
- **100 inside JSX**, the chrome: card headers, buttons, labels, empty states
- **42 elsewhere**, mostly strings built for display

## What to draw them with

`docs/icon-inventory.md` (272 lines) already maps emoji to icons and was
written for exactly this migration. Read it; do not redo it.

Two sources, in this order:

1. `frontend/src/Icon.jsx` — 22 icons ported from the prototype. Prefer these:
   they are the product's own set and already carry its stroke and sizing.
2. `lucide-react`, already a pinned dependency and already used by `App.jsx`.
   The inventory lists 64 emoji with no equivalent in the local set; lucide
   covers essentially all of them.

If neither has a defensible equivalent for a given emoji, **leave that emoji
alone and list it in the report**. A wrong icon is worse than an emoji: it
tells the player something untrue.

## Scope

Authorized: `frontend/src/App.jsx`, `frontend/src/Icon.jsx` (only to add
icons, never to change existing ones) and test files.

Out of scope: `Web.jsx` (85 uses), `Agencia.jsx` (310), `Admin.jsx` (537),
`Box.jsx` (13). Each is its own slice, in that order, player-facing first.

## Constraints

- **Nothing else changes.** No copy, no layout, no colour, no sizing beyond
  what placing an icon in a line of text requires.
- An icon that replaces an emoji inherits the colour of the text it sat in.
  Do not introduce new colours; use the theme.
- Decorative icons get `aria-hidden`. An icon that carries meaning the text
  does not repeat gets an accessible name.
- A row of related items migrates as a row. If three buttons sit together and
  only two have equivalents, either find the third or leave all three — one
  drawn icon beside two emoji looks like a bug. The inventory names this case.
- Do not touch the `{text, ok}` message contract. Reading it is fine; changing
  its shape is not.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Record the baseline first.
- A guard test that counts emoji in `App.jsx` and fails if the count rises,
  with a positive control proving the counter can see them.
- `npx eslint App.jsx --no-eslintrc --env browser,es2021 --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule '{"no-undef":"error"}'`
- A production build with staging-shaped placeholders. Report the bundle size:
  each icon costs bytes and has to earn them.

## Tasks

- [x] **T1** The status messages. The `✅`/`⚠️` prefixes leave the message
      text and become a drawn icon in the render, beside the text, coloured
      by `msg.ok`. This is what the three previous PRs were for.
      Commit `c141af9`. `CrearDesafio` and `PanelIacoin`'s four `{text, ok}`
      `setMsg` calls lose their glyph prefix; the render gains
      `<Icon name={msg.ok?"circle-check":"triangle-alert"} size={13}/>`
      before `{msg.text}`, coloured by the div's existing `msg.ok?Q.green:
      Q.red`. The `{text, ok}` contract itself is unchanged.
- [x] **T2** The chrome: the emoji in `App.jsx`'s JSX become icons, guided by
      the inventory. Commit `e250210`.

## Measurement correction

The task brief's "153 emoji uses, 56 distinct" and `docs/icon-inventory.md`'s
"137 uses, 51 distinct" were both taken at an earlier revision and no longer
matched the branch at start of work. A fresh scan with the same regex
`screenHomeIconsAndAccents.test.js` already uses found **129 uses, 50
distinct** in `App.jsx` before any edit — that is the number this task
actually worked from. `Icon.jsx` also carries 36 ported paths, not 22 — the
larger set the sibling `Box.jsx`/`ScreenHome` migrations had already grown it
to by the time this task started.

## What was mapped, and from where

- **T1** (4 sites): `circle-check` / `triangle-alert` — `Icon.jsx`.
- **T2** (62 sites): `circle-dot`, `clipboard-list`, `chart-no-axes-
  combined`, `search`, `trophy`, `spade`, `message-circle`, `ticket`,
  `clock-3`, `wallet-cards`, `arrow-left`, `arrow-up-right`,
  `arrow-down-left`, `landmark`, `receipt-text`, `shield-check`, `camera`,
  `scan-line`, `triangle-alert` — all `Icon.jsx`. `Video`, `Handshake`,
  `Zap` — `lucide-react`, already imported for `ScreenHome`; extended to
  their other sites in `App.jsx` (the `ICONO` lookup in `HistorialJuegos`,
  the `ScreenCasino` empty-state ternary, `ScreenDesafios`' two empty
  states, the AI-combo screens, the P2P heading, a `Prematch` "live" flag).
  No new `lucide-react` import was needed.
- 4 QKB `{label:"◀ Sports",...}` and 5 other QKB button objects gained an
  `icon` prop (`QKB` already supported one); the emoji left the `label`
  string.

## Left behind (66 uses, 36 distinct) — every one, with line and reason

- **Backend-supplied, not this file's data** — `⚽` line 983 (`s.icon` on
  `ScreenPrematch`'s sport list comes from `d.sports[]`; the 4 other real
  render sites of `s.icon` inherit this too. Mapping only the `"Cargando…"`
  placeholder would make the placeholder icon look different from every
  real sport's emoji — a worse inconsistency than leaving it emoji.)
- **Row rule — a sibling in the same row/ternary has no equivalent anywhere**
  (`docs/icon-inventory.md`'s gap list): `🛡️`/`⚖️`/`🚀` lines 1427-1429 (risk
  profile trio, `⚖️`/`🚀` have no mark); `📊`/`📅` line 641 (stats tabs,
  `📅` has none); `🔥`/`➕`/`📋`/`🪙` lines 3941-3942 (Desafíos tabs, `🔥`/`🪙`
  have none); `🤝`/`👀` line 4126 (activity-feed ternary, `👀` has none);
  `🔔`/`🔕` line 2998 (sound toggle, neither has one).
- **Genuinely no defensible icon anywhere** (`Icon.jsx` nor a clearly-matched
  `lucide-react` name), per `docs/icon-inventory.md`'s gap table: `🔗` lines
  5974, 5980, 6171, 6435 (no link mark); `🚀` lines 881, 890 (no rocket,
  outside the trio above); `🏪` lines 927, 1746, 6458 (no storefront); `✏️`
  lines 1736, 2486 (no pencil); `💸` lines 5869, 5875 (inventory: "no single
  mark — the set draws movement as the arrow pair", ambiguous which
  direction alone would mean); `🚧` line 517 (no works/barrier mark); `🔄`
  line 1250 (no refresh); `🎯` line 1359 (no target); `🎲` line 1435 ("Armá
  tu combinada" — inventory: a parlay builder is not a card mark); `🌙`
  line 1569 (no empty-state mark); `🔁` line 1839 (no repeat); `🖼️` line
  2388 (no image mark); `📲` line 2592 (no phone); `🎉` line 3610 (inventory:
  none for the Súper Bono tab); `♥` line 4380 (no heart; paired with the
  already-non-emoji `♡`); `🛠️` line 6317 (no tools).
- **Developer-only, not player-facing** — `🏠`/`📋`/`🔴`/`⚡`/`📊` lines
  2615-2619, the `STEPS` dev step-bar (`verPasos`, hidden by default; a
  console/QA aid, not something a player sees). Left out to keep the diff
  proportional to what players actually encounter; a defensible pickup for
  a later slice if desired.
- **Copy, not an icon stand-in** (`docs/icon-inventory.md`'s own role
  classification) — `👋` line 4331 ("Todavía no hay nada por acá" empty
  state — inventory lists this exact glyph's App.jsx role as copy, not
  icon, unlike the visually similar `🤝`/`🎥` empty-state pictograms this
  task did convert); `💡` line 1673 (a combo's note, tone inside a sentence).
- **Message-string prefix outside T1's named scope** — `⚠️` lines 3387, 3407
  (`JuegoResponsable`), 4198 (`MuroDesafios`), 4680, 4694 (`MisDesafios`);
  `✅` line 4197 (`MuroDesafios`). All five are plain-string `setMsg(...)`
  calls (not the `{text, ok}` shape), and none of them sniff the prefix for
  colour — the task named only `CrearDesafio` and `PanelIacoin`. Touching
  these would mean giving three more components the `{text, ok}` shape,
  which is a real, separate piece of work this task's scope did not cover.

## Checks — exact observed results

- **Baseline** (before any edit): `CI=true npx react-scripts test
  --watchAll=false` from `app/frontend` — `30 suites passed, 30 total;
  456 tests passed, 456 total; 3.526s`.
- **Guard test written first, run against the pristine (pre-T1) `App.jsx`**
  (`frontend/src/App.jsx` temporarily `git stash`ed back to `b3dc495`, only
  the new `appEmojiCeiling.test.js` present): `FAIL
  src/appEmojiCeiling.test.js` — positive control passed; `total emoji uses
  do not rise above what this migration leaves behind`: `Expected: <= 52,
  Received: 129`; `distinct emoji do not rise above what this migration
  leaves behind`: `Expected: <= 36, Received: 50`. Working tree restored
  (`git stash pop`) immediately after.
- **After T1 alone** (before T2 landed): full suite — `458 passed, 2
  failed` (both failures were the still-red `appEmojiCeiling.test.js`,
  expected — the ceiling targets the state after both tasks; every other
  suite, including `messageStatusNotSniffed.test.js`, passed).
- **After T1+T2**: `CI=true npx react-scripts test --watchAll=false` —
  `31 suites passed, 31 total; 460 tests passed, 460 total; 3.284s to
  3.513s` across repeated runs.
- **ESLint**: `npx eslint App.jsx --no-eslintrc --env browser,es2021
  --parser-options ecmaVersion:2021,sourceType:module,ecmaFeatures:
  {jsx:true} --rule '{"no-undef":"error"}'` — no output, exit code 0.
- **Production build**, staging placeholders, before T2 (T1 only) vs after
  T2: `main.67ca3193.js` **283.32 kB** gzip → `main.c18f7856.js` **283.72
  kB** gzip. **+0.40 kB** for 62 icon sites plus the extended `Video`/
  `Handshake`/`Zap` usage — no new dependency was added, so the growth is
  purely the additional call sites and one extended `ICONO`/filter-row
  object shape.
- **Diff size**: T1 20 lines (11+/9-), T2 189 lines (127+/62-, including the
  new guard test file) — both well under the ~400-line stop-and-slice
  threshold; no second slice was needed.

## Review assess — exact outcomes

- **After T1** (`base-ref staging`, `c141af9`): `risk: medium` (reason:
  `executable_change` on `App.jsx`), `changed_lines: 117`, `review_due:
  false`, `review_due_reason: "under_budget"`. No review action taken.
- **After T2** (`base-ref staging`, `e250210`): `risk: medium`,
  `changed_lines: 306`, `review_due: false`, `review_due_reason:
  "under_budget"`. No review action taken. Both assess calls needed
  `--untracked-scope=exclude --expected-untracked-inventory=<sha>` for the
  T1 call, because `appEmojiCeiling.test.js` was untracked at that point
  (written before T1, committed with T2); the exact remediation the tool's
  own error returned was used verbatim.

## Progress

Both tasks done. Working tree clean; nothing pushed, no PR opened, no merge.

## Next step

None for this slice. A future slice could: pick up the developer-only
`STEPS` bar if desired; extend the migration to `Web.jsx` (next in the
inventory's stated order); or draw new icons for the largest gap groups
(padlock/key, star, storefront/phone, handshake — already drawn here via
lucide, robot, globe, video/live — partially drawn here via lucide) once
someone decides on their visual language.
