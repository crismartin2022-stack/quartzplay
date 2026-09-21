# The panels get one standard, and room to breathe

Five things the owner reported after using the new sidebar on a monitor.

## 1. The agency's tabs carry their icon in the wrong place

Admin's tab list keeps them apart:

```js
{k:"agencias", i:<Building2 size={17}/>, l:"Agencias"}
```

so its button can place a gap between the icon and the word. Agency's packs
both into one value:

```js
{k:"clientes", l:<><Icon name="users" size={12}/> Clientes</>}
```

There is nowhere to put a gap, so the icon sits against the word — and
**ten of its tabs have no icon at all**, because there was no slot to put
one in: `Código / Bot`, `Apuesta manual`, `Historial`, `Cierres`, `Mensajes`,
`Terminales`, `Desafíos`, `Asesor`, `Soporte`, `Config`.

The owner asked for admin's standard. That means splitting agency's list into
`i` and `l`, giving every tab an icon, and letting the button space them.

## 2. The sidebar buttons touch the edge

Admin's do not. Match its padding.

## 3. The agency header is squashed

Its top bar clips its own contents vertically. The balance, the agency name
and its code are cut off mid-letter. Give it the height its content needs.

## 4. The content is capped at 620px — in both panels

```js
<div style={{padding:"16px 12px", maxWidth:620, margin:"0 auto"}}>
```

This is the "mobile inside desktop" the owner is describing. It is not that
the content does not know how to spread: it is **forbidden** from passing
620px, on a 1600px shell, next to a 264px sidebar. Everything to the right of
it is empty on purpose.

Raise the cap on desktop so the content uses the room. Below 1024 it stays
exactly as it is.

**Be honest about what this does and does not achieve.** A wider column is
not a distributed layout: a stack of cards at 1200px is still a stack. Real
distribution means two-column arrangements chosen per screen — a form beside
its preview, a list beside its detail — and that is design work per screen,
not a number in one place. This is the first step and it should be described
as one.

Pick the cap deliberately. Long text lines are harder to read, not easier;
the prototype caps its own panels for that reason. Say which number you chose
and why.

## 5. The logo is tiny

In the login screens and in both panels' top bars. The prototype's sidebar
brand is 82px wide. Ours is far smaller. Make it bigger, and say what each
call site uses now and after.

## Scope

Authorized: `frontend/src/Agencia.jsx`, `frontend/src/Admin.jsx`, and test
files.

Out of scope: the per-screen multi-column work described under point 4, and
anything inside a panel's content beyond the width it is allowed to use.

## Constraints

- **Below 1024px nothing changes**, exactly as the shell slice held. Same
  proof required: mobile style objects byte-identical, or an explanation.
- One `TABS` array per panel still feeds both shapes. Do not fork it.
- Agency's new icons come from `Icon.jsx` first, `lucide-react` second, and
  every new lucide name is named in the report.
- Do not redesign panel content. Widen what it may occupy; leave what it is.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that agency's tab list separates icon from label and that every tab
  has an icon, with a positive control.
- `jsxTagsAreBound.test.js` must still pass — new icons mean new imports, and
  that guard is the only thing between a missing one and a blank screen.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.

## Tasks

- [x] **T1** Agency's tabs split icon from label; the ten without one get one.
  Commit `28601c2`.
- [x] **T2** The sidebar buttons and the agency header get their spacing.
  Commit `8b3edda`.
- [x] **T3** The content cap rises on desktop, in both panels.
  Commit `590f55c`.
- [ ] **T4** The logo grows, in the logins and both top bars. Not started —
  review is due before this task (see "Next step").

## Delivery

One commit per task on `fix/quartzplay-panel-polish`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

### Baseline (before any change)

`CI=true npx react-scripts test --watchAll=false` from `app/frontend`:
**46 suites, 782 tests, all passing.**

### T1 — `Agencia.jsx` (commit `28601c2`)

Agency's `TABS` (`:7961`, confirmed unchanged from the plan's line number)
packed icon and label into one `l` value (`l:<><Icon.../> Clientes</>`),
so the button had nowhere to put a gap, and ten tabs — Código/Bot, Apuesta
manual, Historial, Cierres, Mensajes, Terminales, Desafíos, Asesor,
Soporte, Config — had no icon at all. Split every entry into `i`/`l`,
matching Admin's own TABS shape (`Admin.jsx:6877`), and gave the ten
iconless tabs an icon:

| Tab | Icon | Source |
|---|---|---|
| codigo (Código / Bot) | `Bot` | lucide-react, already imported |
| manual (Apuesta manual) | `Pencil` | lucide-react, already imported |
| historial (Historial) | `clock-3` | `Icon.jsx` |
| cierres (Cierres) | `chart-no-axes-combined` | `Icon.jsx` — same icon Admin already uses for its own "Cierre" tab |
| mensajes (Mensajes) | `message-circle` | `Icon.jsx` |
| terminales (Terminales) | `Monitor` | lucide-react, already imported |
| desafios (Desafíos) | `trophy` | `Icon.jsx` |
| asesor (Asesor) | `Handshake` | lucide-react, already imported |
| soporte (Soporte) | `Headphones` | lucide-react, already imported |
| config (Config) | `sliders-horizontal` | `Icon.jsx` — same icon Admin already uses for its own "Config" tab |

