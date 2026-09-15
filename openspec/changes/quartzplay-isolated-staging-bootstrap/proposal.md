# Proposal: QuartzPlay Isolated Staging Bootstrap

## Intent

Create protected, empty staging lane. Production schema work stays separate.

## Scope

### In Scope
- PR-only `staging` branch and deployment environment.
- Separate API, worker, PostgreSQL, Redis, and Supabase identities with staging-only bindings.
- Zero production rows, objects, Auth users, domains, PSP, Telegram, or other credentials.
- Sanitized evidence, smoke contract, gates, rollback, and forecast.

### Out of Scope
- Reconciliation, migrations, seeds, data copies, production-row handling, and production migration: `quartzplay-staging-foundations` only.
- Production resources, credentials, deployments, source changes, Redis readiness, or worker health.

## Capabilities

### New Capabilities
- `isolated-staging-bootstrap`: Isolated empty staging, evidence, and rollback.

### Modified Capabilities
- None.

## Approach

Create protected `staging` from approved `main`; restrict deployment to it; explicitly select QuartzPlay; create distinct resources. Record outcomes only. Keep polling disabled pending separate staging Telegram/admin approval.

## Console Gates

- User approves each console slice; verify GitHub check name first.
- Explicit QuartzPlay selection; never use local Railway CLI linkage.
- Data owner approves Supabase schema source; owner accepts evidence.

## Smoke Contract

| Check | Pass | Limit |
|---|---|---|
| GitHub | PR-only `staging`; push/delete blocked. | No deploy proof. |
| API | `/livez`, `/readyz` return 200; value-free. | No parity proof. |
| Worker/Redis | Worker deployed; Redis healthy. | No runtime probes. |
| Supabase | Rows, objects, users zero. | No binding proof. |

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| Consoles | New | Isolated resources and policies. |
| `bot/Procfile`, `bot/config.py` | Referenced | Existing split/isolation. |
| `quartzplay-staging-foundations` | Boundary | Production schema/migrations. |

## Risks

| Risk | Mitigation |
|---|---|
| Wrong project/binding | Manual selection and attestation. |
| Empty schema claimed parity | Block migrations/data. |
| Production Telegram use | No credentials; polling disabled. |

## Rollback Plan

Remove staging rules, then API/worker, PostgreSQL/Redis, then Supabase after bindings. Delete `staging` only with owner approval and no dependents. Never alter production or `quartzplay-staging-foundations`.

## Dependencies

- GitHub admin, Railway operator, data owner, owner acceptance.

## Success Criteria

- [ ] Gates and value-free smoke checks pass with owner approval.
- [ ] Identities distinct; production data, domains, PSP, Telegram credentials absent.
- [ ] Database migration work stays separate.
- [ ] Three console slices, 0 source lines. Decision needed before apply: Yes. Chained PRs recommended: No. 400-line budget risk: Low. Future code: RED/GREEN TDD, new forecast, then feature chain (`staging`, then immediate predecessor).
