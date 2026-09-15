# Apply Progress: QuartzPlay Isolated Staging Bootstrap

## Unit 1: GitHub Gate

**Status:** Complete. GitHub-only Unit 1 finished.

### Completed Tasks

- [x] 1.1 RED: Approved remote `main` source was verified, owner authorization was recorded, and the same-repository `semgrep` check name was observed.
- [x] 1.2 GREEN: Created `staging` from freshly verified remote `main`; enabled branch protection requiring pull requests, one approval, stale-review dismissal, resolved conversations, strict `semgrep`, and administrator enforcement; direct pushes, force pushes, and deletion are blocked.
- [x] 1.3 Verify: Created deployment environment `staging` with custom branch policies enabled and only `staging` allowed.

### Sanitized Evidence

- Owner authorization for this GitHub-only unit: recorded.
- GitHub active identity and repository administrator capability: verified.
- Remote default branch: `main`; source commit was freshly verified immediately before branch creation. Exact SHA is retained in the operator result contract, not this value-free artifact.
- Same-repository workflow check observed: `semgrep`, completed successfully on the approved source.
- `staging` exists from the approved source and is protected.
- Required status check: strict `semgrep`.
- Pull request policy: one approval and stale-review dismissal required.
- Conversation resolution and administrator enforcement: enabled.
- Direct push, force push, and branch deletion: blocked.
- Deployment environment `staging`: exists; custom branch policy permits only `staging`.
- Two invalid protection payloads were rejected by GitHub before any rule was saved; final verified policy is the only applied rule.
- No source, tests, commits, pushes, pull requests, deployments, secrets, production environment, Railway, Supabase, or databases were changed.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | N/A | Console policy evidence | N/A | N/A: no source behavior | N/A: no implementation | N/A | N/A |
| 1.2 | N/A | Console policy configuration | N/A | N/A: no source behavior | N/A: console-only configuration verified | N/A: one policy contract | N/A: no source refactor |
| 1.3 | N/A | Console environment configuration | N/A | N/A: no source behavior | N/A: console-only configuration verified | N/A: one allowed branch | N/A: no source refactor |

### Test Summary

- **Mode:** Strict TDD, N/A for console-only Unit 1.
- **Tests written:** 0.
- **Tests executed:** 0.
- **Source changes:** 0.

### Workload / PR Boundary

- **Mode:** Feature branch chain, Unit 1 only; no delivery branch, commit, push, or pull request was created.
- **Boundary:** GitHub staging branch, protection/rules, and deployment environment only.
- **Delivery:** No commit, push, or pull request was created, as required.

### Rollback

With owner approval, remove only this GitHub slice in dependency order:

1. `GET /repos/crismartin2022-stack/quartzplay/environments/staging/deployment-branch-policies`; identify the policy whose name is `staging`.
2. `DELETE /repos/crismartin2022-stack/quartzplay/environments/staging/deployment-branch-policies/{policy_id}`.
3. `DELETE /repos/crismartin2022-stack/quartzplay/environments/staging`.
4. `DELETE /repos/crismartin2022-stack/quartzplay/branches/staging/protection`.

Retain `staging`. Delete `refs/heads/staging` only after separate owner approval and confirmation of no open pull request, deployment, or child-branch dependency. Do not alter `main`, production environment, source, Railway, Supabase, databases, secrets, deployments, commits, pushes, or pull requests.

### Next Gate

Unit 1 is complete. Next gate is separately owner-approved Unit 2 Railway Isolation.

## Unit 2: Railway Isolation

**Status:** Partial. Safe non-production runtime base is complete; API and worker creation, application bindings, application variables, and app deployment remain intentionally blocked.

### Completed Tasks

- [x] 2.1 RED: Juan Leon's explicit Railway staging authorization was recorded. A value-free checklist required explicit QuartzPlay project and environment selection, no local Railway link, distinct resources, no production identities, no application bindings, no app credentials, and disabled worker polling if a worker is later approved.

### Partial Tasks

- [ ] 2.2 GREEN: Created isolated Railway environment and empty PostgreSQL/Redis resources only. API/worker services, `DATABASE_URL` bindings, `APP_ENV`, allowlists, `POLLING_ENABLED`, Telegram credentials, and application deployments were not created or changed because that work requires separately approved staging application identities and credentials.
- [ ] 2.3 Verify: PostgreSQL and Redis deployment status is `SUCCESS`; API/worker deployment, bindings, and Redis application health are not applicable because no API or worker exists. Do not treat this as runtime readiness.

### Sanitized Evidence

