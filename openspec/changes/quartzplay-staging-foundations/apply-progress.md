# Apply Progress: QuartzPlay Staging Foundations

## Work Unit: Evidence (PR 1)

**Status:** Complete for Evidence task 1.2. Documentation-only reconciliation evidence is complete; every destination action remains blocked pending explicit approval.

### Completed Tasks

- [x] 1.3 Updated the sanitized migration manifest with approval gates, blocked destination actions, legacy-history preservation, and documentation-only rollback.
- [x] 1.1 Generated review-safe aggregate evidence and rejected the authority candidate as incomplete and unsafe.
- [x] 1.2 Validated the sole protected schema catalog by required aggregate counts and sanitization, then produced a review-safe opaque per-object reconciliation inventory.

### Corrected Provenance

- The earlier rejected candidate remains rejected. Its old aggregate record and checksum were removed rather than re-attributed to the validated catalog.
- The validated catalog is described only as protected production schema evidence. Its source identity, location, raw content, object names, identifiers, and checksums remain outside Git.
- Repository migrations, `bot/db.py`, and the empty destination baseline remain reference-only. No migration, destination query, cloud/configuration, deployment, production, or Git action occurred.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `frontend/src/projectMemoryValidation.test.js` | Unit | 10/10 passed | 1 failing inventory-evidence test written first | 11/11 passed after review-safe evidence update | 2 distinct incomplete/unsafe evidence paths | Safety-literal refactor; 11/11 passed |
| 1.2 | `frontend/src/projectMemoryValidation.test.js` | Unit | 11/11 passed | 1 failing opaque-inventory test written first | 12/12 passed after validated inventory and rejected-candidate correction | Category coverage plus derived-type and constraint-backed-index branches | Updated superseded rejection assertions; 12/12 passed |
| 1.3 | `frontend/src/projectMemoryValidation.test.js` | Unit | 8/8 passed | Written before manifest update | 10/10 passed | 2 distinct manifest-policy assertions | None needed |

### Test Summary

- **Mode:** Strict TDD.
- **Focused command:** `npx react-scripts test --watchAll=false --runInBand src/projectMemoryValidation.test.js`
- **RED result:** 1 failed, 11 passed; missing opaque reconciliation inventory proved the test exercised the intended behavior.
- **GREEN result:** 1 suite passed, 12 tests passed.
- **Tests written:** 1 in this continuation; 4 cumulative.
- **Approval tests:** None — no production refactor.
- **Runtime harness:** N/A — this work unit changes documentation validation only; no runtime boundary exists.

### Rollback Boundary

Remove only the validated review-safe inventory, rejected-candidate correction, this apply-progress record, related task-status notes, and paired documentation test assertion. No migrations, cloud resources, production data, runtime bindings, configuration, deployments, or Git state were changed.

## Work Unit: Verification-Blocker Repair

**Status:** Complete for task 2.1. This scope repaired only validation evidence and the quarantined legacy-reference EOF; no migration execution or external action occurred.

### Completed Task

- [x] 2.1 Updated the stale frontend assertion for the non-authoritative legacy quarantine, synchronized only stale manifest facts, and removed one trailing blank line from the quarantined SQL reference.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `frontend/src/projectMemoryValidation.test.js`, `bot/tests/test_staging_schema.py` | Unit/static | 11/12 frontend assertions passed; target stale assertion failed | Updated quarantine assertion failed against stale manifest text | 12/12 frontend assertions passed after truthful manifest update; 5/5 static tests passed after current-local hash update | Frontend verifies non-authoritative quarantine and no database application; static test verifies the changed reference hash | None needed; full strict runner remained green |

### Verification

- Focused frontend RED: 1 failed, 11 passed after the assertion change.
- Focused frontend GREEN: 1 suite, 12 tests passed.
- Static provenance RED: 1/5 failed after the one-line EOF removal because the recorded current-local hash changed.
- Static provenance GREEN: `python3 -m unittest bot/tests/test_staging_schema.py` — 5/5 passed after updating that current-local hash only.
- Configured strict runner: `cd frontend && npx react-scripts test --watchAll=false --runInBand` — 2 suites, 29 tests passed.

### Scope and Rollback Boundary

- No extension, replay, database, cloud, configuration, deployment, production, Git delivery, commit, push, or PR action occurred.
- Revert only the paired frontend assertion, two truthful migration-manifest rows, current-local hash, one EOF blank-line removal, and this task/progress record.

### Next Gate

Explicit review and data-owner approval are required before any classified destination action, extension translation, legacy-ledger decision, or later task. No Foundation, Relational, or Security task may start from this evidence alone.

## Work Unit: Foundation (PR 2)

**Status:** Blocked before implementation. The maintainer explicitly accepted `size:exception` for the full Foundation work unit. That resolves the review-budget gate, but does not replace the protected-snapshot authority gate.

### Maintainer Authorization and Execution Result

- Maintainer authorized `size:exception` and schema-only copying/versioning from the unique validated protected production snapshot for Foundation only. Approved material is limited to DDL table, column, type, index, sequence, and extension definitions; rows, credentials, URLs, resource IDs, private paths, source checksums, and secrets remain prohibited.
- The unique validated snapshot was not available to this executor. Only empty legacy baselines and a rejected, sensitive infrastructure inventory were accessible; both are prohibited as migration authority.
- Result: no Foundation migration, static-test, or manifest-derived object inventory was fabricated. This execution changed **0 Foundation schema/test lines**; documentation authorization update: **5 additions, 0 deletions** in this apply-progress record.
- No Supabase/database apply, cloud/configuration/deploy/production action, commit, push, or PR occurred.

### Pre-Implementation Review

- Evidence and previous apply progress were read and preserved. The validated protected snapshot remains internal; no raw snapshot content, identifiers, checksums, rows, connection details, or topology were added to Git.
- The approved Foundation scope requires at least 80 table definitions and 845 column definitions. Even one-line representations exceed 925 added migration lines before extensions, standalone sequences, defaults, identity/generated properties, static validation tests, or manifests.
- The planned PR 2 boundary is therefore too broad for one reviewable work unit. No RED test, migration, validation manifest, database command, Supabase action, cloud/configuration change, or runtime binding was performed.
- The only repository SQL catalog available to this executor is the existing legacy baseline, which the approved manifest classifies as reference-only. It also contains dump ownership/state statements and has no approved extension translation. Using it would violate the approved design and the instruction to use only the validated protected snapshot.
- A temporary RED static-contract test was written first and then removed when the authority check failed. The configured backend pytest executable is unavailable in this environment; no production or migration artifact remains from that attempt.

