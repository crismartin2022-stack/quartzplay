# Staging Backend Safety Specification

## Purpose

Define fail-closed staging configuration for backend database and browser origins without changing product or deployment behavior.

## Requirements

### Requirement: Validated Staging Destinations

The backend MUST accept a staging runtime configuration only when `APP_ENV` explicitly denotes `staging`, `DATABASE_URL` is nonempty and valid, and `ALLOWED_ORIGINS` contains one or more valid origins. Values MUST be canonicalized before comparison. The canonical database host and every canonical allowed origin host MUST be disjoint from configured production destinations. Missing, malformed, ambiguous, duplicate-after-canonicalization, or production-pointing values MUST reject startup without exposing secret values.

#### Scenario: Accept independent canonical destinations

- GIVEN explicit staging environment variables with one valid non-production database host and distinct valid non-production origins
- WHEN staging configuration is validated
- THEN validation succeeds with canonical database host and canonical origin set
- AND no production destination appears in either result

#### Scenario: Reject invalid or overlapping destinations

- GIVEN staging configuration with a missing, malformed, ambiguous, duplicate-after-canonicalization, or production-pointing database host or origin
- WHEN staging configuration is validated
- THEN validation fails before runtime startup
- AND failure output contains no token, connection string, or other secret value

### Requirement: Unified Runtime Configuration Wiring

The API and bot startup paths MUST use same validated staging configuration before creating database or Telegram runtime resources. API database pool creation, CORS middleware, and manually produced CORS headers MUST use its canonical destination values. No runtime-relevant production or implicit staging database/CORS default MAY bypass this contract.

#### Scenario: API paths share canonical CORS policy

- GIVEN valid staging configuration and an API response produced by middleware or manual response handling
- WHEN an allowed origin is evaluated
- THEN both response paths apply same canonical allowlist
- AND database startup targets configured canonical staging database host

#### Scenario: Invalid configuration blocks all startup paths

- GIVEN invalid staging database or CORS configuration
- WHEN API or bot startup is attempted
- THEN startup is rejected before pool or bot construction
- AND no fallback destination is selected

### Requirement: Strict-TDD and Scope Evidence

This change MUST record focused backend validation test evidence in RED then GREEN order and a passing frontend regression using synthetic values only. Delivery MUST use automatic feature-branch-chain handling with a 400 changed-line review budget; work forecast above budget MUST become a separately reviewable chain slice. It MUST remain within backend configuration, runtime wiring, and test-only dependency scope; it MUST NOT change frontend, cloud, secrets, schema/migrations, readiness, poller supervision, wallet/balance/odds/roulette behavior, or Telegram journey behavior.

#### Scenario: Review evidence is complete and bounded

- GIVEN PR 2A implementation evidence
- WHEN reviewer inspects tests, commands, and changed paths
- THEN focused backend RED and GREEN evidence and frontend regression evidence are present
- AND delivery evidence meets 400-line budget or identifies a separate chain slice, with no forbidden-scope modification
