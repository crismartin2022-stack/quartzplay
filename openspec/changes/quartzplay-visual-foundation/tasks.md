# Tasks: Adopt The Brand As A Single Theme

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 250–350 (mostly deletions of duplicated palettes) |
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

- [ ] 1.1 Test that `theme.js` exports every palette key used by the screens
      today, and that each carries the value the proposal's mapping table
      assigns it.
- [ ] 1.2 Test that no source file under `frontend/src` declares its own
      palette object, listing any offender by name.
- [ ] 1.3 Test that the typography constants name the brand typeface and keep a
      system fallback.
- [ ] 1.4 Test that the shipped font files exist and are declared with a
      fallback-visible loading strategy.

## Phase 2: GREEN

- [ ] 2.1 Write `frontend/src/theme.js` with the palette, the typography
      constants and a short comment recording where the values come from.
- [ ] 2.2 Copy Poppins 400/500/600/700 from the prototype into the app's own
      static files and declare the faces once, with `font-display: swap`.
- [ ] 2.3 Replace the local palette and typography declarations in `App.jsx`,
      `Web.jsx`, `Admin.jsx`, `Agencia.jsx`, `Casino.jsx` and `Box.jsx` with an
      import from the theme. Change nothing else in those files.
- [ ] 2.4 Run the frontend suite green.

## Phase 3: Delivery

- [ ] 3.1 Build the frontend and confirm the bundle carries the fonts.
- [ ] 3.2 Open the PR into `staging`; look at every screen in staging on a
      phone and on a desktop before releasing.

## Later waves, not this change

- Icons: replace the emojis with the prototype's icon set.
- Shell: sidebar and optimised navigation from 1024px for admin and agency.
- Screens: redesign one screen at a time against the prototype.