### Required Slice Boundary

Split PR 2 into autonomous foundation sub-slices before implementation. A first slice may contain only preflight, approved extension translation, standalone non-derived types/sequences, and static checks for that exact subset, with its paired tests and rollback boundary. Tables, columns, defaults, and identity/generated properties remain a later Foundation slice and must not begin in this batch.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1-2.3 | `bot/tests/test_staging_schema.py` (removed) | Unit | N/A (new test) | Written first; no Foundation migration files existed | Blocked: validated protected snapshot and approved extension translation were not available to this executor; configured backend pytest executable unavailable | N/A: authority gate blocks implementation | Removed temporary test; no implementation files remain |

### Verification

- `cd frontend && npx react-scripts test --watchAll=false --runInBand` — 2 suites, 29 tests passed.
- `git diff --check` — passed.
- Sensitive-pattern scan of Foundation migration paths and this apply record — passed; no new Foundation migration files exist.
- Backend static-test command — blocked: the prior isolated pytest executable is absent and the system Python has no `pytest` module. No fallback test dependency was installed.

### Rollback Boundary

No Foundation implementation files changed. Foundation migration/test changed-line count is **0 additions + 0 deletions = 0**. Roll back this blocked-status record only; Evidence work and unrelated dirty repository state remain untouched.

## Work Unit: Disposable Replay Execution (task 2.3)

**Status:** Blocked safely before any reset. Task 2.3 remains unchecked.

### Runtime Gate Result

