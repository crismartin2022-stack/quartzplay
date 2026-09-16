# Delta for PSP Webhook Authentication

## ADDED Requirements

### Requirement: Signed Callback URLs

The API MUST register PSP callback URLs that carry an HMAC-SHA256 signature derived from `PSP_WEBHOOK_SECRET` and a purpose-scoped message, and MUST NOT include the secret itself.

#### Scenario: Cash-in request registers a signed callback

- GIVEN `PSP_WEBHOOK_SECRET` is configured
- WHEN a user creates a cash-in request
- THEN the registered callback URL contains `uid`, a random `n`, and `sig`
- AND `sig` verifies for purpose `cashin` over `uid` and `n`

#### Scenario: Payout registers a signed callback

- GIVEN `PSP_WEBHOOK_SECRET` is configured
- WHEN an approved withdrawal is sent to the PSP
- THEN the callback URL contains `rid` equal to the withdrawal id and a valid `sig` for purpose `payout`

#### Scenario: Missing secret refuses new PSP requests

- GIVEN `PSP_WEBHOOK_SECRET` is not configured
- WHEN a cash-in or payout request would be created
- THEN the API answers 503 and calls neither the PSP nor the database write

### Requirement: Callback Authentication Before Side Effects

The API MUST verify the callback signature in constant time before reading or writing any record, and MUST reject unauthenticated callbacks without revealing why beyond a generic error.

#### Scenario: Missing signature is rejected

- WHEN a cash-in or payout callback arrives without `sig`
- THEN the API answers 401
- AND no database connection is acquired

#### Scenario: Invalid signature is rejected

- WHEN the callback `sig` does not match its parameters, or a cash-in signature is replayed on the payout endpoint
- THEN the API answers 401 and no database connection is acquired

#### Scenario: Secret not configured

- GIVEN `PSP_WEBHOOK_SECRET` is not configured
- WHEN any PSP callback arrives
- THEN the API answers 503 and no database connection is acquired

#### Scenario: Signed callback bound to another record

- GIVEN a valid cash-in signature for user A
- WHEN the body references a cash-in record of user B
- THEN no balance changes and the record stays pending

### Requirement: Idempotent Locked Settlement

The API MUST lock the target record for update inside the settlement transaction and MUST apply each terminal state at most once.

#### Scenario: Late match after expiry

- GIVEN a cash-in record marked expired
- WHEN an authenticated MATCHED callback arrives
- THEN the received amount is credited once

#### Scenario: Replayed cash-in credit

- GIVEN a cash-in record already credited
- WHEN the same authenticated MATCHED callback arrives again
- THEN the balance is credited only once

#### Scenario: Replayed payout outcome

- GIVEN a withdrawal already completed or already failed
- WHEN the same authenticated callback arrives again
- THEN no additional agency movement or refund is recorded

### Requirement: Secret Configuration

`PSP_WEBHOOK_SECRET` MUST be optional and, when present, MUST be at least 32 characters; an invalid value MUST fail startup with a stable error code that does not include the value.

#### Scenario: Short secret fails startup

- WHEN `PSP_WEBHOOK_SECRET` has fewer than 32 characters
- THEN runtime settings fail with `psp_webhook_secret.invalid`
