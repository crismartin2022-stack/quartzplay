# Tasks: Clean Scanner Panel

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Under 80 |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: RED

- [x] 1.1 Tests: the site scanner shows the panel title, drops the bubble, and offers the two labelled options wired to the camera overlay.

## Phase 2: GREEN

- [x] 2.1 Replace the bubble with the panel and relabel the options.
- [x] 2.2 Wire the in-app camera into the admin scan screen.
- [x] 2.3 Run the frontend suite green and build.

## Phase 3: Verify

- [x] 3.1 Serve the build, open the scanner at phone width, and confirm the title and both options render with zero errors.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; confirm with the owner; release to `main`.
