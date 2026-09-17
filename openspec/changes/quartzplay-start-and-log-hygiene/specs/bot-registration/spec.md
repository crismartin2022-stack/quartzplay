# Bot Registration And Log Hygiene Specification

## Purpose

A visitor must be able to start the bot, and deployment logs must never contain credentials.

## Requirements

### Requirement: Registration Matches The Partial Unique Index

Every upsert keyed on `telegram_id` MUST declare the predicate of the partial unique index.

#### Scenario: A visitor sends start

- WHEN the handler registers the visitor
- THEN the statement infers the partial unique index and the visitor is registered or refreshed

#### Scenario: Any other upsert on the same key

- WHEN a source file upserts on `telegram_id`
- THEN that statement also declares the predicate

### Requirement: Request URLs Are Never Logged

Entry points MUST raise request-level loggers so client libraries do not emit request URLs, which carry the bot token.

#### Scenario: Poller and API start

- WHEN either entry point starts
- THEN the HTTP client loggers are at warning level or higher

#### Scenario: Source review

- WHEN a logging statement is reviewed
- THEN none builds a Telegram URL containing the token
