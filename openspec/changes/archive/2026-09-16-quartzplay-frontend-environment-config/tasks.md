# Tasks: Frontend Environment Configuration

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 180–260 (tests about half) |
| 400-line budget risk | Low |
| Chained PRs recommended | No |
| Suggested split | Single PR into `staging` |
| Delivery strategy | auto-chain |
| Chain strategy | size-exception |

Decision needed before apply: No
Chained PRs recommended: No
Chain strategy: size-exception
400-line budget risk: Low

### Suggested Work Units

| Unit | Goal | Likely PR | Focused test command | Runtime harness | Rollback boundary |
|------|------|-----------|----------------------|-----------------|-------------------|
| 1 | Environment-aware frontend configuration | PR 1 → `staging` | `cd frontend && CI=true npx react-scripts test --watchAll=false --runInBand` | Production and staging example builds with `npm --prefix frontend run build` | Revert PR 1 |

## Phase 1: RED

- [x] 1.1 Add failing cases to `frontend/src/config.test.js` for: coherent production resolution, unknown environment, production with a staging destination, `juego.iaqp.lat` rejected in staging, production bot accepted in production, non-production bot rejected in production.
- [x] 1.2 Add failing preflight cases to `frontend/src/config.test.js`: coherent production passes; mismatched `APP_ENV`/`REACT_APP_ENV` fails naming `APP_ENV`.
- [x] 1.3 Change the existing mixed case (`APP_ENV` production over staging destinations) to expect `REACT_APP_API_URL`; run the suite and record the failures.

## Phase 2: GREEN

- [x] 2.1 Make `frontend/src/environmentValidation.js` environment-aware and add `juego.iaqp.lat` to `PRODUCTION_HOSTS`.
- [x] 2.2 Update `frontend/src/config.js` to resolve the declared environment with per-environment rules.
- [x] 2.3 Update `frontend/scripts/validate-env.js` to require equal environments and apply per-environment rules.
- [x] 2.4 Run the frontend suite green; refactor duplicated checks without changing behavior.

## Phase 3: Verify

- [x] 3.1 Build with production example values and with staging example values: both pass; a mixed build fails.
- [x] 3.2 Secret-pattern scan and `git diff --check`; confirm no production destination entered UI source files.

## Phase 4: Delivery

- [x] 4.1 Open the PR into `staging` (PR #32); after merge, confirm the staging frontend still serves the SPA.
- [x] 4.2 With owner approval, set the seven production variables on `valiant-gentleness`, now named `quartzplay-frontend` (values in `design.md`).
- [x] 4.3 With owner approval, release `staging` to `main` (PR #33); confirm the production frontend deployment succeeds and serves the SPA with its bundle.
