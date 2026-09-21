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

- [ ] **T1** Agency's tabs split icon from label; the ten without one get one.
- [ ] **T2** The sidebar buttons and the agency header get their spacing.
- [ ] **T3** The content cap rises on desktop, in both panels.
- [ ] **T4** The logo grows, in the logins and both top bars.

## Delivery

One commit per task on `fix/quartzplay-panel-polish`, off `staging`. Assess
after each; hand the returned command back when review is due.

## Progress

Not started.

## Next step

T1.
