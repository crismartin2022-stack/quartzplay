# Proposal: Frontend Environment Configuration

## Intent

The production frontend has not deployed since 2026-09-02. Since PR #6 the destination validator accepts only staging, both in the build preflight and in browser runtime configuration, so every production build fails. Production must build and run with production destinations while staging keeps its isolation guarantees. Source: `exploration.md`.

## Scope

### In Scope
- Environment-aware validation: `APP_ENV` and `REACT_APP_ENV` must match and be `staging` or `production`.
- Production destinations must be `https` hosts listed in `PRODUCTION_HOSTS`; staging destinations must not be.
- Per-environment bot identity: production accepts only the production bot; staging keeps rejecting it.
- Add `juego.iaqp.lat` to `PRODUCTION_HOSTS`, closing the staging isolation gap.
- Strict-TDD tests for both environments, including the build preflight.

### Out of Scope
- Hardcoded production defaults in source files.
- Backend, bot, or API changes.
- Railway variable changes (owner-approved delivery step, recorded in tasks).

## Capabilities

### New Capabilities
- `frontend-environment-config`: explicit, coherent environment selection and destination rules for the frontend build and runtime.

### Modified Capabilities
None

## Approach

Exploration approach 1. One validation module owns environment and destination rules; `config.js` and `scripts/validate-env.js` both use it. `PRODUCTION_HOSTS` is the single source of truth: deny list for staging, allow list for production. Errors name variables and never print values. No user-facing, data, balance, or API behavior changes beyond restoring the production frontend.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `frontend/src/environmentValidation.js` | Modified | Environment-aware rules; `juego.iaqp.lat` |
| `frontend/src/config.js` | Modified | Resolve production and staging |
| `frontend/scripts/validate-env.js` | Modified | Coherent production preflight |
| `frontend/src/config.test.js` | Modified | Production cases; one existing case changes meaning |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Staging accidentally accepts production destinations | Low | Existing staging rejection tests stay; new mixed-environment tests |
| Production ships frontend changes merged since 2026-09-02 | Medium | Same code already runs in staging |
| Production still fails if Railway variables are missing | Medium | Variables set with owner approval before the release to `main`; verify deploy and page load |

## Rollback Plan

Revert the PR. Production stays on its last successful build, as today. Removing the new Railway variables restores the previous variable set.

## Dependencies

- Owner approval for seven production variables on `valiant-gentleness` and for the release to `main`.

## Success Criteria

- [ ] Frontend suite passes with production and staging cases.
- [ ] A build with production values passes the preflight; a build with staging values still passes; mixed values fail.
- [ ] The production frontend deploys successfully and serves the SPA.