- The local-only policy was read: exactly two seedless local resets are required.
- Relevant static harness and Foundation tests passed before the execution attempt.
- Before both planned resets, the target was independently verified as loopback-only, marked `local-reset-only`, and free of cloud Supabase environment variables.
- The explicit `--execute` harness performed its own safety preflight and refused the target because its application `public` schema was not empty.
- No `supabase db reset`, migration application, remote connection, cloud Supabase action, Railway action, configuration change, deployment, production action, commit, push, or PR occurred.
- No receipt was written. The empty local receipts directory contains no execution evidence.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.3 | `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | Unit/static plus local runtime gate | 14/14 passed; configured strict runner 29/29 passed | N/A: approved runtime execution of existing harness | Blocked: harness fail-closed preflight found non-empty application schema before reset | N/A: no reset may follow failed preflight | N/A: runtime contract requires both clean replays, neither began | N/A: no source change |

### Blocker and Retry Boundary

The local target must be recreated or otherwise independently proven empty **before** invoking the harness. Retry only with the same local-disposable marker, loopback target, absent cloud Supabase environment, explicit `--execute`, and exactly one harness invocation (two internal `--local --no-seed` resets). Do not substitute a remote, staging, or production target.

### Retry Attempt: Test Safety Gate

**Status:** Blocked before local lifecycle recreation.

- The app-repository, no-cloud environment preflight passed: no cloud Supabase target variables and no non-loopback database target were present.
- Relevant static harness/Foundation tests passed: `python3 -m unittest bot/tests/test_disposable_replay.py bot/tests/test_staging_schema.py` — 14/14 passed.
- The configured full frontend runner stopped during `pretest`: `node scripts/validate-env.js` reported invalid or missing `APP_ENV`, `REACT_APP_ENV`, `REACT_APP_API_URL`, `REACT_APP_IAQP_URL`, `REACT_APP_APP_ORIGIN`, `REACT_APP_CASINO_HOSTS`, and `REACT_APP_BOT_USERNAME`. No Jest suite started.
- Strict TDD safety-net policy requires stopping on this pre-existing runner failure. No Supabase, Docker, local volume, reset, harness, receipt, cloud, configuration, deployment, production, or Git action occurred.

### Retry Boundary

Restore a valid **local-only, non-secret** frontend test environment through the approved local harness/environment source, rerun static and configured full tests, then recreate only the disposable local Supabase/Docker target and invoke the approved replay harness once with `--execute` (its two internal seedless local resets produce replay A/B evidence). Do not add, alter, or disclose environment values; do not use a remote target.

## Work Unit: Extension and Static Remediation (PR 1)

**Status:** Complete for tasks 1.2 and 1.3. Scope stayed limited to static extension contract, manifest wording, verified whitespace cleanup, and test/config truthfulness.

### Completed Tasks

- [x] 1.2 Added static contract checks for provider-owned `extensions`, exact available versions, installed extension drift, guarded extension creation, known whitespace blockers, and test-runner configuration truthfulness.
- [x] 1.3 Replaced application-owned schema creation with Supabase schema preflight, exact version checks, guarded extension creation, and installed-state revalidation.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.2 | `bot/tests/test_staging_schema.py` | Unit/static | 5/5 static tests passed | New extension-contract assertion failed on `CREATE SCHEMA extensions`; whitespace assertion failed on two known artifacts; runner configuration assertion failed on stale `configured_script: false` | 8/8 static tests passed after SQL, whitespace, and configuration truthfulness remediation | Existing lexical-chain, object-count/parity, DML, provenance, and package-script cases exercise independent paths | Updated obsolete extension idempotency expectation; 8/8 passed |
| 1.3 | `bot/tests/test_staging_schema.py` | Unit/static | 5/5 static tests passed | Same extension-contract RED exposed missing provider preflight, exact availability, and installed-state validation | 8/8 static tests passed after minimal transactional SQL change | Compatible-state and drift assertions cover distinct required contract paths | None needed; SQL remains one transaction |

### Verification

- Focused static RED: `python3 -m unittest bot/tests/test_staging_schema.py` — extension failure, then whitespace failures, as expected.
- Focused static GREEN: `python3 -m unittest bot/tests/test_staging_schema.py` — 8/8 passed.
- Full strict runner: `cd frontend && npx react-scripts test --watchAll=false --runInBand` — 2 suites, 29/29 passed.
- Build: `cd frontend && npm run build` remains blocked before compilation by required unset staging variables. No configuration values were supplied or changed.
- Runtime harness: N/A — static-only remediation; no database, Supabase, cloud, deployment, or runtime action is authorized.

### Rollback Boundary

Revert only the extension migration, paired static/frontend assertions, Foundation current-local hash, manifest wording, identified whitespace-only edits, task status, and this progress section. Do not alter Foundation table/column DDL, any Relational/Security object, or external state.

## Work Unit: Disposable Replay Harness (PR 2)

**Status:** Complete for task 2.2. This work creates static, local-only replay tooling; it does not execute a reset, start Docker, connect to Supabase, or alter a database.

### Completed Task

- [x] 2.2 Added local-disposable target validation, two-reset command planning, empty-target preflight, normalized in-memory catalog/ledger comparison, count/ownership/extension/no-row/deferred-object validation, and redacted JSON receipts.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.2 | `bot/tests/test_disposable_replay.py` | Unit/static | 8/8 `test_staging_schema.py` passed | Missing harness import failed; missing two-reset-plan, policy, and process-only password helpers failed; cloud-environment safety case failed | 6/6 harness tests and 8/8 Foundation static tests passed | Local marker/cloud rejection, two seedless reset plan, nonzero-row/deferred-object failure, and redacted mismatch receipt cover separate paths | Extracted policy loader, process-only credential handoff, and dynamic per-table row count; tests remained green |

### Verification

- Focused/static: `python3 -m unittest bot/tests/test_disposable_replay.py bot/tests/test_staging_schema.py` — 14/14 passed.
- Syntax: `python3 -m py_compile bot/tools/disposable_replay.py` — passed.
- Configured strict runner: `cd frontend && npx react-scripts test --watchAll=false --runInBand` — 2 suites, 29/29 passed.
- Diff whitespace: `git diff --check` — passed.
- Sensitive-pattern scan of new harness and policy — passed; no connection strings, credentials, API keys, secrets, or checksums added.
- Runtime harness: deliberately not run. No `supabase` command, Docker action, database connection, reset, migration apply, cloud/configuration/deployment/production action, Git delivery action, commit, push, or PR occurred.

### Runtime Gate and Rollback Boundary

- A future approved execution must provide the exact disposable marker, a loopback database URL through the process environment, no cloud Supabase environment, and `--execute`. The runner then plans and performs exactly two local `supabase db reset --local --no-seed` calls; task 2.3 remains responsible for authorizing and performing that runtime proof.
- Revert only `bot/tools/disposable_replay.py`, `bot/tools/disposable-replay-policy.json`, `bot/tests/test_disposable_replay.py`, this task mark, and this progress section. No external state exists to roll back.

## Work Unit: Foundation (PR 2, authorized continuation)

**Status:** Partial. Maintainer-approved `size:exception` enabled the Foundation schema-only
DDL slice. Static artifacts are complete; disposable database application/replay remains
intentionally unperformed because this execution is forbidden from applying to Supabase or any
database.

### Completed Tasks

- [x] 2.1 Added static Foundation checks for exact aggregate coverage, lexical migration order,
  schema-only DDL, absence of DML, fail-closed creation, and sensitive-provenance patterns.
- [x] 2.2 Generated ordered Foundation DDL and a sanitized static manifest from the validated
  protected catalog: extension handling, derived-type exclusion, 72 sequences, 80 tables, 845
  columns, defaults, and sequence ownership links.
- [ ] 2.3 Not performed. No disposable, Supabase, production, or other database was targeted.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.1 | `bot/tests/test_staging_schema.py` | Unit | N/A (new file) | Missing manifest/migrations produced 2 errors | 2/2 passed after static manifest and DDL generation | Separate complete-manifest and ordered-SQL behaviors; extension-version assertion failed before exact version DDL | Corrected regex scope to test creation guards, not capability preflight; 2/2 passed |
| 2.2 | `bot/tests/test_staging_schema.py` | Unit | N/A (new files) | Exact extension-version assertion failed before DDL version pinning | 2/2 passed after versioned extension definitions | Covers supported creation and excluded provider/built-in extension policy | None needed |
| 2.3 | N/A | N/A | N/A | N/A — task not started | N/A | N/A | N/A |

### Test and Safety Results

- **Mode:** Strict TDD.
- **Focused command:** `python3 -m unittest bot/tests/test_staging_schema.py`
- **RED results:** missing Foundation artifacts produced 2 errors; exact extension-version check
  then produced 1 failure.
- **GREEN result:** 2 tests passed.
- **Static parity:** 80 tables, 845 columns, 72 sequences, 162 derived types, and 5 extension
  records. Constraints, indexes, and view remain unimplemented Relational scope.
- **Runtime harness:** N/A — this schema-only work unit has no runtime boundary and no database
  apply is authorized.
- **Database apply/replay:** Not run by explicit scope restriction.

### Rollback Boundary

Remove only `supabase/foundation-schema-manifest.json`, the three
`20260914*_quartzplay_foundation_*.sql` Foundation migrations,
`bot/tests/test_staging_schema.py`, and these Foundation task/progress/manifest updates. Do not
touch legacy migrations, Evidence artifacts, unrelated dirty state, runtime code, or any
database/cloud/deployment/configuration state.

## Work Unit: Chain Repair (PR 1 child)

**Status:** Blocked. The executable-ledger RED test passed its intended failure checks, but an
out-of-band SHA-256 comparison against the original legacy file showed the available patch move
changed its bytes. Task 1.1 is not complete and remains unchecked.

### Work Performed

- Added static checks requiring exactly the three authoritative `20260914` Foundation migrations
  in the executable ledger, no retired `20260907` versions, no fake migration-ledger inserts, and
  a non-executable legacy-reference declaration in the Foundation manifest.
- Retired the three legacy migration-path files and added executable-chain/legacy-reference
  metadata to `foundation-schema-manifest.json`.
- Stopped before extension repair, runner repair, replay, Relational/Security work, staging apply,
  or any cloud/database/configuration/deployment/production action.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `bot/tests/test_staging_schema.py` | Unit/static | 2/2 passed | 2 new ledger/reference tests failed as expected: legacy files remained executable and reference file was absent | Ledger tests pass, but task is blocked: out-of-band byte-integrity comparison fails | Two independent behaviors: executable-ledger exclusion and non-executable reference | Not started; task must not be accepted while byte integrity fails |

### Verification

- Safety net: `python3 -m unittest bot/tests/test_staging_schema.py` — 2 tests passed before edits.
- RED: `python3 -m unittest bot/tests/test_staging_schema.py` — 1 failure and 1 error, proving
  legacy files still appeared in executable migrations and the reference path did not exist.
- Current static tests pass after removing the source-checksum assertion because source checksums
  are prohibited from artifacts. The task remains blocked because the out-of-band byte-integrity
  comparison failed.
- Runtime harness: N/A — static-only migration-chain work; no database target is authorized.

### Required Decision

Restore the original legacy baseline bytes from an approved authoritative local copy, then rerun
the static test. No substitute baseline, regenerated SQL, or changed integrity assertion is
permitted.

### Rollback Boundary

Revert only the legacy-path retirement, legacy-reference file, Foundation-manifest executable-chain
metadata, static test additions, and this section. No unrelated dirty files or external state were
touched.

## Work Unit: Chain Repair Provenance Remediation (PR 1 child)

**Status:** Complete for task 1.1. Maintainer approved the guarantee change: original legacy
baseline byte-exact provenance is unrecoverable because the files were never tracked.

### Completed Task

- [x] 1.1 Quarantined the current local legacy baseline as a non-authoritative reference, recorded
  its current local SHA-256 only, and retained Foundation 80-table/845-column DDL as the sole
  executable staging chain.

### Provenance Boundary

- No historical byte-exact preservation is claimed.
- `supabase/legacy-reference/20260907191524_baseline.sql` is non-executable and non-authoritative.
- The manifest labels its provenance as `current-local-untracked-baseline`, its historical
  provenance as unrecoverable, and records only its current local hash.
- No legacy `20260907*` SQL remains in `supabase/migrations/`; no ledger repair, fake applied
  entry, extension repair, replay, Relational/Security work, or staging database apply occurred.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 1.1 | `bot/tests/test_staging_schema.py` | Unit/static | 4/4 passed | New provenance-contract test failed with missing manifest field | 5/5 passed after truthful manifest and OpenSpec update | Checks executable exclusion and current-local provenance separately | Isolated permitted local-hash field from sensitive-provenance scan; 5/5 passed |

### Verification and Rollback

- Focused static command: `python3 -m unittest bot/tests/test_staging_schema.py`.
- Runtime harness: N/A — static-only chain metadata; no database target is authorized.
- Rollback boundary: only this provenance record, task status, Foundation manifest legacy-reference
  fields, paired static test, and current local quarantine reference. Unrelated dirty files and all
  cloud, configuration, deployment, production, and database state remain untouched.

## Unit 2 Continuation: Local Disposable Replay Readiness

**Status:** Ready for the separately authorized local disposable replay. No replay, reset, Docker,
Supabase, cloud, deployment, or committed environment configuration mutation occurred.

### Completed Readiness Evidence

- The frontend strict runner received all required variables through process-scoped, non-secret
  local-only injection. No environment file was read, printed, created, or changed.
- Values used only local `.localhost` HTTPS hostnames, `staging` environment identity, a
  non-production bot username, and a local-only casino-host allowlist. No remote destination was
  used.
- Configured strict frontend runner passed: 2 suites, 29 tests.
- Static replay/Foundation harness passed: 14 tests.
- Task 2.3 remains incomplete: two independent disposable Supabase-compatible reset-and-apply
  replays were deliberately not started.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.3 readiness preflight | `frontend/src/config.test.js`, `frontend/src/projectMemoryValidation.test.js`, `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | Existing strict runner and static harness | ✅ 29 frontend + 14 static tests passed with process-scoped local-only environment | N/A: no source behavior changed | ✅ Existing contracts passed | N/A: no new production behavior | N/A: no source refactor |

