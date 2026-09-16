## Exploration: quartzplay-isolated-staging-bootstrap

### Current State

QuartzPlay has a merged authority contract in PR #21. It requires distinct Supabase, Railway API, Railway worker, PostgreSQL, and Redis identities; zero production rows; and smoke evidence that records outcomes without values. `origin` has no `staging` branch, and GitHub has one production environment only. `staging-foundations` also has no branch protection.

The backend already separates API and poller processes in `bot/Procfile`. `APP_ENV=staging` fails closed unless database, origin, Telegram, and admin identity allowlists are disjoint from production. The API offers `/livez` and database/schema-backed `/readyz`. Repository evidence has no Redis client, Redis configuration, Redis probe, or worker readiness endpoint. The app binds only `DATABASE_URL`; it does not establish that Supabase is an API runtime dependency.

The approved QuartzPlay Railway production PostgreSQL schema remains authoritative only for the existing `quartzplay-staging-foundations` change. Its reconciliation, migrations, data handling, and any Railway-to-Supabase production migration remain out of scope here.

### Affected Areas

- GitHub repository settings — human-created `staging` branch, protection/ruleset, and staging environment policy. No repository source change is required for this console slice.
- Railway QuartzPlay project — human-created staging environment, isolated API and worker services, isolated PostgreSQL and Redis identities, and staging-only variable bindings.
- Supabase non-production project — human-created empty staging schema. It is an isolated non-production target, not a source for migrations or an application binding without separate evidence.
- `bot/Procfile` — existing proof that API and worker can run as separate Railway processes.
- `bot/config.py` and `bot/tests/test_runtime_config.py` — existing staging isolation checks for database, origins, Telegram, and admin identities.
- `bot/casino_api.py` and `bot/tests/test_readiness.py` — existing value-free API liveness and database/schema readiness seam.
- `openspec/changes/quartzplay-staging-foundations/` — authority contract and separate production-schema migration boundary; not implementation scope for this change.

### Approaches

1. **Console-gated isolated bootstrap** — Create and protect `staging`, then create isolated staging resources manually with no schema import, no production rows, and no production binding.
   - Pros: Meets next-day staging target; preserves hard isolation; does not treat unreviewed Supabase files or `bot/db.py` as schema authority.
   - Cons: Redis and worker health cannot be application-proven without later code; manual console evidence needs owner review.
   - Effort: Medium

2. **Schema-first staging parity** — Reconcile Railway production schema, create migrations, then bootstrap all staging resources from the approved migration baseline.
   - Pros: Strongest reproducibility and schema parity.
   - Cons: Requires blocked authority/reconciliation gates; cannot meet next-day fast-track without expanding `quartzplay-staging-foundations`.
   - Effort: High

3. **Supabase baseline bootstrap** — Apply checked-in Supabase baseline to a staging target immediately.
   - Pros: Fastest apparent path.
   - Cons: Violates approved authority: Supabase baseline is reference-only, has known drift, and must not generate staging migrations.
   - Effort: Low, unsafe

### Recommendation

Use console-gated isolated bootstrap. Treat it as an empty, protected execution lane, not production parity. Create no migrations, copy no rows, and do not make Supabase an application dependency. Continue production schema reconciliation and any production-to-Supabase migration only in `quartzplay-staging-foundations`.

#### Human-Controlled Console Steps

1. GitHub administrator creates `staging` from approved `main` commit and records source commit outside secrets.
2. GitHub administrator protects `staging`: pull requests required, one approving review, stale approvals dismissed on new commits, conversation resolution required, force-push and deletion blocked, and no direct push. Require the existing `Semgrep / semgrep` check only after confirming its exact check name on a same-repository PR. Do not infer a required build or test check because CI currently runs Semgrep only.
3. GitHub administrator creates a `staging` environment with deployment branch policy limited to `staging`; add reviewers only if an accountable owner approves the gate. Existing production environment must remain unchanged.
4. Approved Railway operator explicitly selects QuartzPlay project and creates its staging environment. Do not use locally linked Railway CLI context because prior evidence says it targets IAQP.
5. In Railway staging environment, create separate API and worker services from the same reviewed source and separate PostgreSQL and Redis services. Confirm each resource identity differs from production without recording identifiers, hostnames, URLs, or values in OpenSpec.
6. Bind API and worker only to staging resource reference variables. API requires staging `DATABASE_URL`, `APP_ENV=staging`, staging origins, staging public API origin, and the complete disjoint identity allowlists required by `bot/config.py`. Worker requires its own staging `DATABASE_URL`, `APP_ENV=staging`, Telegram identity, allowlists, `POLLING_ENABLED`, and `WORKER_ID`.
7. Do not enable Telegram polling until a separately approved staging Telegram identity and staging admin set exist. A deployed worker with polling disabled is an infrastructure proof only, not a functional worker acceptance.
8. Create a separate non-production Supabase project or equivalent non-production staging boundary. Create only an empty staging schema after data-owner approval of schema source. Confirm zero application rows, storage objects, Auth users, and production credentials. Do not use checked-in Supabase baseline or production capture as input in this change.
9. Operator records a sanitized pass/fail checklist and owner approval. Never record secret values, URLs, connection strings, rows, resource identifiers, tunnel output, or private topology.

