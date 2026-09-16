# Design: Frontend Environment Configuration

## Technical Approach

Make the existing validation module environment-aware and route both consumers through it. `PRODUCTION_HOSTS` stays the single source of truth: a deny list for staging and an allow list for production. Satisfies `specs/frontend-environment-config/spec.md`.

## Architecture Decisions

| Decision | Options | Tradeoff | Choice |
|---|---|---|---|
| Where production values live | Source defaults; environment variables | Defaults break staging isolation and the existing source test | Environment variables only |
| Host classification | Separate staging and production lists; one production list | Two lists drift | One `PRODUCTION_HOSTS` set: staging hosts are "not production" |
| Environment check | Trust `APP_ENV` alone; require `APP_ENV` equal to `REACT_APP_ENV` | Mismatch could build one environment and run another | Require both, equal, in `staging` or `production` |
| Bot rule | Allow any bot in production; allow only the production bot | Any bot risks linking users to the wrong bot | Production accepts only `quartzplay_bot`; staging rejects it |
| `juego.iaqp.lat` | Leave unlisted; add to `PRODUCTION_HOSTS` | Unlisted means staging can target a production host | Add |
| Existing test "rejects unsafe destinations" with `APP_ENV: "production"` over staging destinations | Keep expecting `APP_ENV`; expect the destination error | Production is now valid, so the failure is the staging destination | Expect `REACT_APP_API_URL` (spec: Production with a staging destination) |

## Data Flow

    Railway variables ──► scripts/validate-env.js (prebuild) ──► react-scripts build
                                   │
                                   └── environmentValidation.js ◄── config.js (browser, module load)

## File Changes

| File | Action | Description |
|---|---|---|
| `frontend/src/environmentValidation.js` | Modify | Add `juego.iaqp.lat`; `resolveEnvironment`; `parseDestinationUrl(value, environment)`; `parseCasinoHosts(raw, environment)`; `parseBotUsername(value, environment)` |
| `frontend/src/config.js` | Modify | Resolve the declared environment and apply per-environment rules |
| `frontend/scripts/validate-env.js` | Modify | Require equal `APP_ENV`/`REACT_APP_ENV`; apply per-environment rules |
| `frontend/src/config.test.js` | Modify | New production and mixed-environment cases; one expectation changes per the table above |

## Interfaces / Contracts

```js
resolveEnvironment(appEnv) // "staging" | "production" | null
parseDestinationUrl(value, environment) // normalized https origin or null
parseCasinoHosts(raw, environment) // deduplicated hosts or null
parseBotUsername(value, environment) // username or null
```

Errors keep the form `Invalid frontend environment variable: <NAME>` and never include values.

## Testing Strategy

| Layer | What to Test | Approach |
|---|---|---|
| Unit | Every spec scenario for `resolveFrontendConfig` and `getFrontendConfig` | Jest in `config.test.js`, RED first |
| Integration | Build preflight for coherent production, coherent staging, mismatch | `spawnSync` of `scripts/validate-env.js`, as existing tests do |
| Build | Production and staging example values | `npm run build` with process-scoped non-secret values |

## Threat Matrix

N/A — no new routing, shell, subprocess, VCS/PR automation, executable-file classification, or process-integration boundary. The preflight script already runs as an npm lifecycle hook; only its rules change.

## Migration / Rollout

1. PR into `staging`; the staging frontend redeploys and must keep serving.
2. Owner approves seven production variables on `valiant-gentleness`: `APP_ENV` and `REACT_APP_ENV` = `production`; `REACT_APP_API_URL` = `https://api.iaqp.lat`; `REACT_APP_IAQP_URL` = `https://api-casino.iaqp.lat`; `REACT_APP_APP_ORIGIN` = `https://valiant-gentleness-production-a779.up.railway.app`; `REACT_APP_CASINO_HOSTS` = `iaqp.lat,www.iaqp.lat`; `REACT_APP_BOT_USERNAME` = `quartzplay_bot`.
3. Owner approves the release PR from `staging` to `main`; verify deploy status and page load.

Rollback: revert the PR; production stays on its last successful build.

## Open Questions

None.
