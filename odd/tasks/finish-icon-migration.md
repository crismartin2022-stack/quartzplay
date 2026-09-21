# Finish the icon migration, with no exceptions left standing

## Why this exists

The owner reviewed staging and reported remaining emoji screen by screen,
then said the thing that matters: *"si voy uno por uno me quedo aquí por
siempre."*

He is right, and the cause is a rule we made. The **row rule** — a row of
related items migrates whole or not at all — was correct while the local icon
set was the only source: migrating half a row leaves a drawn icon beside two
emoji and reads like a failed load. But `lucide-react` is in the project and
covers nearly everything the local set lacks, so the rule stopped protecting
quality and started protecting unfinished work.

**The row rule is retired for this pass**, by the owner's decision. Where a
row needs a mark the local set lacks, take it from lucide and migrate the row
whole.

## What is left

Measured against this branch:

| Screen | UI emoji | In text that leaves the app |
|---|---:|---:|
| `Admin.jsx` | 207 | 1 |
| `Agencia.jsx` | 141 | 3 |
| `App.jsx` | 33 | 0 |
| `Web.jsx` | 26 | 0 |
| `Box.jsx` | 9 | 0 |
| **Total** | **416** | **4** |

**416 of the 420 render in the interface.** That is the whole remaining
migration, and it is finite.

## The one exception that stays

An emoji inside a string that **leaves the application** is not a migration
candidate: the WhatsApp message an agency forwards to a player, the HTML of
the print window, text drawn onto a canvas image. A React icon cannot go
there, and the emoji is right there — WhatsApp renders it consistently.

Classify by reading the code around each one, not by counting. The heuristic
that produced the "4" above is a window scan and is not authoritative; the
real number may be higher.

## Also in this pass

**The refresh button is standardised.** Today two sites draw a bare `🔄` and
three write "Actualizar". The owner wants the shape used on the Combos page —
**the word and the icon together** — everywhere a refresh button exists.
Find them all; they are not only the five the search above found.

## What the owner will see

Nothing moves, nothing is renamed, nothing changes colour. Emoji become drawn
icons that look the same on every device and take the brand's colours, and
the refresh control reads the same wherever it appears.

## Note on the black icons

Those are already fixed in PR #122, open at the time of writing: the document
declares its text colour for all six screens. Do not attempt to fix them
again here, and do not be surprised to see them black on a branch that
predates that merge.

## Scope

Authorized: `App.jsx`, `Web.jsx`, `Box.jsx`, `Agencia.jsx`, `Admin.jsx`, and
test files. `Icon.jsx` may gain marks; never change an existing one.

Out of scope: the tablet and desktop shell, which is a different layout and
its own stage.

## Constraints

- Nothing else changes: no copy, no layout, no colour, no sizing beyond what
  placing an icon in a line of text requires.
- An icon inherits the colour of the text it replaces.
- Decorative icons get `aria-hidden`; one carrying meaning the text does not
  repeat gets an accessible name.
- Every new `lucide-react` name is named explicitly in the report, and the
  import-shape guards are updated to name them — never loosened.
- Where genuinely no icon fits, leave the emoji **and say which and why**.
  That list should be short now; if it is long, something is wrong.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- The emoji-ceiling guard drops to the new counts per screen.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.

## Tasks

- [x] **T1** The player: `App.jsx`, `Web.jsx`, `Box.jsx` — 68 sites.
      Commit `edd5d32`.
- [x] **T2** `Agencia.jsx` — 141 sites. Commit `18974d4`, plus a small
      follow-up fix `06addc9` (see "A verification gap" below).
- [x] **T3** `Admin.jsx` — 207 sites. Commit `d85fa29`.
- [x] **T4** One refresh button everywhere. Commit `20fe416`.

## Measurement correction

The brief's table ("416 of 420 render in the interface... the '4' is a
window scan and not authoritative") undersold both numbers once actually
counted. **In-text-that-leaves-the-app was 4 by the heuristic; the real
count is 24**, all in `Agencia.jsx`: `textoCombo` (a WhatsApp share-text
template, 8 uses across 5 lines), `descargarPlacaCombo`'s canvas
`fillText` calls (2 uses), `abrirVentanaImpresion`'s raw print-window
HTML (1 use), `EditorPlaca`'s two initial canvas-layer texts (2 uses),
and `EditorPlaca`'s 12-glyph sticker pool (12 uses, `🔥⚽💰🏆⭐💎🚀✅🎯👑💪📲`)
— a picker whose buttons render literally the emoji that gets
`fillText`'d onto the shareable placa image, so migrating the picker's
labels to icons would place a *different* character than the one the
button shows. All four "leaves the app" categories the brief named
(WhatsApp message, print window, canvas image) actually occur, plus the
sticker pool which is a fifth: content that becomes canvas output, not
decoration a React icon could stand in for.