### Next Gate

Environment precondition is restored. With separate authorization, recreate or independently
prove empty only the disposable local target, then invoke the approved replay harness once with
`--execute`. Do not substitute a remote, staging, or production target.

## Work Unit: Local Disposable Replay (task 2.3)

**Status:** Complete. One approved local-only harness invocation performed exactly two internal
`supabase db reset --local --no-seed` replays against a recreated loopback-only disposable target.
The target was destroyed after receipt capture.

### Completed Task

- [x] 2.3 Cleared stale local Supabase metadata, proved no remote link/cloud environment, recreated
  a loopback-only platform baseline, and captured matching redacted replay A/B receipts.

### Safety and Receipt Evidence

- Local metadata link records were absent before execution; cloud Supabase target variables were
  explicitly removed from the harness environment.
- The harness accepted only the disposable loopback target and performed its empty-ledger/table
  preflight before either reset.
- Both receipts validate: Foundation **80 tables**, **845 columns**, **72 sequences**, exact
  extensions, exact three-entry Foundation ledger, sequence ownership, zero application rows, and
  zero deferred relational/security objects.
- Receipt comparison passed. The JSON artifact is redacted: no URLs, credentials, identifiers,
  catalog names, rows, checksums, or topology are recorded.
- Local disposable containers and volumes were destroyed after capture. No remote, linked database,
  QuartzPlay Staging, production, Railway, commit, push, or PR action occurred.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.3 | `bot/tests/test_disposable_replay.py` | Unit + local disposable replay | ✅ 6/6 existing harness tests passed | ✅ Missing-ledger preflight and exact-ledger receipt tests failed first | ✅ 9/9 harness tests passed; replay A/B receipt matched | ✅ Absent/present ledger plus valid/invalid Foundation ledger cases | ✅ Extracted redacted preflight and excluded provider baseline ACLs from deferred-security detection |

### Verification

- `python3 -m unittest bot/tests/test_disposable_replay.py` — 9/9 passed.
- `cd frontend && npx react-scripts test --watchAll=false` — 2 suites, 29/29 passed.
- `python3 -m unittest bot/tests/test_staging_schema.py` — 8/8 passed.
- `local-disposable-replay-receipt.json` — validated A/B comparison match with both receipts green.

### Rollback Boundary

Revert only the replay harness/test refinements, task mark, receipt, and this progress section.
The local disposable target has already been destroyed; no external rollback is needed.

## Supersession: Replay Parity Remediation

**Status:** Previous task 2.3 completion claim is superseded. It cannot prove two independent targets because the runner reset one target twice, and its receipt omitted per-target preflight/platform-version evidence.

### Completed Remediation

- [x] Added local-only guards for two distinct loopback target identities and two distinct Supabase workspaces.
- [x] Added local link-metadata absence gate before either reset.
- [x] Added receipt preflight/platform-version fields and hardened validation for full table/column/default, sequence/ownership, and exact extension parity, including extra-object rejection.
- [x] Added negative tests for duplicate targets/workspaces, link metadata, changed defaults, wrong sequence ownership, and extra extensions.
- [x] Materialized feature-branch-chain evidence without a branch, commit, push, or pull request.
- [ ] Re-run task 2.3 only after two separate local disposable workspaces are recreated and validated; no remote substitute is permitted.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Replay parity remediation | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 17/17 replay/Foundation tests passed | ⚠ FAILED strict-TDD sub-behavior: local-link guard was implemented before its negative test; independent-target/workspace and policy contracts had RED failures first | ✅ 21/21 replay/Foundation tests passed | ✅ Duplicate target/workspace, link metadata, changed default, wrong ownership, and extra extension paths | ✅ Extracted expected-catalog and target/workspace guards; tests green |