#### Minimum Safe Smoke Checks

| Check | Evidence allowed | Pass condition | Limitation |
|---|---|---|---|
| GitHub guard | Sanitized settings review | `staging` accepts PR-only delivery and blocks direct push/delete/force push. | Does not prove deployment.
| API liveness | HTTP status and `{"status":"live"}` only | Staging API `/livez` returns 200. | Process-only; no dependency proof.
| API readiness | HTTP status and documented non-value status only | Staging API `/readyz` returns 200, proving its configured database is reachable and required schema columns exist. | Does not establish production schema parity.
| Worker deployment | Railway deployment status and sanitized logs | Worker process starts with a distinct staging identity. | No worker health endpoint; cannot prove polling behavior.
| PostgreSQL identity | Operator attestation plus non-value probe result | API readiness succeeds against staging binding; no production binding evidence appears. | Do not print database target details.
| Redis isolation | Operator attestation plus Railway service health status | Staging Redis exists and is distinct from production. | Application has no Redis client/probe, so no runtime Redis use is proven.
| Supabase empty boundary | Data-owner attestation and aggregate zero-row/object/user result | Non-production staging schema contains no production rows and no seeded data. | Does not make Supabase authoritative or runtime-bound.

#### Exact Rollback Boundaries

| Slice | Roll back | Do not roll back or modify |
|---|---|---|
| GitHub `staging` guard | Remove only staging branch protection/ruleset and staging environment policy. Delete `staging` only when no open PR, deployment, or downstream branch references it and owner explicitly approves deletion. | `main`, production environment, existing `staging-foundations`, and merged PR #21.
| Railway API and worker | Disable/delete only staging deployments and services; stop worker before deleting its service. | Production services, variables, domains, and deployment history.
| Railway PostgreSQL and Redis | After dependent staging services are stopped, delete only staging database/cache resources and their staging-only bindings. | Production database/cache, any backups, volumes, or credentials.
| Supabase staging boundary | Remove only staging schema/project, its staging-only keys, and its empty non-production artifacts after app bindings are removed. | Production Supabase project, schemas, data, Auth users, storage, and any migration history.
| Source changes, if later required | Revert only merged slice commits in reverse dependency order. | Existing isolation contract and `quartzplay-staging-foundations` migration work.

#### Review Slices

| Slice | Scope and acceptance | Review budget | Rollback |
|---|---|---:|---|
| 1. GitHub staging lane | Human console evidence for protected `staging`, environment policy, and verified required-check name. No source change. | 0 source lines; operational checklist only | GitHub staging guard only |
| 2. Railway isolated runtime | Human console evidence for staging API, worker, PostgreSQL, Redis, staging-only bindings, and deployment health. No source change unless a missing configuration seam is separately approved. | 0 source lines; operational checklist only | Staging services and bindings only |
| 3. Empty Supabase boundary | Human console evidence for separate non-production empty staging schema and zero-row policy. No migration or seed. | 0 source lines; operational checklist only | Supabase staging boundary only |
| 4. Runtime observability gap, if approved | RED/GREEN tests before code for Redis readiness and worker health; keep each code PR under 400 changed lines and chain after prior slice. | Forecast required before apply | Revert code slice only |

`ask-always` applies before every console or code slice. `feature-branch-chain` applies to any future source PRs: first PR targets `staging`; each later PR targets its immediate predecessor. No code slice may start without an explicit user decision and strict TDD evidence.

### Risks

- Creating an empty staging schema cannot prove production schema parity; treating it as parity would bypass the blocked authority/reconciliation work.
- Railway project mis-selection can affect IAQP because local CLI linkage is unsafe for implicit QuartzPlay operations.
- Required GitHub check names must be observed before enforcement; guessing names can block all staging delivery.
- Staging worker polling can act on real Telegram input unless distinct staging bot credentials and identity allowlists are approved.
- Redis isolation is infrastructure-only today because repository evidence has no Redis runtime integration or health probe.
- Supabase temporary and migration files are untracked working-tree material; they are not approved staging input.

### Ready for Proposal

Yes. Proposal must preserve this fast-track boundary: protected delivery lane and isolated empty resources only. It must state that production schema/data migration, reconciliation, executable migrations, production-row handling, and Railway-to-Supabase production migration remain exclusively in `quartzplay-staging-foundations`.
