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

- [ ] **T1** A shared way to ask whether the viewport is desktop-wide.
- [ ] **T2** `Agencia.jsx`: the tab row becomes a sidebar at 1024 and up.
- [ ] **T3** `Admin.jsx`: the same.

## Delivery

One commit per task on `feat/quartzplay-desktop-shell`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
