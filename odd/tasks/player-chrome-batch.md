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

- [ ] **T1** The document declares its text colour.
- [ ] **T2** `GCard`'s border is a border.
- [ ] **T3** Avatar, ✕, builder cart, Bet Builder emoji.
- [ ] **T4** The emoji the row rule had protected.
- [ ] **T5** Six nav items; Ayuda moves in, the bubble goes.
- [ ] **T6** The floating betslip.

## Delivery

One commit per task on `fix/quartzplay-player-chrome-batch`, stacked on
`fix/quartzplay-message-status-colour` because both edit `App.jsx` and that PR
is still open. Assess after each; hand the returned command back when review
is due.

## Progress

Not started.

## Next step

T1.
