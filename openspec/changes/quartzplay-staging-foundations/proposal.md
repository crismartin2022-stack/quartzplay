# Proposal: QuartzPlay Staging Foundations

## Intent

Define approved QuartzPlay staging path. The validated protected current production API-connected catalog is schema/data authority: 80 ordinary tables and 845 columns. Proposal changes documentation only.

## Scope

### In Scope
- Protected-catalog schema capture, reconciliation, and forward-only migration baseline.
- Staging contract, non-production data limits, rollback evidence, test seams, and review slices.

### Out of Scope
- Product, API, wallet, Telegram, IAQP, production, cloud, GitHub, secret, database, branch, or deployment changes.
- Production rows, staging data copy, secret storage, or repository/Supabase-led provisioning.

## Capabilities

### New Capabilities
- `staging-foundations`: Railway-authoritative QuartzPlay staging.

### Modified Capabilities
- `project-memory`: Record staging authority and safety boundaries.

## Approach

Use four gates. No work begins before approval.

| Stage | Boundary | Human approval gate |
|---|---|---|
| 1. Authority | Redacted inventory; explicit QuartzPlay production identity. | Operations owner, rollback owner, change window. |
| 2. Capture | Read-only, schema-only protected catalog and sanitized inventory. | Source/destination identity; least-privilege access. |
| 3. Reconcile | Classify Railway, bootstrap, and Supabase differences; draft ordered migrations. | Data owner approves every destructive or unknown difference. |
| 4. Design | Isolated staging, data policy, bindings, smoke checks, test seams. | User approves delivery slice before configuration or implementation. |

**Authority constraints:** The validated protected current production API-connected catalog governs: 80 ordinary tables and 845 columns. The repository/Supabase baseline remains reference-only and MUST NOT establish authority, seed staging, or generate migrations. `bot/db.py` is evidence only. Never commit rows, credentials, connection strings, tunnel logs, or private topology. Protected data needs separate approval. Preserve wallet ownership, duplicate-reference behavior, and IAQP boundaries.

**Superseded chronology:** Earlier material cited 46 public tables from a historical observation without reproducible provenance. That claim is stale and/or different in scope; it is preserved only as superseded history, not as an active decision or migration input.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/specs/project-memory/spec.md` | Modified | Authority record |
| `supabase/migrations/*.sql` | Reference-only | Excluded pending reconciliation |
| `bot/db.py` | Evidence-only | Not migration source. |

## Risks and Rollback

Wrong project selection, schema drift, and unsafe data handling are high risk. Reject unapproved artifacts; revert isolated slice. Future database changes need compensating migration and restore evidence; no destructive action without owner approval.

## Reviewer Workload Forecast

Expected >400 changed lines across evidence, environment, migrations, and tests. Decision needed before apply: Yes. Chained PRs recommended: Yes. 400-line budget risk: High.

## Success Criteria

- [ ] Protected catalog authority and data limits are reviewable.
- [ ] Each stage has an explicit human approval gate.
- [ ] Future implementation uses approved review slices and strict TDD where test seam exists.
