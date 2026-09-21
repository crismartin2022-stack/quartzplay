# The chrome the player actually touches

Eleven defects reported from screenshots over one session, plus one new
feature. Grouped here because they share `App.jsx` and would otherwise
collide.

## T1 — The document never declared a text colour

**Root cause of a whole class of bugs.** `aplicarTema()` paints
`document.body.style.background` and nothing else. No stylesheet declares a
colour for the document either. So any element that does not set its own
colour inherits the **browser default — black** — on a near-black background.

`Icon` defaults to `color: "currentColor"`, which is correct: an icon should
take the colour of the text it sits beside. But with no colour anywhere up the
tree, `currentColor` resolves to black.

**329 icons across the product have no explicit colour.** Most look right by
luck, because some ancestor happens to set one. The ones that do not are the
reported black camera in the scanner and the black ticket in the empty state
of Boletos, and there is no reason to believe those are the only two.

Fix: `document.body.style.color = Q.text` in `aplicarTema()`, in all three
files that define it (`App.jsx`, `Web.jsx`, `Box.jsx`). One line each; it
removes the class, not the two instances.

## T2 — `GCard`'s glow draws a square bar on a rounded card

`GCard` with a `glow` prop renders a 2px gradient bar at
`position:absolute; top:0; left:0; right:0` over a card with
`borderRadius:12` and `overflow:visible`. The bar cannot follow the corner
and cannot be clipped, so it juts out at both top corners.

Reported three times from different screens — the profile card, the live
event cards, the violet panels — because **all 30 `glow` call sites share the
component**.

Owner's decision, verbatim: *"No nos compliquemos quiero un borde simple,
conservando el color que corresponda."* So: delete the bar, keep
`border: 1px solid ${glow}55`.

## T3 — Four small ones

- **The avatar beside the balance shows a dot.** `{ini||"·"}` renders the
  user's initial, or a middle dot when the account has no name. It should
  render a person icon instead.
- **The ✕ that removes an image is an oval.** It declares `width:18`,
  `height:18` and a round border but no `padding`, so the browser's default
  button padding deforms it.
- **The bottom bar disappears on the Builder tab.** The builder's cart is
  `position:fixed; bottom:0; zIndex:50`, so it covers the bar rather than
  sitting above it. The bar is `68px + env(safe-area-inset-bottom)` tall since
  the last chrome fix; the cart should start there.
- **`🛠️ Bet Builder`** still carries its emoji.

## T4 — The emoji the row rule had protected

Reported on three screens: the Desafíos tab row (`🔥 Muro`, `➕ Desafiar`,
`📋 Mías`, `🌑 IACOIN`) and its `👋` empty state; Perfil's `💸 Retirar` and
`🔗 Vincular cuenta`; and the `🔔` in the help chat's header.

These were deliberately left behind: the row rule says a row of related items
migrates whole or not at all, and some of them had no equivalent in the local
set. **The owner has now asked for them specifically**, which changes the
answer: add the missing marks from `lucide-react` and migrate the rows whole.

That is a real reversal of an earlier decision, made by the person who owns
the product. Record it as such rather than pretending the rule changed.

## T5 — The bottom bar carries six items, and Ayuda moves into it

Today: two items, Bet Best, two items. Requested: **three each side.**

- Left: Deportes, Builder, Desafíos
- Centre: Bet Best
- Right: Boletos, Ayuda, Perfil

The floating Ayuda bubble is removed. `BotonAyuda` currently owns both its
trigger and its modal through its own `abierto` state; it becomes controlled —
the parent holds the state, the nav item opens it, and the component renders
only the modal.

## T6 — A floating betslip on sport screens

Requested feature. If a player picks selections and leaves before placing the
bet, a floating element shows how many events are in the slip; tapping it
returns to the bet summary. **Not on casino screens.**

This is cheaper than it looks: `builderPicks` already lives in the root
component, not in the builder screen, so the picks already survive navigation.
Nothing persists them today because nothing shows them.

Show when `builderPicks.length > 0` and the screen is not `casino`,
`casinovivo` or `builder` itself — casino because the owner said so, builder
because the player is already looking at the slip. Tapping navigates to
`builder`. It takes the corner the Ayuda bubble is vacating, so the two never
compete.

## Constraints

- Nothing else changes: no copy, no layout, no colour beyond what each item
  above requires.
- `aplicarTema` keeps its current shape; it gains one declaration.
- Do not reshape the `{text, ok}` message contract.
- New `lucide-react` names are expected in T4 and T5. Name each one in the
  report — the import-shape guard exists so every added dependency is a
  deliberate act, and it must be updated to name them, never loosened.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard per behaviour that can regress: the document colour, the absence of
  the glow bar, the nav's six items, the betslip's visibility rule.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.

