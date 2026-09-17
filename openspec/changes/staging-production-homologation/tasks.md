# Tasks: Staging and Production Homologation

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | Documentation only |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single documentation PR |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

## Phase 1: Executed With Owner Approval

- [x] 1.1 IAQP service: rehearsal, cutover, and release to `main` (IAQP PR #22); history matched after final sync.
- [x] 1.2 QuartzPlay: Data API lockdown in production and staging.
- [x] 1.3 QuartzPlay: Relational and Security slices applied to staging (PR #41).
- [x] 1.4 Panel: staging created on Railway and Supabase from branch `staging`, verified, locked down.
- [x] 1.5 IAQP staging database locked down.
- [x] 1.6 Runtime and database parity verified with zero structural differences.

## Phase 2: Open

- [ ] 2.1 Release the QuartzPlay schema slices from `staging` to `main`.
- [ ] 2.2 Request sandbox credentials from game providers; load them in panel staging and open callbacks for sandbox IPs only.
- [ ] 2.3 Record the IAQP service migration in the IAQP repository OpenSpec.
- [ ] 2.4 Add a README deployment update to the panel repository (current topology on Supabase).
- [ ] 2.5 Automate the parity checks as a repeatable command for future releases.