### Runtime and Rollback Boundary

- Runtime proof is blocked locally: `supabase status --output json` reported no local database container. No reset, Docker lifecycle, migration apply, or external target action followed.
- One read-only Supabase project-list command was issued while diagnosing the missing local target. It performed no configuration or database mutation; all further remote interaction stopped.
- Roll back only `bot/tools/disposable_replay.py`, its policy/tests, the superseded receipt, task status, this section, and `delivery-chain-evidence.md`.

## Work Unit: Portless Disposable Replay (PR 2 child)

**Status:** Complete for tasks 2.3–2.6. Static-only implementation; no Docker container, replay, database, remote, linked, cloud, staging, or production action ran.

### Completed Tasks

- [x] 2.3 Replaced loopback/reset planning with strict portless policy, two distinct database/tool/network/volume identities, `--internal` networks, pinned `supabase/postgres:15.8.1.060`, and pinned `supabase/cli:2.113.0` command construction.
- [x] 2.4 Routed lifecycle through host Docker commands only; migration tooling uses internal database DNS and `supabase migration up --db-url`, while catalog queries run inside the database container.
- [x] 2.5 Added preflight extension capability checks and post-apply exact catalog, ledger, extension, row, ownership, deferred-object, platform-version, and A/B normalized-parity validation.
- [x] 2.6 Added redacted receipt construction, published-port inspection, forced `finally` cleanup for tools/databases/volumes/networks, and receipt replacement only after both replays pass.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.3 | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 13/13 passed | ✅ New imports for portless command/topology/environment behavior failed | ✅ 10/10 focused replay tests passed | ✅ Pinned-command plus remote/linked/host-TCP rejection branches | ✅ Shared topology/policy validators extracted |
| 2.4 | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 13/13 passed | ✅ Missing Docker command builders failed at import | ✅ 10/10 focused replay tests passed | ✅ A/B resource separation and internal migration-command behavior | ✅ Command construction remains pure and runtime-free |
| 2.5 | `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | Unit/static | ✅ 18/18 passed | ✅ Preflight extension-capability expectation failed | ✅ 19/19 focused static tests passed | ✅ Exact-compatible versus missing-extension preflight paths | ✅ Reused normalized catalog validation |
| 2.6 | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 10/10 passed | ✅ Missing final redacted-receipt constructor failed at import | ✅ 11/11 focused replay tests passed | ✅ Passed receipt and mismatched normalized catalog paths | ✅ Receipt creation separated from lifecycle execution |

### Verification

- `python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 19/19 passed.
- `python3 -m py_compile bot/tools/disposable_replay.py` — passed.
- `git diff --check` — passed.
- `cd frontend && npx react-scripts test --watchAll=false` — 2 suites, 29/29 passed.
- Full Python discovery is blocked by pre-existing missing local dependencies: `pytest` and `httpx`. No dependency was installed.
- `npm --prefix frontend run build` is blocked by pre-existing invalid/unset frontend environment validation. No environment was changed or disclosed.
- Runtime harness: N/A by task instruction. No container/replay was executed.

### Workload and Rollback Boundary

- Delivery mode: `auto-chain`, `feature-branch-chain`; this is PR 2 child scope, based on PR 1 chain/extension.
- Authored static harness/policy/test surface is approximately 512 lines when counted as new files; approved auto-chain size exception recorded. No commit, push, branch, or PR was created.
- Revert only `bot/tools/disposable_replay.py`, `bot/tools/disposable-replay-policy.json`, `bot/tests/test_disposable_replay.py`, this task state, and this progress section. No runtime resource exists to roll back.

## Critical Static Verifier Remediation (PR 2 child)

**Status:** Complete static remediation. No Docker, replay, database, remote, linked, cloud, staging, or production action ran.

### Completed Scope

- Generated per-run, per-target names and ownership labels; preflight rejects existing names, shared networks, and shared volumes.
- Cleanup now inspects ownership, fails closed on removal or verification failure, and records `destroyed=true` only after all owned resources are absent.
- Added bounded PostgreSQL readiness, explicit read-only migration mount/workdir, subprocess-error redaction, grant/default-privilege validation, and cleanup-gated receipt status.
- Added negative static tests for ownership rejection, shared storage/network, cleanup failure, bounded readiness, migration workdir, raw subprocess-error redaction, grants, default privileges, and incomplete receipt cleanup.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Critical replay verifier remediation | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 11/11 passed | ✅ New imports failed before implementation | ✅ 25/25 replay/Foundation tests passed | ✅ Shared network/volume, unowned cleanup, readiness timeout, grant/default privilege, and cleanup-incomplete receipt paths | ✅ Ownership, lifecycle, and redaction helpers extracted; tests green |

### Verification

- `python3 -m unittest bot/tests/test_disposable_replay.py bot/tests/test_staging_schema.py` — 25/25 passed.
- `python3 -m py_compile bot/tools/disposable_replay.py` — passed.
- `git diff --check` — passed.
- Static prohibited-command scan — passed: no local-stack reset/start or published-port command.
- Sensitive review — passed: the only database URL is ephemeral command construction; receipts and error output remain redacted.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tests/test_disposable_replay.py`, and this progress section. No runtime resource exists to roll back.

## Critical Verifier Closure (PR 2 child)

**Status:** Complete static remediation for remaining critical verifier findings. No Docker, replay, runtime, cloud, staging, production, remote, or database action ran.

### Completed Scope

- Docker inspection recognizes absence only from Docker's explicit `No such` result; daemon and permission failures remain cleanup failures.
- Cleanup attempts every owned resource and reports failure only after all removals have been attempted.
- Every PostgreSQL readiness probe has a five-second subprocess timeout; timeouts retry within the finite readiness budget.
- Redacted receipts require creation, exactly two complete preflights, exact table/column/sequence parity, exact policy platform version, successful validation, and verified cleanup.
- Existing receipt files are removed before any replay preflight, so a failed run cannot leave stale passed evidence.
- Default-privilege capture includes global (`defaclnamespace = 0`) privileges as well as `public`-schema privileges.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Critical verifier closure | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 17/17 passed | ✅ 6 new negative cases failed: ambiguous inspect, fail-fast cleanup, unbounded probe, global ACL omission, incomplete lifecycle/preflight/parity receipt, stale receipt | ✅ 23/23 focused harness tests passed | ✅ Absence vs permission inspect; two failed removals; timeout retries; global ACL SQL scope; complete/incomplete receipt states; stale receipt removal | ✅ Centralized receipt checks, timeout constant, and aggregate cleanup state; tests remained green |

### Verification

- Focused RED: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 5 failures and 1 error, all expected missing behaviors.
- Focused GREEN: same command — 23/23 passed.
- Relevant backend/static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 31/31 passed.
- Syntax: `PYTHONPYCACHEPREFIX=<external-temp> python3 -m py_compile bot/tools/disposable_replay.py` — passed.
- Frontend strict runner: process-scoped local-only placeholder values, 2 suites and 29/29 tests passed.
- Frontend build: same process-scoped local-only placeholder values, production build compiled successfully.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tools/disposable-replay-policy.json`, `bot/tests/test_disposable_replay.py`, and this progress section. No runtime resource exists to roll back.

