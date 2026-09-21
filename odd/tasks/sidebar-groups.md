# The sidebar stops being a list and becomes a menu

The owner sent a dashboard reference (DataForSEO) and approved the grouping
below. Eighteen flat buttons in agency and eleven in admin are a list, not a
menu: nothing tells you which ones belong together, so finding anything means
reading all of them.

Stacked on `fix/quartzplay-panel-polish` (PR #127), which gave every agency
tab its icon. That PR must merge first.

TDD: off for this project. Tests are source-reading guards, not renders.
Runner: `CI=true npm test` in `app/frontend` with the staging env vars.

## The approved grouping

### Agency — 18 tabs into 5 groups

| Group | Tabs |
|---|---|
| **Vender** | Código / Bot · En Vivo · Apuesta manual · Combos IA · Mejorar |
| **Clientes** | Clientes · Influencers · Desafíos · Mensajes |
| **Red** | Mis agencias · Terminales · Asesor |
| **Dinero** | Cash out · Bonos · Cierres · Historial |
| **Cuenta** | Soporte · Config |

### Admin — 11 tabs into 4 groups

| Group | Tabs |
|---|---|
| **Operación** | Global · Eventos · Combos |
| **Red** | Agencias · Influencers · Usuarios |
| **Dinero** | Billetera · Cierre |
| **Sistema** | Config · Diag · Consultas |

Every tab appears exactly once. No tab key changes, no route changes, no
screen changes: this is purely how the buttons are arranged in the sidebar.

## Scope

Desktop sidebar only (`@media (min-width:1024px)`, the `isDesktop` branch).
Below 1024 the tab strip stays exactly as it is — a grouped menu does not fit
a horizontal scroller, and mobile is the agency's real working surface. Do
not touch it.

## Tasks

- [ ] **T1** — Agency: declare the five groups and render the sidebar from
      them. The group heading is a label, not a button: it must not be
      focusable and must not change the selected tab.
- [ ] **T2** — Admin: the same, with its four groups.
- [ ] **T3** — A guard that every tab key in each panel's flat list appears in
      exactly one group, and that the groups introduce no key that is not in
      the list. This is the test that matters: it is what stops a tab from
      silently disappearing from the menu when someone adds one later.

## Acceptance

- Every existing tab is still reachable in both panels, desktop and mobile.
- 805 existing tests still pass; T3 adds its own.
- ESLint clean.
- The guard bites: remove one tab from a group and T3 fails.