- Railway operator identity matched authorized owner Juan Leon.
- QuartzPlay project was explicitly selected through Railway GraphQL; no `railway link`, local project linkage, implicit project, or implicit environment was used.
- Existing QuartzPlay environment inventory showed production only before mutation.
- Created non-production environment: `staging-isolated`.
- Creation input omitted `sourceEnvironmentId`, used no duplicate/copy option, and skipped initial deployments. Post-create verification reports no source environment.
- Created distinct cost-bearing resources: `staging-postgres-isolated` and `staging-redis-isolated`.
- Each resource has one newly provisioned volume; no production volume was copied or attached.
- Both resource deployments reached `SUCCESS`.
- Public PostgreSQL and verified Redis templates were inspected before use. They define only private networking and new resource-local volumes; they define no public domain, production variable, production credential, production volume, production binding, or production identity.
- No secret value was supplied, read, recorded, or displayed. Template-managed credential generation was not inspected.
- Staging environment contains only PostgreSQL and Redis. No API, worker, app source, repository source, public domain, application binding, Telegram credential, PSP identity, application variable, migration, seed, or database schema change was created.
- Cost note: two new persistent Railway resources and their volumes now exist. Workspace billing was not queried because this unit must not inspect or expose production aggregate usage.
- Production environment and resources were observed only for preflight selection and were not modified.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | N/A | Console authorization and isolation checklist | Explicit project/environment API selections | N/A: no source behavior | N/A: no implementation | N/A | N/A |
| 2.2 | N/A | Console infrastructure | API mutation and post-create inventory attestation | N/A: console-only | Partial: environment and data resources only | N/A | N/A |
| 2.3 | N/A | Console status attestation | Deployment status inventory | N/A: no source behavior | Partial: database service status only | N/A | N/A |

### Test Summary

- **Mode:** Strict TDD, N/A for console-only Unit 2.
- **Tests written:** 0.
- **Tests executed:** 0.
- **Source changes:** 0.

### Rollback

With owner approval, explicitly select QuartzPlay and `staging-isolated`, then delete `staging-redis-isolated`, delete `staging-postgres-isolated`, verify no remaining services or volumes, and delete only `staging-isolated`. Do not touch production or `staging`; do not delete any resource by an implicit local Railway context.

### Next Gate

Unit 2 safe infrastructure portion is complete. A separate explicit owner approval must authorize staging API/worker identities, application-safe variables and allowlists, and a credential-free deployment plan before completing tasks 2.2-2.3. Supabase remains Unit 3 and is untouched.

### Unit 2 Continuation: Service-creation Safety Gate

**Status:** Blocked before mutation. No API or worker service was created.

### Sanitized Evidence

- The Railway CLI/schema was inspected only through explicit QuartzPlay project and `staging-isolated` environment selectors; the locally linked IAQP production context was not used for mutation.
- `staging-isolated` contains only the previously created isolated PostgreSQL and Redis services. No API or worker service exists.
- Railway `serviceCreate` documents that an `environmentId` limits creation to that environment only when the environment is a fork; otherwise it creates the service in every environment that is not a fork.
- `staging-isolated` was intentionally created with no source environment, so it is not a fork. Therefore creating API or worker under the available API contract could create an instance outside the isolated staging boundary.
- The service creation interface supports optional source and variables, but a no-source/no-variable request does not remove the documented cross-environment creation risk.
- No service create, source connection, source disconnect, variable/configuration change, binding, domain, deployment, credential entry, token entry, database/Redis connection, or production action was attempted.

### Rollback

No continuation mutation occurred; no rollback is required for this attempt. Existing rollback remains unchanged: with owner approval, delete only isolated staging worker/API if later created safely, remove bindings, delete isolated Redis and PostgreSQL resources, then delete only `staging-isolated`. Do not alter production, local Railway linkage, source configuration, or `staging`.

### Next Gate

Do not create API or worker with current Railway `serviceCreate` semantics. Resume only with a Railway-supported creation path proven to target `staging-isolated` alone, without source deploy, variable/configuration inheritance, domains, bindings, credentials, or production instances.

### Unit 2 Continuation: Isolated Project Bootstrap

**Status:** Complete. Bounded project-only authorization finished.

### Sanitized Evidence

- Authorized project name: `QuartzPlay Staging`.
- Exact-name preflight: absent before creation.
- Post-create verification: project exists.
- No Unit 2 task is marked complete: this authorization created no environment, service, source, database, Redis resource, volume, variable, domain, credential, deployment, or binding.

### Rollback

With owner approval, delete only empty project `QuartzPlay Staging`. Do not alter production, `staging-isolated`, or any existing project or resource.

### Unit 2 Continuation: Disconnected Service Identities

