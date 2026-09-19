# Tasks: An Account Is Needed To Scan

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 120–180 (tests about half) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | stacked |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: stacked
400-line budget risk: Low

## Phase 1: RED

- [x] 1.1 Tests for the identity rule: a browser session counts, the Telegram
      identity counts, neither present does not.
- [x] 1.2 Test that without an identity the camera does not open and no image
      is read.
- [x] 1.3 Test that without an identity a chosen file is not read and no
      request is sent.
- [x] 1.4 Test that betting with no identity and no amount opens the modal
      rather than asking for an amount.

## Phase 2: GREEN

- [x] 2.1 A single place that answers whether there is an identity, used by
      both entry controls and by the bet.
- [x] 2.2 Gate the camera button and the file picker on it.
- [x] 2.3 Check the identity before the amount in `apostar`.
- [x] 2.4 Remove the copy that says no account is needed.
- [x] 2.5 Run the frontend suite green.

## Phase 3: Delivery

- [ ] 3.1 Open the PR into `staging`.
- [ ] 3.2 In production, confirm that a visitor with no session sees the modal
      on both controls, and that a player with a session scans as before.
