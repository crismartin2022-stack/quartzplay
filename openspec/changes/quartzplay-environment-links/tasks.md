# Tasks: Environment-Scoped Bot and App Links

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120–220 (tests about half) |
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

- [x] 1.1 Config tests for the public app URL: production default, production HTTPS, staging missing, staging production host, staging valid.
- [x] 1.2 Source scan test forbidding hardcoded production frontend URLs and production bot username links in bot Python sources.
- [x] 1.3 Tests that the start button, agency message, combo link, and referral link use settings.

## Phase 2: GREEN

- [x] 2.1 Add the public app URL to poller and API runtime settings.
- [x] 2.2 Replace the hardcoded links in bot handlers, admin handlers, and the API.
- [x] 2.3 Run the bot suite green.

## Phase 3: Delivery

- [ ] 3.1 Owner sets staging `APP_URL` (and admin key) before merge; open the PR into `staging`; verify the staging bot opens the staging frontend.
