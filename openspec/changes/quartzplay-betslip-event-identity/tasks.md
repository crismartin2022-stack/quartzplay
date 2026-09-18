# Tasks: Send The Resolved Event

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

- [x] 1.1 Test that the payload prefers the resolved names and carries the identifiers.

## Phase 2: GREEN

- [x] 2.1 Extend the payload builder.
- [x] 2.2 Run the frontend suite green and build.

## Phase 3: Verify

- [ ] 3.1 Align staging with the production validation mode and run a full scan there.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; release to `main`.
