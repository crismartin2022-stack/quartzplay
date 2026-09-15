## Exploration: quartzplay-staging-foundations

### Current State

QuartzPlay is a React 18/Create React App frontend with a FastAPI and Telegram backend using PostgreSQL through `asyncpg`. The repository has no active OpenSpec change for staging and no staging branch or environment. Its only checked-in workflow, `.github/workflows/semgrep.yml`, targets `staging` and `main`, but this is not evidence that a staging branch, deployment, or environment exists.

Validated authority is the protected current production API-connected catalog: 80 ordinary tables and 845 columns. This catalog, not a repository/Supabase baseline, governs staging-foundations decisions. A safe schema-only snapshot or catalog handling process MUST NOT expose connection credentials. Production API health is verified. GitHub Admin permission is available. The locally linked Railway CLI targets IAQP and MUST NOT be used implicitly for QuartzPlay work.

Historical chronology: earlier exploration material cited 46 public tables from an observation with no reproducible provenance. That count is stale and/or different in scope. Preserve it only as explicitly superseded history; it MUST NOT drive active authority, reconciliation, or migration decisions.

Repository evidence reinforces the migration gap: `bot/db.py` uses startup `CREATE TABLE IF NOT EXISTS` statements, while no complete tracked production migration history is established. `bot/casino_api.py` and `bot/db.py` obtain `DATABASE_URL` from environment variables; no values were read. OpenSpec reports a frontend Jest suite only and no backend test runner or backend test files.

### Affected Areas

- `openspec/config.yaml` — defines OpenSpec-only delivery, `ask-always`, 400-line review budget, and strict TDD policy.
- `openspec/specs/project-memory/spec.md` — records missing reproducible database provisioning and safety invariants for wallet ownership and idempotency.
- `bot/db.py` — startup schema bootstrap is source evidence, not a production schema authority or migration inventory.
- `bot/casino_api.py` — FastAPI database-pool setup and production-facing wallet/API boundary; future staging configuration must use explicit QuartzPlay scope.
- `supabase/migrations/*.sql` — contains a non-authoritative 80-table baseline; excluded as migration input unless later reconciled against Railway authority.
- `.github/workflows/semgrep.yml` — references `staging`, but does not create branch protection, environment, deployment, or test/build gates.
- `frontend/src/projectMemoryValidation.test.js` — only detected automated test suite; not a backend staging-contract test seam.

### Phases and Prerequisites

1. **Authority and access gate** — Name QuartzPlay operational owner, confirm production change window and rollback authority, and document explicit Railway project/service selection.
   - Prerequisites: GitHub Admin access; approved QuartzPlay Railway access; explicit confirmation that no IAQP CLI link may be reused.
   - Output: reviewed environment inventory with identifiers redacted and no credentials stored in Git/OpenSpec.

2. **Read-only production schema capture** — Using the approved protected catalog and, where needed, a private QuartzPlay-only access path, record schema metadata and table/extension/role/constraint inventory without secrets or production data.
   - Prerequisites: approved private tunnel method, source/destination identity verification, least-privilege read access, and an encrypted local handling location outside Git.
   - Output: reproducible, sanitized evidence for the authoritative 80-table/845-column catalog and comparison report.

3. **Schema reconciliation and migration baseline** — Compare authoritative Railway schema to source bootstrap and Supabase baseline; classify each difference as production-authoritative, obsolete, unknown, or intentionally excluded. Create versioned forward-only migrations only after review.
   - Prerequisites: phase 2 snapshot, named data owner, and approval of destructive/irreversible differences.
   - Output: migration manifest and ordered forward migration plan. Supabase artifacts remain reference-only until reconciled.

4. **Staging foundation design** — Define isolated Railway staging service/database, explicit QuartzPlay environment variables, reduced-risk integrations, secret provisioning path, GitHub branch/environment rules, and smoke verification plan.
   - Prerequisites: approved schema baseline, staging data classification, GitHub Admin decision, Railway service creation approval, and budget/delivery approval.
   - Output: environment contract and implementation-ready design. No production data copy is implied.

5. **Controlled staging build and verification** — Provision staging, apply reviewed migrations, configure explicit deployment bindings, and verify health plus database and API smoke checks. Add backend tests before backend production code only when a backend test runner/seam is introduced.
   - Prerequisites: approved implementation proposal/design/tasks, isolated credentials, rollback owner, and non-production data plan.
   - Output: auditable staging readiness evidence and rollback record.

### Data-Migration Boundaries

