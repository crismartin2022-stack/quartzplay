# Proposal: Frontend Hosting Parity As Code

## Intent

Staging and production must serve the frontend with the same server, so a hosting fix verified in staging is the fix that reaches production.

## Evidence (2026-09-17)

- The cache-header fix appeared to do nothing in staging: that service had lost its start command, so the platform built a static image and served it with its own web server, ignoring the project configuration.
- Production kept `npm run serve`, so the same commit behaved differently in each environment.
- After restoring the start command and rebuilding from source, both environments answer identical cache headers.

## Scope

- Add `frontend/railway.json` pinning builder, build command, start command, and restart policy for every environment.
- Add tests keeping the pinned commands aligned with the package scripts.

Out of scope: other services (their start commands already live in the repository Procfile), platform settings for the panel and IAQP.

## Rollback

Revert the PR; services fall back to their dashboard settings.