## Tasks

- [x] **T1** The document declares its text colour. (`aca7555`)
- [x] **T2** `GCard`'s border is a border. (`dc67fcb`)
- [x] **T3** Avatar, ✕, builder cart, Bet Builder emoji. (`560ab7f`)
- [x] **T4** The emoji the row rule had protected. (`bb10d87`)
- [x] **T5** Six nav items; Ayuda moves in, the bubble goes. (`18564b8`)
- [x] **T6** The floating betslip. (`729dc23`)

## Delivery

One commit per task on `fix/quartzplay-player-chrome-batch`, stacked on
`fix/quartzplay-message-status-colour` because both edit `App.jsx` and that PR
is still open. Assess after each; hand the returned command back when review
is due.

## Progress

All six tasks implemented, one commit each, TDD strict (guard test written
first, observed RED, then the fix, then GREEN) on
`fix/quartzplay-player-chrome-batch`, stacked on
`fix/quartzplay-message-status-colour`.

Baseline (`CI=true npx react-scripts test --watchAll=false`, before any
change): 32 suites, 602 tests, all passing.

### T1 — `aca7555` — the document declares its text colour

`aplicarTema()` in `App.jsx`, `Web.jsx` and `Box.jsx` now also sets
`document.body.style.color = Q.text`, inside the same `try{}catch(e){}`.
Guard: `documentTextColour.test.js` — RED before the fix (3 failures, one
per file: the new `document.body.style.color = Q.text` assertion).
Reviewed the blast radius by hand (`rg` over all three files for literal
white/light backgrounds): the only bare `#fff` uses are `<img>`
backgrounds (QR codes) or already carry an explicit `color:`; accent
backgrounds (`Q.gold`, `Q.violet`, …) already run through the existing
`inkOn()` convention enforced by `screenHomeIconsAndAccents.test.js`. One
incidental repair found: `Box.jsx`'s "¡Tu apuesta está lista!" heading and
its picks list had no explicit colour either — they were black-on-dark
(effectively invisible) before this fix, same root cause as the two
reported symptoms, now visible.

### T2 — `dc67fcb` — `GCard`'s border is a border

Deleted the 2px absolute-positioned glow bar; the border already carried
`glow?glow+"55":Q.border`, so no other change was needed. Guard:
`gCardGlowBorder.test.js` — RED before the fix (2 of 4 failures: bar
still present). All 30 `glow=` call sites checked for a `style`-prop
`border` override that could hide the colour once the bar was gone: none
found, so every glow card (profile card, live cards, violet panels, IACOIN
buy/sell, withdrawal/link boxes, bet confirmation cards, …) now shows a
single coloured border where it used to show a border plus an
overhanging bar.

### T3 — `560ab7f` — avatar, ✕, builder cart, Bet Builder emoji

- Avatar: `{ini||"·"}` → `{ini ? <span>{ini}</span> : <User size={16}
  color={inkOn(Q.violet,Q.violet2)}/>}`. Only the no-name fallback
  changes; the initial still renders when the account has one.
- ✕ button (image removal): added `padding:0`.
- Builder cart: `bottom:0` → `bottom:"calc(68px + env(safe-area-inset-bottom))"`,
  matching `BarraInferior`'s own height exactly.
- `🛠️ Bet Builder` → `Bet Builder`. No substitute icon: `docs/icon-inventory.md`
  lists 🛠️ as "none — no tools" for the whole product, and
  `boxIcons.test.js` documents the same emoji on Box.jsx as intentionally
  left (an approximation would be worse than the gap).
- Added `User` to the `lucide-react` import; updated
  `screenHomeIconsAndAccents.test.js`'s import-shape guard to name it.

Guard: `playerChromeSmallFixes.test.js` — RED before the fix (9 of 11
failures).

### T4 — `bb10d87` — the emoji the row rule had protected

Desafíos tab row → `{k, icon, l}` objects: Muro takes `<Flame/>`, IACOIN
takes `<Coins/>`; Desafiar and Mías reuse the local `Icon` set (`plus`,
`clipboard-list` — no new dependency). The row's `👋` empty state reuses
`Handshake`, already imported. Perfil's `💸 Retirar` (both states) reuses
the local `wallet-cards` icon. `🔗 Vincular cuenta` (both states) takes
`<Link/>`. The help chat header's `🔔`/`🔕` toggle becomes a single
`<Bell/>`; the on/off state is still carried by the existing
`opacity:sonido?1:0.4`.