- Railway production PostgreSQL is sole schema and data authority for this change.
- Phase 2 is schema-only. It MUST NOT export production rows, credentials, connection strings, or private topology into repository artifacts.
- The repository/Supabase 80-table baseline MUST NOT establish authority, seed staging, overwrite protected catalog facts, or become a migration source without an approved reconciliation decision.
- Staging MUST begin with schema and approved non-production/sanitized data only. Wallet balances, payment records, personal identifiers, Telegram identities, agency credentials, and operational tokens require separate explicit data-classification and sanitization approval before any transfer.
- Migration work MUST be forward-only, ordered, and reversible through a defined rollback or compensating migration. No destructive migration proceeds without owner approval and backup/restore evidence.
- QuartzPlay wallet authority, duplicate-reference behavior, and IAQP cross-service boundaries remain unchanged; staging work MUST NOT imply a shared transaction or alter production contract semantics.

### Approaches

1. **Railway-authoritative staged foundation** — Capture Railway schema through a private tunnel, reconcile differences, then create isolated staging from approved migrations and sanitized seed data.
   - Pros: aligns staging with active production reality; avoids Supabase drift; supports auditable migrations and rollback.
   - Cons: requires controlled Railway access, owner decisions, and significant reconciliation before provisioning.
   - Effort: High.

2. **Supabase-baseline staging** — Provision staging directly from checked-in Supabase baseline.
   - Pros: lower immediate setup effort; checked-in files already exist.
   - Cons: repository count matching 80 tables does not prove identity or authority; risks invalid schema, runtime failure, and unsafe later migration.
   - Effort: Medium, but unacceptable risk.

3. **Application-bootstrap staging** — Start staging database from `bot/db.py` table creation only.
   - Pros: uses application-local source and avoids cloud read access initially.
   - Cons: startup bootstrap is not complete versioned provisioning; cannot establish production parity, constraints, extensions, or historical migrations.
   - Effort: Medium, but insufficient as foundation.

### Recommendation

Choose protected-catalog-authoritative staged foundation. Reconcile the validated 80-table/845-column catalog before creating migrations, staging infrastructure, GitHub rules, or secrets. This keeps current production API-connected scope authoritative, prevents the IAQP-linked local Railway CLI from selecting the wrong project, and avoids treating the repository/Supabase baseline as truth.

Use strict TDD where backend tests exist. No backend runner or tests are currently detected, so Phase 5 must first establish an approved backend test seam before backend behavior changes; frontend Jest remains available for frontend-only testable changes. No tests are required or run during this exploration.

### Risks

- Wrong Railway project selection could target IAQP because local CLI linkage is unsafe for implicit QuartzPlay operations.
- Schema-only capture may accidentally include credentials or private topology if tunnel commands/logs are copied into artifacts; keep commands and outputs sanitized and outside Git where needed.
- Production has recent activity. Any future data copy or migration without a cutoff, sanitization plan, backup, and rollback authority risks inconsistent wallet or payment data.
- Supabase baseline drift can create missing tables, extra tables, constraints, extensions, or incompatible data semantics if used as authority.
- No staging branch/environment exists. GitHub Admin permission enables future configuration but does not remove need for explicit branch protection, deployment, secret, and approval decisions.
- Existing CI runs Semgrep only; it does not prove build, frontend test, backend test, migration, or environment health.
- 400-line review budget is likely exceeded by migration inventory, environment contract, CI/branch work, and verification additions. Delivery strategy is `ask-always`; approval is required before choosing chained PRs or an explicit size exception.

### Review Workload Forecast

| Work unit | Likely changed lines | Review focus | Dependency |
|---|---:|---|---|
| Schema evidence, reconciliation, migration manifest | 180-300 | Authority, parity, destructive changes | Private schema snapshot |
| Staging environment and GitHub delivery configuration | 120-220 | Isolation, explicit targeting, secrets, protections | Approved foundation design |
| Migration/test/smoke implementation | 250-500+ | Data safety, rollback, API behavior | Approved baseline and test seam |

Decision needed before apply: Yes
Chained PRs recommended: Yes
400-line budget risk: High

Recommended review slices are: (1) read-only schema evidence and migration plan, (2) staging/GitHub foundation configuration, and (3) migrations plus focused tests and smoke verification. Under `ask-always`, no slice, chain, branch, GitHub setting, Railway setting, secret, database, or deployment action may begin without a later explicit user decision.

### Ready for Proposal

Yes. Proposal can define a Railway-authoritative staging-foundations capability with phase gates, non-production data rules, explicit QuartzPlay targeting, migration reconciliation, rollback requirements, and review slices. It MUST keep this exploration's no-change boundaries: no product, cloud, GitHub, secret, database, branch, or deployment changes.
