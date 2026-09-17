# Tasks: Frontend Hosting Parity As Code

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Under 60 |
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

- [x] 1.1 Add tests asserting the pinned build and start commands match the package scripts and the configured static server.

## Phase 2: GREEN

- [x] 2.1 Add `frontend/railway.json` with builder, build command, start command, and restart policy.
- [x] 2.2 Run the frontend suite green.

## Phase 3: Verify

- [x] 3.1 Confirm both environments answer the same cache headers after a rebuild from source.
- [ ] 3.2 After merge, confirm the platform reports the configuration as code for both frontend services.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; release to `main` with owner approval.