## What was mapped, and from where

`Icon.jsx`'s 36-path set covered many reused concepts (`circle-check`,
`triangle-alert`, `wallet-cards`, `clipboard-list`, `receipt-text`,
`shield-check`, `shield-alert`, `landmark`, `sliders-horizontal`,
`scan-line`, `search`, `spade`, `trophy`, `users`, `house`,
`chart-no-axes-combined`, `plus`, `ticket`, `network`, `message-circle`).
Everything else came from `lucide-react`, which already carried
`Handshake`, `Video`, `Zap`, `Gift`, `Image as ImageIcon`, `User`,
`Flame`, `Coins`, `Link`, `Bell` from earlier slices. New this pass:

`Calendar`, `CalendarDays`, `Rocket`, `Store`, `Target`, `Shield`,
`Scale`, `Dices`, `Moon`, `Lightbulb`, `Pencil`, `PenLine`, `Repeat`,
`Smartphone`, `PartyPopper`, `Eye`, `Heart`, `Construction`, `Banknote`,
`Monitor`, `Wrench`, `Inbox`, `Printer`, `Building2`, `Star`, `Send`,
`Lock`, `Minus`, `VolumeX`, `Volume2`, `Headphones`, `Bot`, `RefreshCw`,
`Key`, `Save`, `Palette`, `Trash2`, `Globe`, `FileText`, `ArrowLeftRight`,
`Ban`, `CircleOff`, `Gamepad2`, `Megaphone`, `Mail`, `MessageSquare`,
`Plug`, `Stethoscope`, `GitBranch`, `Hand`, `Disc`, `FlaskConical`,
`RotateCcw`, `TrendingDown`.

`💸` (no single movement mark, ambiguous direction — the reason it had
stayed emoji through three earlier slices) took `Banknote`, a
direction-neutral cash mark, closing that long-standing gap everywhere
it appeared. `🎡` (no wheel mark) took `Disc` — a spinning-disc
abstraction for "Ruleta," not `FerrisWheel`, which exists in the set but
would tell the reader something untrue (a fairground ride, not a casino
wheel).

## Left behind, with line and reason

**`App.jsx` — 1 use, 1 distinct** (line 976): `⚽`, the `ScreenPrematch`
sport-list "Cargando…" placeholder — backend-supplied data (`s.icon`
from `d.sports[]`), not this file's own literal; mapping only the
placeholder would make it look different from every real sport's icon.

**`Web.jsx`, `Box.jsx` — 0.** Both files are now emoji-free; neither has
canvas, print, or share-text code to carve an exception for.

**`Agencia.jsx` — 35 uses, 19 distinct** (lines 92, 94–97, 151, 154, 318,
2130, 2132, 2468, 2679, 2681, 2877, 2879, 3431, 3433, 4953, 6074, 7500,
8130–8131, 8291): the 24 "leaves the app" sites above; two `<option>`
contents (2468, 6074 — a native `<option>` renders only text); one code
comment (3431); two sites where the emoji sits inside a `{text, ok}`
`setMsg` call's own **text value** (3433, and Admin's 2273/4762) — the
render already draws `circle-check`/`triangle-alert` from `.ok`, but the
embedded glyph distinguishes *which* success happened (blocked vs.
unblocked, suspended vs. reactivated); turning it into an icon would
mean changing `text` from a string into a `ReactNode` for these specific
calls, a contract-shape change the brief protects (`msg.text` is read
as a string everywhere else in every screen); one embedded mid-message
aside, not a leading prefix (7500); and the plain-string
`setOkMsg`/`setErr`/`setRespuesta` calls outside the `{text, ok}`
contract's named scope (2130, 2132, 2679, 2681, 2877, 2879, 4953) — the
same exclusion the player, site and agency slices already used.

