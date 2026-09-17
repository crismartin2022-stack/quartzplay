# Tasks: Production Sanitation

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

- [x] 1.1 Production bot polling identity configured and verified.
- [x] 1.2 Production frontend variables set and release verified.
- [x] 1.3 Bot moved to the API database and verified.
- [x] 1.4 Supabase project "IAQP Production" created.
- [x] 1.5 Panel migration rehearsed, cut over, accepted, and backed up.
- [x] 1.6 Railway cleanup and service renames verified.
- [x] 1.7 PSP webhook authentication merged and deployed to staging.

## Phase 2: Open

- [x] 2.1 Owner sets the restart policy of the panel queue service to Always and redeploys it (the queue exits after one hour by design). The panel scheduler also runs with Always.
- [ ] 2.2 Delete both `Postgres-RETIRADO-20260916` services (panel in `laudable-enthusiasm`, IAQP service in `pleasing-gratitude`) after the owner accepts about seven days of operation on Supabase.
- [x] 2.3 Release the PSP webhook authentication to `main` (PR #39).
- [ ] 2.4 PSP production gate (issue #35): provider API key, webhook secret, staging end-to-end test.
- [ ] 2.5 Resolve sports odds provider HTTP 403 (provider account or plan).
- [x] 2.6 Panel repository: duplicate route name breaks route caching on deploy (fixed, panel PR #2 and release PR #3).
- [x] 2.7 Replace the hardcoded Railway frontend domain in bot and API links with environment settings (PR #46).
- [ ] 2.8 Add a secret token check to the Telegram webhook route.

## Phase 3: Gate Before The Next Production Release (owner)

Recorded 2026-09-17 by owner decision. Both items MUST be done before the next release reaches production.

- [ ] 3.1 Rotate both Telegram bot tokens in BotFather and update them in Railway (staging worker and production bot). The previous tokens were printed in deployment logs until the log hygiene fix.
- [ ] 3.2 Obtain a dedicated Anthropic API key for staging and set it on the staging API with the prepared script, so the scanner can be exercised outside production. Never reuse the production key.
