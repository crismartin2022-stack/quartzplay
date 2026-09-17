# Proposal: Environment-Scoped Bot and App Links

## Intent

Staging users must never be sent to production. The bot and API build user-facing links from hardcoded production values, so the staging bot opens the production frontend.

## Evidence

- `bot/bot_handlers.py` `/start` WebApp button uses the production Railway frontend URL.
- `bot/admin_handlers.py` agency creation message uses the production frontend `/agencia` URL, and the combo link uses the production bot username.
- `bot/casino_api.py` referral `link_web` uses the production Railway frontend URL.
- `APP_URL` silently defaults to a production domain when unset.

## Scope

- Add a validated public app URL to runtime settings: optional in production (defaults to the production app domain), required in staging and never a production frontend host.
- Build every user-facing app link and bot deep link from runtime settings.
- Guard with a source scan test that forbids hardcoded production frontend URLs and bot usernames in `bot/`.

Out of scope: frontend changes, DNS for `www.iaqp.lat`.

## Rollout

Staging `APP_URL` is set on `staging-api` and `staging-worker` before this merges (owner script). Production needs no variable change.

## Rollback

Revert the PR.
