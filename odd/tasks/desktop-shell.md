# The panels stop being a phone app stretched across a monitor

## The problem, in the owner's words

Reviewing the admin panel on a wide screen: *"sigue el formato de tablet"*.
Reviewing the agency panel: *"todos los menús están horizontales y se crea un
scroll"*. He guessed correctly that we had not reached it yet.

Both panels render in a narrow column with a horizontal, scrolling tab bar
**no matter how wide the screen is**. The people who use them — the owner's
own team and the agencies — work on computers, for hours. They are using a
phone layout on a monitor.

This is the largest remaining gap between the product and the prototype, and
the one with the most hours of human attention behind it.

## What the prototype does

`html/styles.css:1240` — at **1024px and above**:

```
.app        max-width 1600px, centred
            display grid, grid-template-columns 264px minmax(0, 1fr)
.topbar     display none
.bottom-nav becomes the sidebar: sticky, top 0, 264px wide, 100dvh,
            flex column, its own background, a right border
.nav-link   min-height 44px, left-aligned, icon then label in a row
```

The key move is that **it is the same navigation element**, not a second
component: the row becomes a column. Below 1024 nothing changes.

The sidebar also carries `.sidebar-brand` (the logo at 82px) and
`.sidebar-context`, which are hidden on mobile — that is why the top bar can
disappear: the sidebar takes over the brand and the context it used to show.

## What already exists here

`Web.jsx:4483` holds the pattern this codebase uses for width:

```js
const [ancho,setAncho]=useState(typeof window!=="undefined"?window.innerWidth>=1000:true);
```

with a `resize` listener. Reuse that shape rather than inventing another; move
it somewhere both panels can share it, and align the breakpoint to the
prototype's **1024**, not the 1000 that one screen happens to use.

Each panel has exactly one navigation to convert: `Admin.jsx:6876`'s `TABS`
array rendered at `:7027`, and `Agencia.jsx:7957`'s rendered at `:8019`. Both
draw a `display:flex` row with `overflowX:"auto"` — the scroll the owner saw.

## Scope

Authorized: `frontend/src/Admin.jsx`, `frontend/src/Agencia.jsx`, a shared
helper module if one is warranted, and test files.

Out of scope, and worth stating: `App.jsx` is the Telegram mini-app and is
always narrow; `Web.jsx` already handles width for its own layout; `Box.jsx`
is the cashier screen and may deserve this later, but nobody has asked.

Also out of scope: redesigning what is *inside* each panel. This changes the
shell — where navigation lives and how wide the content may be — and nothing
else. The content keeps its current layout inside a wider column.

## Constraints

- **Below 1024px nothing changes at all.** Same bar, same scroll, same
  everything. A regression on a phone is a worse outcome than not doing this.
- The same `TABS` array feeds both shapes. Do not fork the list.
- The sidebar shows the brand at the prototype's size; the horizontal bar
  does not grow one.
- Keep every tab reachable. A sidebar that needs its own scroll for eleven
  items is fine; one that hides items is not.
- The content column gets `max-width 1600px` and centres, as the prototype
  does. Do not let a table stretch to 3000px because a monitor is wide.

## Checks

- TDD: strict. Runner: `CI=true npx react-scripts test --watchAll=false` from
  `app/frontend`. Baseline first.
- A guard that both panels read a width and render two shapes from one tab
  list, with a positive control.
- ESLint on each touched file with the project's `no-undef`-only ruleset.
- A production build; report the bundle size before and after.

## What cannot be checked here

This project's tests never render a component. Nothing automated will show
whether the sidebar looks right, whether the content breathes at 1600px, or
whether anything breaks between 1024 and 1400. **Staging is the check**, and
it needs looking at on a real monitor and on a phone, because the phone path
is the one that must not move.

## Tasks

- [x] **T1** A shared way to ask whether the viewport is desktop-wide.
  Commit `c71632e`.
- [x] **T2** `Agencia.jsx`: the tab row becomes a sidebar at 1024 and up.
  Commit `ec4e2ec`.
- [x] **T3** `Admin.jsx`: the same. Commit `0f4fcba`.

## Delivery

One commit per task on `feat/quartzplay-desktop-shell`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

All three tasks implemented and committed. Line numbers drifted from the
plan but were re-verified before editing (see "What changed" below);
`Admin.jsx`'s nav also turned out to be a fixed-bottom 6-column icon grid
rather than the `overflowX:"auto"` row described in the plan — the row
shape only matched `Agencia.jsx`. Both panels now branch a single `TABS`
array's render on one shared `isDesktop` boolean instead of forking the
list.

