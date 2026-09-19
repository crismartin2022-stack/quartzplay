# Tasks: Dark Ink On A Bright Accent

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 200–300, mostly one-line substitutions |
| 400-line budget risk | Medium |
| Chained PRs recommended | No, for these three screens |
| Suggested split | This PR: `Web.jsx`, `App.jsx`, `Casino.jsx`. Follow-up: `Admin.jsx`, `Agencia.jsx`, `Box.jsx` |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked
400-line budget risk: Medium

## Phase 1: RED

- [x] 1.1 Test that the ink reads on every accent used as a background, in both
      themes, at the threshold the suite defines for text.
- [ ] 1.2 Test that no accent background in the three screens carries white.
- [x] 1.3 Test that the accent values themselves are unchanged.

## Phase 2: GREEN

- [x] 2.1 Add the ink token to both themes, with the reason recorded beside it.
- [ ] 2.2 Replace white with the ink at every accent-background site in
      `Web.jsx`, `App.jsx` and `Casino.jsx`, including the icon colour handed
      to `IconoDeporte` by the active tab.
- [ ] 2.3 Run the frontend suite green.

## Phase 3: Delivery

- [ ] 3.1 Open the PR into `staging`.
- [ ] 3.2 In production, confirm the sport tabs read again, in both themes.

## Follows this change

The same pattern in `Admin.jsx`, `Agencia.jsx` and `Box.jsx`, once the icon
change merges and stops touching `Box.jsx`.
