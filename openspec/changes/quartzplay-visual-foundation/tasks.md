# Tasks: Adopt The Brand As A Single Theme

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–400 (mostly deletions of duplicated palettes) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked
400-line budget risk: Medium

## Phase 1: RED

- [x] 1.1 Test that both themes export every palette key the screens use today,
      that neither theme is missing a key the other has, and that each key
      carries the value the proposal's mapping table assigns it.
- [x] 1.2 Test that no source file under `frontend/src` declares its own
      palette object, naming any offender.
- [x] 1.3 Test that every foreground value has enough contrast against its own
      theme's surfaces, and that the bright accent is only ever used as a
      background with the brand's dark ink on it.
- [x] 1.4 Test that the typography constants name the brand typeface and keep a
      system fallback.
- [x] 1.5 Test that the shipped font files exist and are declared with a
      fallback-visible loading strategy.

## Phase 2: GREEN

- [x] 2.1 Write `frontend/src/theme.js` with both themes, the typography
      constants and a short comment recording where the values come from and
      how the light one was derived.
- [x] 2.2 Copy Poppins 400/500/600/700 from the prototype into the app's own
      static files and declare the faces once, with `font-display: swap`.
- [x] 2.3 Replace the local declarations with an import from the theme:
      `Admin.jsx`, `Agencia.jsx` and `Casino.jsx` take the dark theme;
      `App.jsx`, `Web.jsx` and `Box.jsx` take both and keep their switch and
      its stored choice untouched. Change nothing else in those files.
- [x] 2.4 Run the frontend suite green.

## Phase 3: Delivery

- [x] 3.1 Build the frontend and confirm the bundle carries the fonts.
- [ ] 3.2 Open the PR into `staging`; look at every screen in staging, in both
      themes, on a phone and on a desktop, before releasing.

## Later waves, not this change

- Icons: replace the emojis with the prototype's icon set.
- Shell: sidebar and optimised navigation from 1024px for admin and agency.
- Screens: redesign one screen at a time against the prototype.
