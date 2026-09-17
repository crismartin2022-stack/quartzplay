# Proposal: Frontend Static Hosting Cache Headers

## Intent

After each deploy, browsers keep showing a blank screen until the user clears the cache. The static server sends `index.html` without cache directives, so a browser reuses a stale document that references bundle files which no longer exist.

## Evidence (production, 2026-09-17)

- `GET /` returns only an `ETag`; there is no `Cache-Control`.
- `GET /static/js/main.deadbeef.js` (a bundle name that does not exist) returns HTTP 200 with `content-type: text/html` and the index document, because the single-page fallback answers every unknown path.
- A browser then parses HTML as JavaScript, the application never mounts, and the page stays black. Clearing the cache fixes it until the next deploy.

## Scope

- Add `frontend/public/serve.json`: `index.html` and `asset-manifest.json` are never cached; hashed assets under `static/` are cached immutably; the single-page fallback is kept for application routes.
- Serve the build with that configuration instead of the `--single` flag.

Out of scope: a service worker, CDN configuration, the camera scanner issue.

## Rollback

Revert the PR; hosting returns to the previous behavior.