## Critical Portless Replay Regression Remediation (PR 2 child)

**Status:** Complete static remediation for two reproduced critical defects. No Docker,
replay, database, remote, cloud, staging, or production action ran.

### Completed Scope

- Cleanup now attempts cleanup for both owned targets even when another target cleanup fails,
  then raises one aggregate cleanup failure after all attempts finish.
- Preflight now rejects any PostgreSQL platform version other than pinned `15.8` before a
  migration command can run.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Critical cleanup aggregation | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 23/23 passed | ✅ Missing `cleanup_targets` import failed | ✅ 25/25 passed | ✅ Per-resource failures plus a failed first target still attempts target B then A | ✅ Extracted target-level cleanup aggregation; tests green |
| Critical pinned platform preflight | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 23/23 passed | ✅ New assertion failed because no pinned-version field existed | ✅ 25/25 passed | ✅ Exact `15.8` passes; `15.7` and `16.0` reject before migration | ➖ None needed |

### Verification

- Focused RED: `python3 -m unittest bot/tests/test_disposable_replay.py` — expected import failure for missing `cleanup_targets`.
- Focused GREEN: `python3 -m unittest bot/tests/test_disposable_replay.py` — 25/25 passed.
- Full Python discovery is blocked by pre-existing missing local dependencies: `pytest` and `httpx`; no dependency was installed.
- `npm --prefix frontend run build` is blocked before compilation by existing invalid/unset frontend environment validation; no environment was changed or disclosed.
- `git diff --check` passed for tracked changes; no-index whitespace checks passed for the untracked replay tool and tests.
- Sensitive review passed: production code contains only generated ephemeral process credentials; test strings are redaction fixtures. No real credential, URL, token, ID, or catalog data was added.

### Workload and Rollback Boundary

- Delivery mode remains `auto-chain`, `feature-branch-chain`; this remains PR 2 child scope.
- Revert only `bot/tools/disposable_replay.py`, `bot/tests/test_disposable_replay.py`, and this progress section. No runtime resource exists to roll back.

## Safe Portless Psql Replay Update (PR 2 child)

**Status:** Partial. Tasks 2.2–2.5 are complete. Task 2.6 remains open because the required combined static suite has one pre-existing staging-schema assertion failure; no runtime action occurred.

### Completed Tasks

- [x] 2.2 Replaced CLI/tool-image static contract with local pinned arm64 database image, no tool target, read-only migration mount, and target-local psql command assertions.
- [x] 2.3 Added ordered migration/ledger failure coverage: failed migration prevents its ledger insert and no repair/resume path exists.
- [x] 2.4 Replaced migration-up invocation with target-local `psql --no-psqlrc --set=ON_ERROR_STOP=1 --file`; bootstrap and record ledger version/name only after each successful lexical SQL file.
- [x] 2.5 Added exact local-image architecture and target server-version gates before/after lifecycle preflight, retaining catalog and normalized A/B validation.
- [ ] 2.6 Verification incomplete: focused replay tests pass, but combined static suite fails in an unrelated pre-existing staging-schema wording assertion.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.2–2.5 | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 25/25 passed | ✅ Missing ledger command helpers caused import failure | ✅ 27/27 passed after psql-only implementation | ✅ local arm64 vs amd64 and successful vs failed migration paths | ✅ extracted local-image gate from target runtime validation; tests green |
| 2.6 | `bot/tests/test_disposable_replay.py`, `bot/tests/test_staging_schema.py` | Unit/static | ✅ 27/27 focused replay tests passed | ✅ Receipt/runtime static behavior covered in prior row | ⚠ Focused replay suite: 29/29 passed; combined suite blocked by staging-schema assertion | ✅ receipt contains no CLI/tool fields and exact executor semantics | ✅ cleanup remains dependency-ordered and continuation-safe |

### Verification

- Focused RED: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — import error for absent ledger helper.
- Focused GREEN: same command — 29/29 passed.
- Syntax: `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile bot/tools/disposable_replay.py bot/tests/test_disposable_replay.py` — passed.
- Combined static command: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — blocked by `test_legacy_reference_records_only_current_local_provenance`, which rejects wording `byte-for-byte` already required by the updated design; replay tests passed.
- `git diff --check` — passed.
- Static prohibited-command scan — no `cli_image`, tool container, or Supabase CLI invocation remains in harness/policy.
- Sensitive review — passed; database passwords remain process-only and receipt/error artifacts remain redacted.
- Runtime harness: not run. No Docker, replay, database, remote, cloud, staging, production, Git, commit, push, or PR action occurred.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tools/disposable-replay-policy.json`, `bot/tests/test_disposable_replay.py`, task marks, and this progress section. No external resource exists to roll back.

## Blocker Fix: Legacy Provenance Verifier (task 2.6)

**Status:** Complete. The static verifier now permits the approved design's scoped
`psql` byte-for-byte limitation while rejecting any legacy or historical byte-exact
claim. No runtime action occurred.

### Completed Task

- [x] 2.6 Reconciled `test_legacy_reference_records_only_current_local_provenance`
  with the truthful quarantine guarantee: only the current local file hash is
  recorded; historical byte-exact provenance remains unrecoverable.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.6 blocker fix | `bot/tests/test_staging_schema.py` | Unit/static | ⚠ 36/37 passed; known target assertion rejected approved design wording | ✅ Revised provenance-scope assertions written before verification; prior broad assertion failed on approved `psql` wording | ✅ 8/8 staging-schema tests; ✅ 37/37 combined static tests | ✅ Rejects both legacy/historical-before-byte and byte-before-legacy/historical wording | ✅ Removed global wording ban; retained exact manifest/hash and historical-unrecoverable assertions |

### Verification

- Safety-net/RED: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 36/37 passed; expected blocker was `test_legacy_reference_records_only_current_local_provenance`.
- Focused GREEN: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_staging_schema` — 8/8 passed.
- Combined static GREEN: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 37/37 passed.
- Sensitive scan: `bot/tests/test_staging_schema.py` contains no URL, credential, secret, token, API-key, or SHA-256 literal added by this fix.
- Git diff was not run: this task explicitly prohibits Git action. Scoped patch review found only the two provenance-scope regex assertions and task/progress status updates.
- Runtime harness: not run. No Docker, replay, cloud, staging, production, database, or Git action occurred.

