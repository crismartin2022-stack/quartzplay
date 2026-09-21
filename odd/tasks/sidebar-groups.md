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

- [x] **T1** — Agency: declare the five groups and render the sidebar from
      them. The group heading is a label, not a button: it must not be
      focusable and must not change the selected tab.
      Commit: `6e9741f`. `TAB_GROUPS` declared at module scope in
      `frontend/src/Agencia.jsx`; the desktop branch renders a non-focusable
      `<div>` heading per group (never a `<button>`), the mobile branch below
      1024px still renders `TABS.map(...)` byte-for-byte unchanged (verified
      against `git diff`, no lines touched below the split point).
- [x] **T2** — Admin: the same, with its four groups.
      Commit: `bc32648`. Same pattern in `frontend/src/Admin.jsx`; the
      mobile-only active-tab underline (`{!isDesktop&&tab===t.k&&<div.../>}`)
      was simplified to `{tab===t.k&&<div.../>}` in the now-mobile-only
      branch (always true there), no test depends on the removed literal.
- [x] **T3** — A guard that every tab key in each panel's flat list appears in
      exactly one group, and that the groups introduce no key that is not in
      the list. This is the test that matters: it is what stops a tab from
      silently disappearing from the menu when someone adds one later.
      Commit: `84c4692` —
      `frontend/src/sidebarGroupKeysMatchTabs.test.js`. Reads TABS and
      TAB_GROUPS from the actual source text (not a hardcoded copy) for both
      panels; asserts no group key repeats and the sorted group-key set
      equals the sorted TABS-key set.

## Acceptance

- [x] Every existing tab is still reachable in both panels, desktop and
      mobile (18/18 agency keys, 11/11 admin keys accounted for by T3;
      mobile render path unchanged).
- [x] 805 existing tests still pass; T3 adds its own (7 new + 1 from the
      pre-existing `testsStayInRepo.test.js` auto-discovering the new test
      file = 813 total, 50 suites, 0 failures — observed via
      `CI=true APP_ENV=staging REACT_APP_ENV=staging REACT_APP_API_URL=https://api.staging.example.com REACT_APP_IAQP_URL=https://staging.example.com REACT_APP_APP_ORIGIN=https://staging.example.com REACT_APP_CASINO_HOSTS=staging.example.com REACT_APP_BOT_USERNAME=test_bot npm test`
      in `app/frontend`).
- [x] Lint clean. `npx eslint src` does not work in this repo and never has:
      CRA 5 does not use a project `.eslintrc`. It runs ESLint through
      `eslint-webpack-plugin` during `react-scripts build`, resolving
      `eslint-config-react-app` from `node_modules`. The build **is** the
      lint gate here, and with `CI=true` a warning fails it. Observed:
      `CI=true APP_ENV=staging ... npm run build` in `app/frontend` →
      `Compiled successfully` / `The build folder is ready to be deployed.`
- [x] The guard bites: remove one tab from a group and T3 fails. Verified by
      temporarily dropping `"mejorar"` from Agencia's Vender group — T3's
      "every TABS key is in exactly one group" assertion failed with a
      clear diff (`- "mejorar"`), then restored; full suite green again
      afterward.