**`Admin.jsx` — 23 uses, 7 distinct** (lines 464, 497, 1562, 2270, 2273,
4565, 4758, 4762, 5130, 5498–5499, 5998–5999, 6154–6155, 8922, 8927–8928,
10150, 11114): a `placeholder` attribute (464, same non-JSX-renderable
category as an `<option>`) and two `<option>` contents (497, 1562); two
code comments (2270, 4758); the same `{text, ok}`-text-value case as
Agencia's (2273, 4762, and 10150 — a Súper Bono payout message); one
embedded mid-message aside (4565); one batch-result summary (8922 is
the comment explaining it, 8927–8928 are the code) where each item's
own `✅`/`⚠️` is **content** — which integration succeeded and which
didn't — not decoration, so collapsing it to a single leading icon would
lose information the outer `ok` flag can't carry; and the plain-string
`setMsg`/`setAnalisis` calls outside the contract's scope (5130, 5498–
5499, 5998–5999, 6154–6155, 11114).

**Total left behind: 59 uses, 33 distinct**, all accounted for: 24 leave
the application, 5 sit in non-JSX-renderable attributes, 3 are code
comments, 6 sit inside a `{text, ok}` contract's protected text value,
2 are embedded mid-message asides, 3 form one batch-result summary, and
16 are plain-string status setters outside the contract's named scope.
None is "no icon exists" — every remaining glyph either cannot host a
React element, or sits inside a value this task's constraints protect.

## T4 — the refresh button

Six sites drew a bare icon or a word-only "Actualizar" before this
task; the shape now used everywhere is `"↻ Actualizar"` — the exact
text `CombosIA` already used (a typographic `↻`, not the `🔄` emoji, so
it never counted against the emoji ceiling and needed no new import):

- `App.jsx` `ScreenLive`'s `fetchLive` button — bare `🔄`, now
  `"↻ Actualizar"`.
- `Agencia.jsx` `EnVivo`'s `fetchLive` button — bare `🔄`, now
  `"↻ Actualizar"`.
- `Agencia.jsx`'s reservas-esperando-pago refresh (`cargarReservas`) —
  bare `↻` with no word; found only by reading the code, since it
  already used the typographic character and so the five the emoji
  search found were never going to include it.
- `Agencia.jsx` `HistorialCashout` and `Historial` — "Actualizar" only.
- `Admin.jsx` `TabDiag` and `TabRiesgo` — "Actualizar" only.

`Agencia.jsx`'s `CombosIA` (the reference) and `AsesorAgencia`'s
"🔄 Analizar mi negocio" were left as they were: the first is the
source of the shape, unchanged; the second re-runs an AI analysis, not
a refresh of the current view, so it kept its own words and only traded
its emoji for `RefreshCw`. `Admin.jsx`'s `AsignarAgenciaAdmin`
("🔄 Cambiar de agencia") and `TabBonos`'s per-row reset button
similarly traded their glyph for an icon (`RefreshCw`, `RotateCcw`)
without joining the shared shape — neither is "reload the current
list," one switches an account's linked agency and the other resets a
single bonus's rollover.

## A verification gap this task found

Neither this project's ESLint invocation (`--no-eslintrc`, no React
plugin, so `no-undef` does not resolve a JSX tag like `<Foo/>` to the
`Foo` binding) nor its test suite (every guard reads these five files as
text via `fs.readFileSync`; nothing imports or renders them) catches an
icon name used in JSX but missing from its `lucide-react` import —
confirmed by deliberately removing one already-working import and
re-running both `eslint` and `react-scripts build`: both stayed green.
A scratch script (`jsxcheck.js`, diffs capitalized JSX tag usages
against every binding the file itself provides) caught two real misses
in `Agencia.jsx`'s T2 commit (`Bell`, `Moon`, used but not imported),
fixed in `06addc9` before T3 started. Every file's final state passed
this check with zero unbound tags (`App.jsx` has one benign false
positive, `QPLogo`, which appears only inside a comment, not JSX).

## Checks — exact observed results

- **Baseline** (before any edit): `CI=true npx react-scripts test
  --watchAll=false` — `41 suites passed, 41 total; 730 tests passed,
  730 total; 3.808s`.
- **After every commit** (T1 through T4, and the Bell/Moon fix): full
  suite stayed `41 suites passed, 41 total; 730 tests passed, 730
  total` — no test count changed, because this pass touched no new
  guard tests beyond `appEmojiCeiling.test.js`'s own thresholds and
  `boxIcons.test.js`'s rewrite (see below).