Added `Flame, Coins, Link, Bell` to the `lucide-react` import (alongside
`User` from T3); updated the import-shape guard again.

Guard: `rowRuleEmojiMigration.test.js` — RED before the fix (12 of 16
failures).

### T5 — `18564b8` — six nav items, Ayuda moves in

`BarraInferior`'s `items` grew from 4 to 6: `prematch/builder/desafios`
left, `mybets/ayuda/cuenta` right, grid `repeat(5,1fr)` →
`repeat(7,1fr)`. "Perfil" reuses the existing `ICONOS.cuenta` (a person
silhouette already in the local nav-icon set) — its `k` is literally
`"cuenta"`, the real screen id, so no new icon or indirection was needed.
"Ayuda" adds one local `ICONOS.ayuda` entry (the same question-mark-in-
circle path `Icon.jsx`'s `circle-help` already draws) rather than a
lucide import, matching the fact that every other `BarraInferior` icon is
already a local raw path, not from `Icon.jsx` or `lucide-react`. The
`Item` button routes `"ayuda"` to a new `onAyuda` prop instead of `onNav`.

`BotonAyuda` is now controlled: dropped its own `useState`, takes
`abierto`/`onCerrar` props, and its body is only the chat modal — the
floating trigger button and its `{!abierto&&…}` branch are gone. Enumerated
every read of the old `abierto` state (2 conditional renders + 3
set-state call sites) and confirmed each has a controlled-props
equivalent; `rg 'setAbierto'` after the change shows only unrelated local
`abierto` state in other components (`RetiroBox`, `VincularBox`, …).

Guard: `bottomNavSixItems.test.js` — RED before the fix (9 of 11
failures).

### T6 — `729dc23` — the floating betslip

New `BurbujaBetslip({ count, onAbrir })`, styled identically to the old
Ayuda trigger's position (`right:14, bottom:"calc(84px + env(safe-area-
inset-bottom))", zIndex:150`) — the corner it vacated. Mounted when
`builderPicks.length>0 && !["casino","casinovivo","builder"].includes(screen)`;
tapping calls `onAbrir={()=>setScreen("builder")}`. Also removed a stale
Spanish comment left on `BotonAyuda` from before T5 ("botón flotante...
abajo a la izquierda") that no longer described the component.

Guard: `floatingBetslip.test.js` — RED before the fix (8 of 8 failures).

### Checks (final state, all six tasks applied)

- `CI=true npx react-scripts test --watchAll=false`: **38 suites, 667
  tests, all passing** (baseline was 32/602; net +6 suites/+65 tests, all
  new guards).
- `npx eslint src/App.jsx src/Web.jsx src/Box.jsx --no-eslintrc --env
  browser,es2021 --parser-options
  ecmaVersion:2021,sourceType:module,ecmaFeatures:{jsx:true} --rule
  '{"no-undef":"error"}'`: clean, no output, on every commit and at the
  end.
- Production build (`CI=true REACT_APP_ENV=staging` + placeholder staging
  URLs, `npx react-scripts build`): compiled successfully both before and
  after. Gzip `main.js`: **285.59 kB → 286.3 kB** (+~0.71 kB), measured
  from a clean build of `df8358e` in a throwaway `git worktree` against a
  clean build of the final commit — the five new `lucide-react` icons
  (`User`, `Flame`, `Coins`, `Link`, `Bell`).

### Native review (`gentle-ai review assess`)

Base ref throughout: `fix/quartzplay-message-status-colour`,
`--committed-only`. Risk stayed `medium` every time (reason:
`executable_change` on `App.jsx`).

| After | changed_lines | review_due | reason |
|---|---|---|---|
| T1+T2 (assessed together — first assess call was made after both were committed) | 257 | false | under_budget |
| T3 | 382 | false | under_budget |
| T4 | 557 | **true** | slice_budget_reached |
| T5 | 733 | **true** | slice_budget_reached |
| T6 (final) | 847 | **true** | slice_budget_reached |

Once `review_due` turned true after T4, no further review-pipeline
command was run — per this task's explicit instruction, the consent
envelope belongs to the owner. The returned command, unchanged since T4,
still applies at the final state:

```
gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=fix/quartzplay-message-status-colour --committed-only=true
```

## Next step

Hand back to the owner: run the `gentle-ai review status` command above
(review is due — `slice_budget_reached`, 847 changed lines against the
stacked base), then decide push/PR. No further implementation work is
pending on this feature.
