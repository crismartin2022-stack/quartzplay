# Frontend Static Hosting Specification

## Purpose

A browser must always load the current application after a deploy, without manual cache clearing.

## Requirements

### Requirement: Entry Document Is Never Cached

The static server MUST answer `index.html` and `asset-manifest.json` with `Cache-Control: no-store, must-revalidate`.

#### Scenario: Reload after a deploy

- GIVEN a browser that loaded the application before a deploy
- WHEN it opens the site again
- THEN it revalidates the entry document and loads the current bundle

### Requirement: Hashed Assets Are Cached Immutably

Files under `static/` MUST be answered with `Cache-Control: public, max-age=31536000, immutable`.

#### Scenario: Repeat visit

- WHEN a browser requests a hashed asset it already holds
- THEN it may reuse the cached copy without revalidation

### Requirement: Application Routes Keep The Fallback

Unknown paths MUST still return the entry document so client-side routes such as `/sitio` and `/agencia` work on a direct visit.

#### Scenario: Direct visit to a client route

- WHEN a browser requests `/sitio`
- THEN the entry document is returned with the no-store header
