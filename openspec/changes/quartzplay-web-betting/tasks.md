# Tasks: Bet With Balance From The Browser

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 150–250 (tests about half) |
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

- [x] 1.1 Tests for identity resolution: Telegram only, web session only, both present, agency token refused, unknown token refused.
- [x] 1.2 Tests for the refusal contract: 401 with reason `login_required` and no player information.
- [x] 1.3 Test that a bet from a web session debits the balance of that session player and no other.

## Phase 2: GREEN

- [x] 2.1 Add the player session resolver next to the existing agency one.
- [x] 2.2 Accept both identities in the bet endpoint, keeping every other rule untouched.
- [x] 2.3 Run the bot suite green.

## Phase 3: Delivery

- [ ] 3.1 Open the PR into `staging`; exercise both channels in staging with the demo accounts; release to `main`.