### Rollback Boundary

Revert only the two provenance-scope assertions in `bot/tests/test_staging_schema.py`,
the task checkbox, and this progress section. Do not change the quarantine file,
manifest hash, design, executable migrations, replay harness, or any external state.

## User-Authorized Cleanup Inspector Fail-Closed Bugfix (PR 2 child)

**Status:** Complete. Static-only Docker inspection classification fix; no Docker,
replay, database, remote, cloud, staging, or production action ran.

### Completed Scope

- `_inspect_resource` now treats only exact, resource-kind-specific Docker absence forms as absent:
  `No such container: <name>`, `no such volume: <name>`, and `network <name> not found`.
- Permission, malformed, broad-object, and unknown inspection errors remain fatal
  `CleanupError` conditions.
- Added regression coverage for all three real absence forms and fail-closed permission/unknown paths.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| Cleanup inspector absence classification | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 29/29 passed | ✅ Three kind-specific absence cases plus fatal permission/unknown cases failed against broad `No such` handling | ✅ 30/30 focused replay tests passed | ✅ Container, volume, network, permission, malformed-network, and broad-object paths | ➖ None needed |

### Verification

- Focused RED: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 1 failure and 2 errors, expected before the classifier change.
- Focused GREEN: same command — 30/30 passed.
- Relevant static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 38/38 passed.
- Diff whitespace check passed for both changed untracked files.
- Sensitive-pattern scan found only generated runtime-secret APIs and existing redaction fixtures; no live credential, URL, token, or secret was added.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tests/test_disposable_replay.py`, and this
progress section. No runtime resource or external state exists to roll back.

## Verifier Remediation: Exact Cleanup Absence Forms (PR 2 child)

**Status:** Complete. Static-only classifier correction; no Docker runtime, replay,
database, cloud, staging, or production action ran.

### Completed Scope

- Replaced suffix matching with exact, full-form Docker stderr matching for each
  container, volume, and network absence response.
- Added adversarial mixed permission and unknown-prefix cases for every resource
  kind; each must raise `CleanupError` even when followed by valid absence text.
- Retained acceptance of each real Docker absence response.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.7 verifier remediation | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 30/30 focused tests passed | ✅ Mixed prefix cases written first; 6 subcases failed because suffix matching returned `None` | ✅ 31/31 focused tests passed | ✅ 3 real absence forms plus 6 permission/unknown mixed forms across container, volume, and network | ➖ None needed |

### Verification

- RED: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 6 expected mixed-error failures.
- GREEN: same command — 31/31 passed.
- Relevant static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 39/39 passed.
- Diff checks: tracked `git diff --check` and untracked no-index whitespace check passed; unrelated pre-existing dirty/untracked paths were not changed.
- Sensitive review: no credential, URL, token, or secret literal was added. Existing generated password handling and synthetic redaction fixtures remain unchanged.
- Runtime harness: not run. No Docker, replay, database, remote/cloud, staging, or production action occurred.

### Rollback Boundary

Revert only the exact stderr comparison in `bot/tools/disposable_replay.py`, the mixed-error
regression method in `bot/tests/test_disposable_replay.py`, the task status, and this progress
section. No runtime resource or external state exists to roll back.

## Authorized Two-Target Runtime Replay Attempt

**Status:** Blocked. One explicitly authorized local-only execution was attempted after a fresh
static eligibility pass. No retry was performed.

### Preconditions and Execution

- Fresh static eligibility: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` passed **39/39**.
- Invocation used a stripped process environment and the approved `--execute` harness. The harness owns two internally networked, zero-published-port targets and validates the pinned local arm64 PostgreSQL image before creation.
- Exact sanitized outcome: `replay blocked: resource cleanup inspection failed`.
- No passed receipt was created; the stale receipt path is absent.

### Forced Cleanup Proof

- One label-scoped forced cleanup ran after the failed invocation, ordered container, volume, then network.
- Post-cleanup label-scoped container, volume, and network inspections each returned no resources.
- No harness, test, migration, design, configuration, Git, remote, cloud, Staging, Railway, or production artifact was modified. No retry occurred.

### Next Gate

Runtime replay remains blocked. Diagnose the Docker inspection-form mismatch in a separately approved static repair; do not rerun until fresh static eligibility and explicit runtime authorization are both present.

## Authorized Volume Inspector Matcher Repair (PR 2 child)

**Status:** Complete. Static-only Docker stderr matcher repair; no Docker runtime,
replay, database, remote/cloud, staging, or production action ran.

### Completed Scope

- Updated only the volume absence form to Docker's real stderr:
  `Error response from daemon: get <name>: no such volume`.
- Retained exact full-form matching, resource-kind dispatch, and fail-closed behavior.
- Preserved container, network, and mixed-error regressions; added direct rejection of
  the obsolete volume form.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.7 volume matcher correction | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 31/31 focused tests passed | ✅ Real Docker `get <name>: no such volume` case failed with `CleanupError` before production change | ✅ 31/31 focused tests passed | ✅ Real volume form accepted; obsolete direct volume form, mixed forms, container, and network forms remain correctly classified | ➖ None needed |

### Verification

- Safety net: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 31/31 passed.
- RED: same command — one expected volume subtest errored with `CleanupError` before matcher correction.
- GREEN: same command — 31/31 passed.
- Relevant static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 39/39 passed.
- Diff whitespace checks passed for tracked changes and an explicit no-index check of `bot/tools/disposable_replay.py`.
- Sensitive review found only pre-existing generated-secret handling and synthetic test fixtures; this repair added no credential, URL, token, or secret literal.
- Runtime harness: not run. No Docker, replay, database, remote/cloud, staging, or production action occurred.

### Rollback Boundary

