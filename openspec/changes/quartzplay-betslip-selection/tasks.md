# Tasks: Generate A Ticket From A Scanned Bet

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Under 100 |
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

- [x] 1.1 Tests for the payload builder: scanner selection, corrected selection, short shapes, picks without a final odd, and no empty selection.

## Phase 2: GREEN

- [x] 2.1 Add the shared payload builder and use it in both screens.
- [x] 2.2 Run the frontend suite green and build.

## Phase 3: Verify

- [x] 3.1 Against the staging API: the empty payload answers 400 with the reported message and the corrected payload answers 200 with a code.

## Phase 4: Delivery

- [ ] 4.1 Open the PR into `staging`; verify the full scan on staging; release to `main`.
