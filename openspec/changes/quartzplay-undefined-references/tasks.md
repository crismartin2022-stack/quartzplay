# Tasks: Remove Undefined References

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Under 120 |
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

- [x] 1.1 Add a per-source test that fails on undefined references; record the two failures.

## Phase 2: GREEN

- [x] 2.1 Derive the referral code in the site root from the link.
- [x] 2.2 Add the bonuses loader in the admin tab and load on mount.
- [x] 2.3 Run the frontend suite green.

## Phase 3: Verify

- [x] 3.1 Serve the built site locally, open the scanner tab at phone width, and confirm it renders with zero errors.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; verify on staging; release to `main` with owner approval.