Revert only the volume stderr form in `bot/tools/disposable_replay.py`, its two
volume assertions in `bot/tests/test_disposable_replay.py`, and this progress
section. No runtime resource or external state exists to roll back.

## User-Authorized A/B Comparator Remediation (PR 2 child)

**Status:** Complete. Static-only comparator correction; no Docker runtime, replay,
database, remote/cloud, staging, or production action ran.

### Completed Scope

- Split replay validation into strict schema-contract checks and independent target
  gates. Tables, columns/defaults, sequences/ownership, installed extensions,
  migration ledger, and deferred relational/security/grant/default-privilege
  objects remain exact schema-contract requirements.
- Kept platform version, extension availability, provider `extensions` schema, and
  application row counters as target gates. A target-gate failure blocks replay
  success without being reported as a schema-contract mismatch.
- Added a first-difference diagnostic containing only scope, category, and generic
  reason. It retains no catalog values, names, URLs, credentials, or topology.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| A/B comparator remediation | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 31/31 focused tests passed | ✅ Four contract/gate/diagnostic cases written first; 3 failed with missing split-validation fields | ✅ 35/35 focused tests passed | ✅ Metadata-only gate drift, default/ownership drift, stable `now()`, and hostile sensitive values | ✅ Extracted schema-contract key set and safe diagnostic helper; tests green |

### Verification

- Focused GREEN: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 35/35 passed.
- Relevant static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 43/43 passed.
- Syntax: `PYTHONDONTWRITEBYTECODE=1 python3 -m py_compile bot/tools/disposable_replay.py bot/tests/test_disposable_replay.py` — passed.
- Diff whitespace: `git diff --check` — passed. Replay files are existing untracked workspace artifacts, so tracked diff output is empty.
- Sensitive review: comparator output has only controlled labels. Regression input includes URL, credential, name, and topology-like strings, all proven absent from serialized comparison output.
- Runtime harness: not run. No Docker, replay, database, remote/cloud, staging, or production action occurred.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tests/test_disposable_replay.py`,
and this progress section. No runtime resource or external state exists to roll back.

## User-Authorized Failure Diagnostic Policy (PR 2 child)

**Status:** Complete. Static-only failure-receipt refinement; no Docker runtime,
replay, database, remote/cloud, staging, or production action ran.

### Completed Scope

- Extended completed task 2.6 with a protected failure receipt written immediately
  after a failed A/B comparison and before the `finally` cleanup begins.
- The receipt is fail-only (`status: failed`), redacted, and limited to comparison
  category, sanitized first-difference key/class, aggregate counts, and boolean
  target-gate outcomes for targets A and B.
- Defensive allowlists convert untrusted diagnostic or count inputs to bounded
  fallback labels/zeroes; schema/table/object names, SQL, URLs, credentials, IDs,
  artifact paths, and topology remain excluded. Binding remains blocked and forced
  cleanup remains unchanged.

### TDD Cycle Evidence

| Task | Test File | Layer | Safety Net | RED | GREEN | TRIANGULATE | REFACTOR |
|---|---|---|---|---|---|---|---|
| 2.6 failure diagnostic policy | `bot/tests/test_disposable_replay.py` | Unit/static | ✅ 35/35 focused tests passed | ✅ Missing receipt builder/import failed | ✅ 37/37 focused tests passed | ✅ Hostile untrusted input case failed, then 38/38 passed; persisted receipt/no-success case failed, then 39/39 passed | ✅ Extracted bounded persistence helper; tests remained green |

### Verification

- Focused: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay` — 39/39 passed.
- Relevant static suite: `PYTHONDONTWRITEBYTECODE=1 python3 -m unittest bot.tests.test_disposable_replay bot.tests.test_staging_schema` — 47/47 passed.
- Syntax: `PYTHONPYCACHEPREFIX=<external-temp> python3 -m py_compile bot/tools/disposable_replay.py bot/tests/test_disposable_replay.py` — passed.
- Diff whitespace: `git diff --check` — passed.
- Sensitive review: failure-receipt construction uses only allowlisted labels,
  bounded nonnegative aggregate counts, and boolean gates; hostile URL, credential,
  table-name, and topology-like test inputs are absent from serialized receipts.
- Runtime harness: not run. No Docker, replay, cloud, staging, production, or
  database action occurred.

### Rollback Boundary

Revert only `bot/tools/disposable_replay.py`, `bot/tests/test_disposable_replay.py`,
and this progress section. No runtime resource or external state exists to roll back.

## Phase 3 — Foundation Applied to the Staging Target (2026-09-15)

### Authority

The owner, who is also the data owner, approved an explicit exception to the two-replay gate: the
empty, recreatable staging project is used as the disposable target and its applied result is the
evidence. Staging only; production execution remains closed.

### Preflight (before any write)

| Check | Result |
|---|---|
| Remote migration ledger | Empty: all three local migrations reported an empty remote counterpart |
| Destination `public` schema | Headers only: 0 tables, 0 sequences, 0 views |
| Dry run | Exactly the three Foundation versions, in order |
| Fail-closed property | The chain uses `CREATE` without `IF NOT EXISTS`, and the extensions migration raises when the managed extensions schema is unavailable |

### Apply

| Evidence | Result |
|---|---|
| Command | `supabase db push --linked` against the staging project; password read from a local file and never printed |
| Applied | `20260914090000`, `20260914090100`, `20260914090200`; no seeds, no roles |
| Post-apply ledger | All three versions present remotely |
| Destination objects | 80 tables, 72 sequences |
| Boundary | 0 constraints, 0 indexes, 0 views — Relational content was not introduced |
| Rows | None: schema-only chain, and the push reported no seeds |

### Deviations

- Task 3.3 previously required keeping execution closed until two clean replays passed. The owner
  exception superseded that rule, so the task text was rewritten to the rule that now governs, and
  the rewrite is recorded here. The replay harness stays in the repository, unused for this apply.
- Task 3.2 is complete without replay evidence, because no replay was run.

### Incidents

- A preflight dump invoked with `-f -` wrote 1933 bytes into a stray file named `-` inside the
  repository instead of standard output, which first looked like an empty schema. The file was
  removed, the working tree verified clean, and the emptiness proof repeated against a real file.
- `supabase inspect db table-stats` rejects `--password`, so the emptiness proof came from the
  schema dump instead.

### Rollback Boundary

Before any application binding: delete and recreate the isolated staging project, then reapply the
chain from this repository. After a binding exists: reviewed forward compensation only. Reverting
this section changes repository records only and does not undo destination state.