### Baseline (before any change)

`CI=true npx react-scripts test --watchAll=false` from `app/frontend`:
**42 suites, 744 tests, all passing.**

### T1 — `frontend/src/desktopShellLayout.js` (commit `c71632e`)

Shared module, framework-free where possible (mirrors `cameraCaptureLogic.js`'s
pure-helpers-plus-hook shape):

```js
export const DESKTOP_SHELL_BREAKPOINT = 1024;
export function isDesktopShellWidth(width, breakpoint = DESKTOP_SHELL_BREAKPOINT) {
  return width >= breakpoint;
}
export function useDesktopShellWidth(breakpoint = DESKTOP_SHELL_BREAKPOINT) {
  // same useState(window.innerWidth) + resize-listener shape as Web.jsx's
  // `ancho`, aligned to 1024 instead of 1000, shared by both panels.
}
```

Guard: `desktopShellLayout.test.js` — a real behavioural test (no renderer
needed; the boundary is a pure function), asserting `isDesktopShellWidth`
at 1023 (false), 1024 (true), 1600 (true), 390 (false), and a custom
breakpoint override with two directions (positive control for the second
argument being read at all). Written first: failed with
`Cannot find module './desktopShellLayout'` before the module existed,
passed once it was added.

Suite after T1: 43 suites, 753 tests, all passing.

### T2 — `Agencia.jsx` (commit `ec4e2ec`)