- **Guard ceilings, lowered and verified red against the pre-fix source
  each time** (`appEmojiCeiling.test.js`): App.jsx 52→1, Web.jsx 32→0,
  Box.jsx 9→0 (all three verified together against `ff6d8eb`'s source:
  `FAIL`, 6 of 11 sub-tests red, `Received: 33/25`, `26/24`, `9/9`);
  Agencia.jsx 157→35, 56→19 (verified against `edd5d32`'s source:
  `Received: 144/56`); Admin.jsx 299→23, 70→7 (verified against
  `18974d4`'s source: `Received: 208/70`).
- **`boxIcons.test.js`** rewritten: its `AWAITING_AN_ICON` map (9
  entries the earlier slice left behind) is gone — those nine glyphs
  moved into `REPLACED`, and the file now asserts `emojiIn(box)` equals
  `{}`.
- **ESLint**, project ruleset, all five files together: no output, exit
  code 0 — after every commit, and understood per "a verification gap"
  above to not by itself prove every JSX reference resolves.
- **`jsxcheck.js`** (this task's own addition, not a project guard):
  zero unbound capitalized JSX tags in all five files, final state.
- **Production build**, staging placeholders, `ff6d8eb` (before) vs
  `20fe416` (after, this branch's HEAD): `main.js` gzip **283.03 kB →
  290.39 kB, +7.36 kB**. Per commit: T1 +2.65 kB (16 new icons across
  three files), T2 +2.52 kB (27 new names, ~20 not already in the
  bundle), the Bell/Moon fix +0.49 kB (two names newly pulled in), T3
  +1.69 kB (50 new names, most already in the bundle from T1/T2 and
  reused, a handful genuinely new — `ArrowLeftRight`, `Ban`, `Disc`,
  `FlaskConical`, `Gamepad2`, `GitBranch`, `Hand`, `Mail`,
  `MessageSquare`, `Plug`, `RotateCcw`, `Stethoscope`), T4 +14 B (text
  only, no new import). **This is more than "a couple of kB"**: ~55
  distinct new `lucide-react` icon components entered the bundle across
  the four tasks, each with its own SVG path data.

## Review assess — exact outcomes

- **After T1** (`base-ref staging`, `edd5d32`): `risk: medium`
  (`executable_change` on `App.jsx`), `changed_lines: 479`,
  `review_due: true`, `review_due_reason: "slice_budget_reached"`.
  Returned `next_transition.command`:
  `gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true`.
  Not run — the consent envelope belongs to the owner.
- **After T2** (`base-ref edd5d32`, `18974d4`): `risk: medium`,
  `changed_lines: 190`, `review_due: false`,
  `review_due_reason: "under_budget"`.
- **After T3** (`base-ref 18974d4`, `d85fa29`): `risk: medium`,
  `changed_lines: 313`, `review_due: false`,
  `review_due_reason: "under_budget"`.
- **After T4** (`base-ref d85fa29`, `20fe416`): `risk: medium`,
  `changed_lines: 6`, `review_due: false`,
  `review_due_reason: "under_budget"`.

Only T1 crossed the budget. Its `next_transition.command` above is
still the one to run if review is picked up, since no later assess
returned a different one.

## What this suite does not cover

This project's tests never render a component — every guard reads
`App.jsx`/`Web.jsx`/`Box.jsx`/`Agencia.jsx`/`Admin.jsx` as text. Nothing
here confirms an icon *looks* right, that a row still lines up, that an
`aria-hidden`/accessible-name choice reads correctly to a screen reader
in practice, or that a layout didn't shift by a pixel where an emoji's
font metrics differed from an SVG's. `jsxcheck.js` closes one specific
gap (a JSX tag with no binding) that ESLint and the test suite both
miss here, but it is a name-resolution check, not a rendering one.

## Delivery

One commit per task on `feat/quartzplay-finish-icons`, off `staging`,
plus one small follow-up fix commit for T2. Assessed after each; T1's
review is due and unactioned, the rest are under budget.

## Progress

T1, T2, T3 and T4 done. Working tree clean. Every screen in the product
has now been through the emoji-to-icon migration, twice for Admin and
Agencia (an earlier slice, then this one retiring the row rule).

## Next step

None for this pass. T1's review is still outstanding — the
`next_transition.command` above is the one to run if it is picked up.
