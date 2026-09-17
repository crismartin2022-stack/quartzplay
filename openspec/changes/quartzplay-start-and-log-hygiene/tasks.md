# Tasks: Bot Registration And Log Hygiene

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

- [x] 1.1 Tests for the registration upsert predicate and for every other upsert on the same key.
- [x] 1.2 Tests for request-logger levels, entry-point wiring, and no token-bearing logging statement.

## Phase 2: GREEN

- [x] 2.1 Add the predicate to the registration upsert.
- [x] 2.2 Add the log hygiene module and call it from both entry points.
- [x] 2.3 Run the bot suite green.

## Phase 3: Delivery

- [ ] 3.1 Open the PR into `staging`; verify the staging bot registers a visitor; release to `main`.
- [ ] 3.2 Owner rotates both bot tokens in BotFather and updates Railway, because the previous tokens were printed in logs.
