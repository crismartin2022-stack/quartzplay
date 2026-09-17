# Tasks: Frontend Static Hosting Cache Headers

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

- [x] 1.1 Add a test asserting the hosting configuration: no-store entry document, immutable hashed assets, kept fallback, and the serve script without the single flag.

## Phase 2: GREEN

- [x] 2.1 Add `frontend/public/serve.json` and update the serve script.
- [x] 2.2 Run the frontend suite green and build.

## Phase 3: Verify

- [x] 3.1 Serve the real build locally and confirm the headers and the fallback.
- [ ] 3.2 After merge, confirm the headers on the staging and production sites.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; release to `main` with owner approval.