Every one of the five lucide names was already in Agencia.jsx's own
`lucide-react` import line before this change — **no new lucide import
was added**, so there was nothing for `jsxTagsAreBound.test.js` to catch
here (it still ran, and still passed).

The button's render changed from `{t.l}` to
`{t.i}<span style={{marginLeft:SPACING[8]}}>{t.l}</span>` — this
reproduces the previous icon-then-space-then-text look for the eight
tabs that already had one (same visual gap, now via `marginLeft`
instead of an incidental JSX whitespace character) and adds the same
treatment for the other ten. This line is shared by both the mobile row
and the desktop sidebar (one `TABS` array feeds both, per the
constraint) — mobile now shows icons for all 18 tabs instead of 8,
which is the fix, not a regression: the reported defect (no icon slot)
existed structurally in the shared list, not only at desktop width.

**Guard**: `agencyTabsIconLabelSplit.test.js`, written first. Run against
unmodified `Agencia.jsx`: **4 of 6 tests failed** (missing `i:` field, `l:`
still packing JSX, plain-string check, and the new render pattern) — the
other 2 (the 18-keys check and the positive control) already passed since
nothing had changed. After the edit: all 6 pass.

Suite after T1: 47 suites, 789 tests, all passing.
ESLint (`Agencia.jsx`, `no-undef`-only ruleset): exit 0, no output.

### T2 — `Agencia.jsx` (commit `8b3edda`)

Two reports, both desktop-only:

- **"The sidebar buttons touch the edge. Admin's do not."** Verified
  first rather than assumed: the sidebar container's padding
  (`${SPACING[24]}px ${SPACING[12]}px`, i.e. 24px/12px) and the button's
  own padding (`0 12px`) were already byte-identical between
  `Agencia.jsx:8032`/`8048` and `Admin.jsx:14361`/`14377` — there was no
  padding-number difference to copy. The actual gaps, found by diffing
  the two desktop button style objects property by property: Admin's
  button has `minWidth:0` (Agencia's did not — without it, a flex item's
  own content can refuse to shrink below its intrinsic width and get
  pushed past the sidebar's inner edge), and Admin's inactive tab border
  is `1px solid transparent` where Agencia's was `1px solid ${Q.border}`
  — an always-visible outline on all 18 stacked buttons, which is what
  actually reads as "boxed in against the edge" next to Admin's
  borderless list (identical box geometry either way, since a 1px border
  is reserved in both cases — this is a colour/visual-weight difference,
  not a layout one). Both now match Admin's desktop button exactly.
- **"The agency header is squashed."** The topbar (`Agencia.jsx:7999`)
  had no explicit height and relied on implicit auto-sizing around its
  two-line balance/name/code block. It now declares `minHeight:64` on
  the desktop branch only — sized to comfortably fit the 40px logo (see
  T4) plus its 12px top/bottom padding. Admin's topbar carries only
  single-line content and was not reported as squashed, so it was left
  alone in this commit (see T4 for why it needed the same treatment once
  its own logo grew).

**Evidence the mobile path is untouched**: `panelPolishSpacing.test.js`
asserts the mobile topbar style (no `minHeight`, same `12px 16px`
padding), the mobile nav button style (`Q.border`-coloured border, no
`minWidth`), and the mobile nav container style (`8px 12px` padding) all
still appear verbatim, each with a positive control. `git diff
6ba34c4..8b3edda -- frontend/src/Agencia.jsx` shows only the `minWidth:0`
line added, `Q.border`→`"transparent"` in the `: {…}` desktop border
value, and `minHeight:64` added — every change sits inside an
`isDesktop ? {…}` branch; no `: {…}` (mobile) branch value changed.

Guard written first, run against T1's `Agencia.jsx`: **3 of 8 tests
failed** (`minWidth:0` missing, border still `Q.border`-coloured,
`minHeight` missing) — the other 5 (Admin reference check and the four
mobile-untouched checks) already passed. After the edit: all 8 pass.

Suite after T2: 48 suites, 798 tests, all passing.
ESLint (`Agencia.jsx`): exit 0, no output.

### T3 — `Agencia.jsx`, `Admin.jsx` (commit `590f55c`)

Both panels capped their content at `maxWidth:620` unconditionally — on
a shell up to 1600px wide next to a 264px sidebar, this is the "mobile
inside desktop" the owner described. `Agencia.jsx:8078`'s content
wrapper had **no `isDesktop` branch at all** (a single shared style
object for both widths); it needed one added to raise the desktop cap
without touching mobile. `Admin.jsx:14337` already branched on
`isDesktop` — only the desktop branch's `maxWidth` value changed.

**The number chosen: 1100px, for both panels, deliberately not
maximised.** Reasoning:

- This is a wider single column, not a two-column distributed layout.
  Real distribution (a form beside its preview, a list beside its
  detail) is design work per screen and is explicitly out of this
  slice's scope; raising a `maxWidth` number cannot produce it, and 1100
  is not being sold as more than what it is — a stack of cards is still
  a stack at 1100px.
- Long text lines are genuinely harder to read, not easier — the
  prototype caps its own panels for the same reason. 1100px leaves
  roughly 118px of breathing room on each side of the ~1336px column
  available next to the 264px sidebar on the prototype's own 1600px
  shell, rather than stretching content edge to edge.
- One number for both panels, not two: both panels were already capped
  at the identical 620 before this change and share the same
  card/table/form vocabulary (`GCard`-based lists, forms, tables) —
  nothing about either panel's actual content argues for a different
  number. If a specific screen later needs more room (a table, say),
  that is a per-screen decision for later work, not a reason to split
  this shell-level number now.

**Evidence the mobile path is untouched**: `panelContentCap.test.js`
asserts both panels' mobile content wrapper (`maxWidth:620`, same
padding/`paddingBottom` values) still appears verbatim, with a positive
control on Admin's. `git diff 8b3edda..590f55c` shows only the two
desktop-branch `maxWidth` values changing from 620 to 1100, plus the new
`isDesktop ? {…} : {…}` wrapping added around Agencia's previously
unbranched content div — the wrapped mobile branch is byte-identical to
what the unbranched object was before.

