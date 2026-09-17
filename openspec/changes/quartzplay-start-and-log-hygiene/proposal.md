# Proposal: Fix Bot Registration And Keep Tokens Out Of Logs

## Intent

Two defects found while testing the staging bot, both present in production.

## Evidence (2026-09-17)

- `/start` fails: the handler upserts with `ON CONFLICT (telegram_id)`, but the unique index on that column is partial (`WHERE telegram_id IS NOT NULL`), so Postgres cannot infer it and raises "there is no unique or exclusion constraint matching the ON CONFLICT specification". Confirmed in the staging worker log and reproduced against the staging database inside a rolled-back transaction; the same statement runs on production, where the API already uses the correct form with the predicate.
- Every request line logged by the HTTP client contains the full Telegram URL, and that URL contains the bot token. Anyone able to read deployment logs reads the token.

## Scope

- Add the index predicate to the registration upsert.
- Raise request-level loggers so client libraries never emit request URLs, in both entry points.
- Tests pinning both behaviors.

Out of scope: rotating the tokens (operational, owner), other log redaction.

## Follow-up for the owner

Both bot tokens appeared in deployment logs, so they should be rotated in BotFather and updated in Railway.

## Rollback

Revert the PR.
