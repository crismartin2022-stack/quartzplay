# Apply Progress: Frontend Environment Configuration

## Status

Tasks 1.1–3.2 complete. Delivery tasks 4.1–4.3 remain (PR, production variables, release).

## TDD Cycle Evidence

| Phase | Command | Result |
|-------|---------|--------|
| RED | `CI=true npx react-scripts test --watchAll=false --runInBand` | 9 expected failures in `config.test.js` (production resolution, per-environment rejection, preflight coherence) |
| GREEN | same command | Test Suites: 2 passed; Tests: 40 passed |
| Build (production example values) | `npm run build` with the seven production variables | exit 0; "Frontend environment validation passed." |
| Build (staging example values) | `npm run build` with staging variables | exit 0 |
| Build (mixed) | `npm run build` with production environment over a staging API | exit 1; names only `REACT_APP_API_URL`; value not printed |

## Changed Files

- `frontend/src/environmentValidation.js` — environment-aware destination, casino host, and bot checks; `juego.iaqp.lat` added to production hosts.
- `frontend/src/config.js` — resolves the declared environment and applies its rules.
- `frontend/scripts/validate-env.js` — requires `APP_ENV` and `REACT_APP_ENV` to be valid and equal.
- `frontend/src/config.test.js` — production and mismatch coverage.
- `frontend/src/projectMemoryValidation.test.js` — see deviation.

## Deviations

- `projectMemoryValidation.test.js` asserted pre-application strings of the staging-foundations migration manifest. The manifest was truthfully updated when Foundation was applied to staging, which left four assertions failing on `staging`. The assertions now match the current manifest (status `applied (staging only)` for Table, Column, Sequence, Extension; production exclusion statement). No product behavior changed.

## Rollback Boundary

Revert the single PR; the frontend returns to staging-only validation.
