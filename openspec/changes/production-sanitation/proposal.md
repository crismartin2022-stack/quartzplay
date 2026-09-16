# Proposal: Production Sanitation

## Intent

Bring the shared Railway production project to a known, safe, and documented state before full staging and production homologation. Every production change in this change was executed with explicit owner approval, one step at a time.

## Owner Rules

- All databases live in Supabase; no database remains on Railway.
- Production reads are free; every production change needs explicit owner approval.
- The panel (`panel-web`) is business-critical: rehearse first, keep a rollback, verify before accepting.

## Scope

- Production frontend recovery (delivered by `quartzplay-frontend-environment-config`).
- Split-database repair for the Telegram bot.
- Migration of the panel database from Railway Postgres to the Supabase project "IAQP Production".
- Railway cleanup and descriptive service names.
- PSP webhook authentication (delivered by `quartzplay-psp-webhook-authentication`) and its production gate.

Out of scope: homologation of staging and production, the new interface.

## Record

See `operations-record.md` for what was done, how it was verified, and how to roll back. Open items are tracked in `tasks.md`.