**Status:** Complete for this bounded authorization. Task 2.2 remains partial because bindings, application configuration, and deployments are not authorized.

### Sanitized Evidence

- Verified explicit Railway project context: `QuartzPlay Staging` only.
- Created exactly two empty service identities: `staging-api` and `staging-worker`.
- Both services have no repository or image source, no deployment status or deployment record, no volume, no configured region or replica, and no generated URL.
- Both services are unlinked and have zero domains.
- Creation input supplied only the explicit project/environment context and service name. No GitHub source, local upload, Docker image, variable, domain, Redis/Supabase/PostgreSQL binding, credential, or deployment action was supplied or performed.
- The pre-existing Redis service in `QuartzPlay Staging` was observed only to verify project context; it was not modified, bound, inspected for values, or otherwise used.
- No production, old QuartzPlay resources, GitHub, Supabase, schema, or application source was changed.

### Rollback

With owner approval, explicitly select only `QuartzPlay Staging` and delete `staging-worker`, then `staging-api`. Verify both identities are absent and that no domain, source, deployment, variable, or binding was added. Do not delete or modify the pre-existing Redis service, any other Railway project, or production/old resources.

### Next Gate

Do not deploy or configure either service. Any source connection, variable, domain, database/Redis/Supabase binding, credential, or application deployment needs separate explicit owner approval.

### Unit 2 Continuation: Disconnected Frontend Service

**Status:** Complete for this bounded authorization. Task 2.2 remains partial because application configuration and deployment are not authorized.

### Sanitized Evidence

- Verified explicit Railway project context: `QuartzPlay Staging` only; its sole environment was explicitly selected.
- Preflight confirmed that `staging-frontend` did not exist in the selected project environment.
- Created exactly one empty frontend service identity: `staging-frontend`.
- Creation input contained only explicit project context, explicit environment context, and service name. It omitted source, branch, image, template, variables, registry credentials, domains, bindings, and deployment instructions.
- Post-create inventory confirms no repository or image source, deployment record or status, generated URL, domain, volume, region, replica, start command, or application variable on `staging-frontend`.
- No service source connect/disconnect, deployment, variable copy/configuration, domain creation, database/Redis/Supabase binding, credential action, production action, GitHub action, schema/code action, or secret value access occurred.
- Existing `Redis`, `staging-api`, and `staging-worker` services were inspected only to verify project context and were not modified.

### Rollback

With owner approval, explicitly select only `QuartzPlay Staging` and its sole environment, then delete only `staging-frontend`. Verify its absence and that no source, deployment, domain, variable, volume, binding, or credential was added. Do not modify or delete `Redis`, `staging-api`, `staging-worker`, any other Railway project, or production/old resources.

### Next Gate

Do not deploy or configure `staging-frontend`. Any source connection, variable, domain, database/Redis/Supabase binding, credential, or application deployment needs separate explicit owner approval.

### Unit 2 Continuation: Generated Public Domains

**Status:** Complete for this bounded authorization. Only Railway-generated public domains were added to the two approved empty service identities.

### Sanitized Evidence

- Explicit exact-name project preflight selected `QuartzPlay Staging` only; the project has exactly one environment and that environment has no source environment.
- Railway's documented `serviceDomainCreate` input was inspected before mutation. It accepts only explicit `serviceId`, explicit `environmentId`, and optional `targetPort`; no port was supplied. It accepts no source, deployment, variable, credential, binding, or custom-domain input.
- Before each creation, `staging-api` and `staging-frontend` were individually verified as source-free, never deployed, with zero active deployments, zero generated domains, and zero custom domains.
- Created one Railway-generated public domain for `staging-api` and one for `staging-frontend`. Domain values and IDs were suppressed from command output and are not recorded here.
- Final inventory: `staging-api` and `staging-frontend` each have exactly one generated domain, zero custom domains, no source, no deployment history, and zero active deployments.
- `staging-worker` remains source-free, never deployed, with zero active deployments, zero generated domains, and zero custom domains.
- No custom production domain, source, deployment, variable, credential, binding, GitHub, Supabase, code, production resource, or other Railway project was changed.

### Rollback

With owner approval, explicitly select only exact-name project `QuartzPlay Staging` and its sole environment. For each of `staging-frontend` and `staging-api`, list only Railway-generated service domains, confirm exactly one generated domain and zero custom domains, then delete that generated domain by its returned service-domain ID using `serviceDomainDelete`. Verify both selected services return to zero generated and zero custom domains. Do not delete a custom domain, modify `staging-worker` or `Redis`, use local Railway linkage, or alter any other project, environment, source, deployment, variable, credential, binding, GitHub, Supabase, code, or production resource.

