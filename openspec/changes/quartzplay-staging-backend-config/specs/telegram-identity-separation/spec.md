# Telegram Identity Separation Specification

## Purpose

Require an explicit staging Telegram identity shared by backend entry points.

## Requirements

### Requirement: Validated Staging Telegram Identity

Staging configuration MUST require nonempty, valid Telegram token, bot username, and administrator identity values. It MUST canonicalize identity values where comparison is meaningful and MUST reject malformed, ambiguous, implicit-default, or production-pointing staging identities. Validation failures MUST NOT expose token values.

#### Scenario: Accept explicit independent Telegram identity

- GIVEN explicit valid staging token, bot username, and administrator identity values distinct from production identity
- WHEN staging configuration is validated
- THEN validation returns one canonical staging Telegram identity
- AND validation output does not disclose token value

#### Scenario: Reject unsafe Telegram identity

- GIVEN missing, malformed, ambiguous, defaulted, or production-pointing Telegram identity input
- WHEN staging configuration is validated
- THEN validation fails before API or bot startup
- AND failure output contains no token value

### Requirement: Shared API and Bot Identity

The API and Telegram bot entry points MUST consume same validated staging Telegram identity for WebApp verification, outbound notifications, bot construction, and administrator authorization. Runtime-relevant handlers MUST NOT retain independent production-looking identity defaults.

#### Scenario: Entry points use one identity contract

- GIVEN a valid synthetic staging identity configuration
- WHEN API and bot startup contracts are exercised
- THEN each consumer receives same validated token, username, and administrator identity
- AND no consumer reads an independent identity default

#### Scenario: One invalid identity blocks both entry points

- GIVEN invalid staging Telegram identity configuration
- WHEN API and bot startup contracts are exercised
- THEN both reject startup before external Telegram interaction
- AND neither attempts fallback identity selection
