# Tasks: PSP Webhook Authentication

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–380 (tests about 60%) |
| 400-line budget risk | Medium |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Medium

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Authenticated, idempotent PSP callbacks | PR 1 → `staging` | `cd bot && python -m pytest tests/test_psp_webhook_auth.py tests/test_runtime_config.py` | Full bot suite `cd bot && python -m pytest tests/` | Revert PR 1 |

## Phase 1: RED

- [x] 1.1 Add failing unit tests for `psp_webhook_auth` sign and verify (valid, tampered, wrong purpose, missing signature, unconfigured secret).
- [x] 1.2 Add failing config tests: absent secret accepted; short secret fails with `psp_webhook_secret.invalid` without the value.
- [x] 1.3 Add failing route tests: unsigned, invalid, and unconfigured callbacks on both endpoints return 401/503 without acquiring the database.
- [x] 1.4 Add failing settlement tests: cash-in credited once on replay; record of another user untouched; payout completed or failed applied once.
- [x] 1.5 Add failing tests: request creation refuses with 503 when the secret is missing; registered callback URLs carry a verifiable signature.

## Phase 2: GREEN

- [x] 2.1 Create `bot/psp_webhook_auth.py`.
- [x] 2.2 Add optional validated `PSP_WEBHOOK_SECRET` to runtime settings in `bot/config.py`.
- [x] 2.3 Sign callback URLs and fail closed in `me_psp_cargar` and `_ejecutar_payout`.
- [x] 2.4 Verify signatures first and lock records for update in both webhook handlers.
- [x] 2.5 Run the full bot suite green; refactor without behavior change.

## Phase 3: Verify

- [x] 3.1 Secret-pattern scan and `git diff --check`; confirm no secret, signature, or callback URL is logged.

## Phase 4: Delivery

- [x] 4.1 Open the PR into `staging` closing #13 (PR #34, merged and deployed to staging).
- [ ] 4.2 With owner approval, set `PSP_WEBHOOK_SECRET` in staging and production API services before enabling the PSP.

## Production Release Gate (CRITICAL)

Recorded 2026-09-16 by owner decision. The PSP MUST NOT be enabled in production until every item is done:

- [ ] G.1 Obtain `PSP_API_KEY` from the PSP provider. Status: not available; the owner must request it.
- [ ] G.2 Generate and set `PSP_WEBHOOK_SECRET` (at least 32 characters) in the staging and production API services.
- [ ] G.3 Run an end-to-end staging test of one small cash-in and one small payout, confirming a single credit or refund per signed callback.
- [ ] G.4 Ask the provider whether callbacks are signed or come from published IPs; add that check as a second layer if available.
- [ ] G.5 Enable the PSP from the admin configuration only after G.1 to G.3 pass.