`AgenciaPanel` (was `:7913`, `TABS` at `:7957`, nav render at `:8021` —
confirmed by `rg -n "TABS\.map\(" frontend/src/Agencia.jsx` before editing,
matching the plan's `:7957`/`:8019` region). Added
`const isDesktop=useDesktopShellWidth();`. Four style objects now branch
on `isDesktop` (outer shell, topbar, nav container, nav button); `TABS.map`
still called exactly once.

- **>=1024px**: outer shell becomes `display:"grid"`,
  `gridTemplateColumns:"264px minmax(0,1fr)"`, `maxWidth:1600`,
  `margin:"0 auto"`. The nav div becomes the sidebar: `gridColumn:"1"`,
  `gridRow:"1 / span 2"`, `position:"sticky"`, `top:0`, `width:264`,
  `height:"100dvh"`, `flexDirection:"column"`, `overflowY:"auto"` (so its
  18 items scroll inside the sidebar rather than hiding any), `borderRight`
  instead of `borderBottom`. Each button becomes `width:"100%"`,
  `minHeight:44`, `justifyContent:"flex-start"`, `textAlign:"left"` —
  the prototype's `.nav-link` geometry. Topbar and content wrapper get
  `gridColumn`/`gridRow` placement only.
- **<1024px**: every mobile style object is the exact pre-existing object
  literal, unchanged — see evidence below. The inner content div
  (`padding:"16px 12px",maxWidth:620,margin:"0 auto",...`) was not
  touched at all, at either width: it already caps reading width inside
  the (now wider) content column, matching "content keeps its current
  layout inside a wider column."

**Evidence the mobile path is untouched**: `agenciaDesktopSidebar.test.js`
asserts the original nav-row style (`padding:"8px 12px",display:"flex",
gap:SPACING[4],overflowX:"auto",...WebkitOverflowScrolling:"touch"`) and
the original button style (`padding:"8px 16px",...flexShrink:0,`) still
appear verbatim in `AgenciaPanel`'s source, with a positive control that
breaks the same check when the string is altered. `git diff` of the
mobile ternary branches shows only the `isDesktop ? {…} :` wrapping added
around byte-identical objects — no mobile-branch value changed.

Guard written first, run against unmodified `Agencia.jsx`: **5 of 10
tests failed** (missing import, missing hook call, `isDesktop ?` branch
count 0, no `maxWidth:1600`, no `264px` grid) — the other 5 (single
`TABS.map`, its positive control, and the three mobile-untouched checks)
already passed since nothing had changed yet. After the edit: all 10 pass.

Suite after T2: 44 suites, 764 tests, all passing.

### T3 — `Admin.jsx` (commit `0f4fcba`)

`AdminPanel` (`:14276`, `TABS` defined at `:6876` confirmed unchanged, nav
render at `:14349` — the plan's `:7027` was stale; re-verified with
`rg -n "TABS\.map\(" frontend/src/Admin.jsx` before editing). Same
`isDesktop` hook, same grid shell/topbar/content treatment as Agencia.

The mobile nav here is a **fixed-bottom, 6-column icon-over-label grid**,
not a scrolling row — the plan's "both draw a `display:flex` row with
`overflowX:auto`" only matched `Agencia.jsx`; `Admin.jsx`'s bar wraps to
two rows instead of scrolling. At >=1024px it becomes the same 264px
sticky sidebar shape as Agencia's: `flexDirection:"column"`, one item per
row, `minHeight:44`, and the button's internal layout flips from
`flexDirection:"column"` (icon over label, mobile) to `flexDirection:"row"`
(icon then label, desktop) — the one place a button's internal axis
actually had to change, because the mobile shape is icon-on-top by
design and the prototype's `.nav-link` is icon-then-label in a row.
Added a background/border active-state to desktop buttons (mobile relies
on a top indicator line instead, which is skipped on desktop via
`!isDesktop&&tab===t.k&&...` since a horizontal top line reads oddly on
a vertical list) — this is shell chrome (which tab is active), not a
panel redesign.

The desktop content wrapper drops the mobile's
`paddingBottom:"calc(140px + env(safe-area-inset-bottom))"` (reserved
space so content didn't sit under the fixed bar) down to a plain `40px`,
since the sidebar no longer overlaps content at that width; the mobile
branch keeps the exact original value.

**Evidence the mobile path is untouched**: `adminDesktopSidebar.test.js`
asserts the fixed-bottom/6-column grid style, the icon-over-label button
`flexDirection:"column"`, and the `140px` clearance all still appear
verbatim, plus that `TABS`'s eleven keys/order are unchanged (nothing
hidden from the sidebar). Positive control breaks the grid-column check
when the string is altered.

Guard written first, run against unmodified `Admin.jsx`: **5 of 12 tests
failed** (same shape as T2's guard — missing import/hook/branches/1600/264),
the other 7 (single `TABS.map` + control, all-11-tabs, and the three
mobile-untouched checks) already passed. After the edit: all 12 pass.

Suite after T3: **45 suites, 777 tests, all passing.**

### Checks (final)

| Check | Result |
|---|---|
| `CI=true npx react-scripts test --watchAll=false` | 45 suites, 777 tests, all passing |
| `eslint desktopShellLayout.js --no-eslintrc --env browser,es2021 ... --rule no-undef:error` | exit 0, no output |
| same, `Agencia.jsx` | exit 0, no output |
| same, `Admin.jsx` | exit 0, no output |
| `jsxTagsAreBound.test.js` | passing (part of the 777) — every new JSX tag used is bound |
| production build (staging placeholders) | Compiled successfully |

Bundle size (gzip, `main.*.js`), built at branch point `469704a` vs. after
all three tasks: **290.39 kB → 290.99 kB (+601 B / +0.2%)**. CSS bundle
unchanged (261 B).

### What could not be checked here

Nothing automated renders `Admin.jsx` or `Agencia.jsx`. No test here shows
the sidebar actually looks right, that content breathes at 1600px, or that
nothing breaks between 1024 and 1400px — only that the right style values
are present in source and that the mobile-branch objects are byte-identical
to what shipped before. Staging still needs a look on a real monitor and a
real phone.

### What deviated from the prototype's literal rules, and why

- `.topbar { display: none }` — **not implemented.** The task's own scope
  ("each panel has exactly one navigation to convert") and constraint
  ("do not redesign anything inside a panel") point at converting only
  the `TABS` row; the topbar in both panels carries functional controls
  (Salir, Saldo, agency name/code, the ADMIN badge) that the prototype's
  hidden topbar assumes are replaced by `.sidebar-brand`/`.sidebar-context`
  — neither of which exists in this codebase. Hiding the topbar without
  building replacements would have silently removed the logout/balance
  controls at desktop widths, which is a functional regression, not a
  shell change. The topbar stays visible and gets grid placement only.
- `.nav-link.active { background: #18250c }` — **not implemented.** That
  hex isn't part of this codebase's `Q` theme tokens anywhere else. Kept
  the app's existing active-tab gradient (`Q.violet`/`Q.cyan`) instead of
  hard-coding an unthemed one-off color.
- Icon-then-label as a visual rule was already true for the tabs that
  have icons; tabs whose `TABS` entry is plain text (e.g. Agencia's
  "Historial", "Cierres") were left as plain text — adding icons to them
  would be redesigning `TABS` content, not converting the shell.

## Next step

None — all three tasks are implemented, tested, and committed. Review is
due per `gentle-ai review assess` after T3 (`slice_budget_reached`, 486
changed lines); the returned `next_transition.command` was handed back
to the orchestrator rather than run, per the delivery/consent rules —
see the handback report for the exact command.