### Next Gate

Do not connect source, deploy, configure variables, add bindings or credentials, or create any worker domain. Those actions remain outside this bounded authorization.

## Unit 3: Supabase Empty Staging Boundary

**Status:** Blocked before mutation. No Supabase project, schema, migration, seed, Auth user, Storage object, Edge Function, app binding, database link, or secret value was created, changed, read, or displayed.

### Task Status

- [ ] 3.1 RED: Juan Leon's fast-track authorization for zero-production-data staging was recorded. The approved schema authority is explicitly **none** for this empty-project bootstrap: the existing 80-table Supabase project and local linked reference are rejected as schema or migration inputs.
- [ ] 3.2 GREEN: Not started. Creation is blocked until an organization owner confirms billing/quota and an approved region. The available CLI also requires a database password, which this bounded run cannot supply or record.
- [ ] 3.3 Verify: Not applicable. There is no staging Supabase project to inventory or accept.

### Sanitized Evidence

- Supabase CLI is authenticated and can read one organization inventory and project inventory without exposing organization IDs, project references, URLs, credentials, or keys.
- Exact-name preflight found no existing project named `QuartzPlay Staging` in the authenticated inventory.
- The local Supabase linked reference is non-empty but inaccessible to the authenticated account; it was not used as a source or mutation target.
- The CLI exposes project creation, but non-interactive creation requires explicit organization ID, region, and database password. This run did not obtain, enter, print, persist, or infer any of those values.
- Organization creation permission, project quota, billing authorization, and approved region cannot be proven by read-only inventory. No creation request was sent to test them.
- No existing Supabase project, including the 80-table project, was inspected for schema, migrations, data, Auth, Storage, Functions, bindings, database links, or secrets.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 3.1 | N/A | Console authorization and source-boundary evidence | Read-only inventory and explicit rejected-source rule | N/A: no source behavior | Blocked: required owner/billing/region confirmation unavailable | N/A | N/A |
| 3.2 | N/A | Supabase project creation | Exact-name preflight | N/A: console-only | Not attempted: mutation gate unmet | N/A | N/A |
| 3.3 | N/A | Empty-inventory attestation | Post-create aggregate checks | N/A: no source behavior | Not applicable: no project exists | N/A | N/A |

### Test Summary

- **Mode:** Strict TDD, N/A for this console-only unit.
- **Tests written:** 0.
- **Tests executed:** 0.
- **Source changes:** 0.

### Rollback

No Supabase mutation occurred; no rollback action is required for this attempt. If the owner later creates the empty staging project, remove any staging-only bindings first (none are authorized here), then delete only `QuartzPlay Staging` after confirming it has no schema, migrations, seeds, Auth users, Storage objects, Edge Functions, database links, or dependents. Never alter the existing Supabase project, local linked reference, Railway, GitHub, production, or source files.

### Required Owner UI Action

In Supabase Dashboard, an organization owner must open the approved organization, confirm project quota and billing authorization, select the approved region, and create exactly `QuartzPlay Staging` as a new empty project. Do not import a schema, restore/copy data, run migrations or seeds, create Auth users, upload Storage objects, deploy Edge Functions, link any application or database, or enter application secret values. Return only a sanitized confirmation that the project exists and its inventories are zero; do not return IDs, URLs, keys, or passwords.

## IAQP Isolated Staging Bootstrap

**Status:** Blocked before mutation. No Railway project was created.

### Sanitized Evidence

- Exact-name Railway preflight found no project named `IAQP Staging`.
- Final exact-name inventory verification also found no project named `IAQP Staging` after the denied request.
- The authenticated Railway identity was verified before the request.
- A minimal `projectCreate` request containing only the approved project name was rejected with `Not Authorized`.
- No environment was manually added. Railway's project-default environment behavior was not reached because creation was denied.
- No service, source, deployment, variable, domain, credential, volume, database, Redis resource, local CLI link, or configuration was created or changed.
- No existing Railway project, production resource, QuartzPlay resource, Supabase resource, GitHub resource, or application code was modified.

### Rollback

No mutation occurred; no rollback action is required. If a future owner-authorized retry succeeds, delete only the empty project named `IAQP Staging` after confirming it has no non-default resources. Do not alter any existing project or production resource.

### Next Gate

An authorized Railway workspace owner must grant project-creation permission or create exactly the empty project `IAQP Staging`. Do not add resources or configuration.

## Live-State Reconciliation Pointer (2026-09-15)

A sanitized read-only inventory of the staging projects was recorded by `quartzplay-openspec-consolidation` in `live-state-reconciliation.md`. It closes no task; see that file for divergences and owner actions.