Guard written first, run against T2's source: **3 of 6 tests failed**
(Agencia's wrapper had no `isDesktop` branch yet, Admin's desktop
`maxWidth` was still 620, and the "Agencia mobile wrapper unchanged"
check — which requires the `} : {` shape that did not exist yet) — the
other 3 (the positive control and Admin's two mobile-untouched checks)
already passed. After the edit: all 6 pass.

Suite after T3: **49 suites, 805 tests, all passing.**
ESLint (`Agencia.jsx`, `Admin.jsx`): exit 0, no output, both files.

### Checks so far

| Check | Result |
|---|---|
| `CI=true npx react-scripts test --watchAll=false` (after T3) | 49 suites, 805 tests, all passing |
| `eslint Agencia.jsx --no-eslintrc --env browser,es2021 ... --rule no-undef:error` | exit 0, no output |
| same, `Admin.jsx` | exit 0, no output |
| `jsxTagsAreBound.test.js` | passing (part of the 805) |
| Production build, bundle size | not yet run — deferred until after T4, see "Next step" |

### What could not be checked here

Same limitation as `desktop-shell.md`: nothing here renders
`Agencia.jsx` or `Admin.jsx`. No test shows the sidebar buttons no
longer look boxed-in, that the agency header actually breathes at
64px, or that the content reads well at 1100px — only that the right
source values are present and that every mobile-branch style object is
byte-identical to what shipped before. Staging still needs a look on a
real monitor.

### Assess outcomes

| After | `risk` | `changed_lines` | `review_due` | `review_due_reason` |
|---|---|---|---|---|
| T1 (`28601c2`) | medium | 233 | false | `under_budget` |
| T2 (`8b3edda`) | medium | 332 | false | `under_budget` |
| T3 (`590f55c`) | medium | 413 | **true** | `slice_budget_reached` |

## Next step

**Review is due before T4 starts** (413 changed lines against the
`staging` boundary, over the ~400-line delivery budget). The returned
`next_transition.command`, to hand back to the owner rather than run:

```
gentle-ai review status '--cwd=/Users/usuario/Documents/Trabajo 2026/iaqp/app' --contract=gentle-ai.review-integration/v2 --agent=claude-code --next-transition=true --base-ref=staging --committed-only=true
```

Once review clears (or is explicitly waived) for this slice, T4 — the
logo, in both login screens and both panels' top bars — is what's left.
Planned approach, not yet implemented: `QPLogo`'s `size` is a height in
px (`BrandMark.jsx`); the prototype's sidebar brand is 82px **wide**,
which at the logo's fixed 503:244 aspect ratio is `size={40}` — the
exact value `topBarLogoSize.test.js` already established independently
for `App.jsx`'s own top bar. Plan: `isDesktop?40:16` at both panels'
topbar `QPLogo` call sites (`Agencia.jsx:8007`, `Admin.jsx:14328`), and
a larger desktop-only size at both login screens
(`Agencia.jsx:834`, `Admin.jsx:189`) — those screens currently render
identically at every width, so growing them unconditionally would
change mobile too; each needs its own `useDesktopShellWidth()` call
added first. Growing Admin's topbar logo to 40px will likely need the
same `minHeight:64` treatment T2 gave Agencia's topbar, to avoid
introducing the same clipping bug there — to be confirmed against
Admin's actual content height when T4 is implemented.
