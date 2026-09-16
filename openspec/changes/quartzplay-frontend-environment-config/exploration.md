## Exploration: production frontend environment configuration

### Current State

The production frontend (Railway service `valiant-gentleness`, project `laudable-enthusiasm`) has failed every deployment since 2026-09-03. Evidence from Railway build logs and commit statuses:

| Period | Cause | Status |
|---|---|---|
| PR #4 deployment (2026-09-03) | `npm install` E404 for an `electron-to-chromium` version missing from the registry | Transient: later builds pass `npm install`; PR #4 changed neither `package.json` nor the lockfile |
| PR #6 onward (2026-09-07 to today) | The staging isolation validator rejects every non-staging build | Current cause, reproduced locally with `APP_ENV=production` |

The frontend isolation work (commit `631c451`, merged through PR #6) made the frontend staging-only:

- `frontend/scripts/validate-env.js` runs as `prestart`, `prebuild` and `pretest`. It requires seven variables, accepts only `APP_ENV=staging` and `REACT_APP_ENV=staging`, and rejects any destination host listed in `PRODUCTION_HOSTS`.
- `frontend/src/config.js` (`resolveFrontendConfig`) throws in the browser unless `APP_ENV` is `staging`. `index.js`, `Casino.jsx`, `Box.jsx`, `Web.jsx` and `Agencia.jsx` call `getFrontendConfig()` at module load, so skipping the prebuild alone would ship a blank page.
- `frontend/src/environmentValidation.js` holds `PRODUCTION_HOSTS` as a deny list and rejects the bot username `quartzplay_bot`, which is the production bot.
- `frontend/src/config.test.js` encodes the staging-only contract: `APP_ENV=production` must be rejected, and production destinations must stay out of frontend source files.

The production service currently defines only `PORT` and `REACT_APP_VERSION`, so it keeps serving the last successful build (PR #2, 2026-09-02).

### Production Values (from code before PR #6)

| Variable | Production value | Source |
|---|---|---|
| API | `https://api.iaqp.lat` | `App.jsx`, `Box.jsx`, `Web.jsx`, `Agencia.jsx` constants |
| IAQP casino API | `https://api-casino.iaqp.lat` | `Casino.jsx` constant |
| App origin | `https://valiant-gentleness-production-a779.up.railway.app` | `Agencia.jsx` scan link |
| Casino hosts | `iaqp.lat`, `www.iaqp.lat` | `index.js` host check |
| Bot username | `quartzplay_bot` | `Agencia.jsx` link and footer |

Railway attaches three domains to the production frontend: the Railway domain, `iaqp.lat`, and `juego.iaqp.lat`. `juego.iaqp.lat` is also the backend `APP_URL` default and a CORS origin in `bot/casino_api.py`, but it is **missing from `PRODUCTION_HOSTS`**. Consequence today: the staging validator would accept `juego.iaqp.lat` as a staging destination, which is an isolation gap.

No production destination is hardcoded in frontend sources today; staging isolation is otherwise intact.

### Affected Areas

- `frontend/src/environmentValidation.js` — environment-aware destination and bot rules; add `juego.iaqp.lat` to `PRODUCTION_HOSTS`.
- `frontend/src/config.js` — resolve production as well as staging.
- `frontend/scripts/validate-env.js` — accept a coherent production environment.
- `frontend/src/config.test.js` — production cases; one existing case changes meaning.
- Railway `valiant-gentleness` variables — seven production values, set only with owner approval.

### Approaches

1. **Environment-aware validation (both environments explicit)** — `APP_ENV` and `REACT_APP_ENV` must match and be `staging` or `production`. Staging keeps today's rules. Production requires `https` destinations whose hosts are in `PRODUCTION_HOSTS` and allows the production bot. Values come from Railway variables.
   - Pros: keeps production destinations out of source files (existing test), fails closed on missing or mixed configuration, closes the `juego.iaqp.lat` gap.
   - Cons: production needs seven Railway variables before the build succeeds; one existing test case changes meaning.
   - Effort: Low

2. **Production defaults when the environment is unset** — fall back to hardcoded production destinations.
   - Pros: no Railway variable changes.
   - Cons: a staging build with missing variables would silently point at production, which is the failure the isolation work exists to prevent; violates the existing source test.
   - Effort: Low, rejected

### Recommendation

Approach 1. Delivery: a strict-TDD PR into `staging` (staging frontend must still build), the seven production variables set on `valiant-gentleness` with owner approval, then the release to `main`.

### Risks

- Production builds from `main`; until the change reaches `main`, the production frontend keeps failing (no regression, it already fails).
- Setting production variables before merge triggers one more failing build; harmless but noisy.
- The production frontend has not deployed since 2026-09-02, so the first successful deploy ships every frontend change merged since then; those changes are covered by the staging frontend, which serves the same code today.

### Ready for Proposal

Yes. Owner approvals needed later: the seven production variables and the release to `main`.
