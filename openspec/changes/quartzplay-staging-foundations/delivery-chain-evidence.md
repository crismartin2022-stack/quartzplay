# Delivery Chain Evidence: QuartzPlay Staging Foundations

## Strategy

- Delivery strategy: `auto-chain`.
- Chain strategy: `feature-branch-chain`.
- Delivery state: evidence-only. No branch, commit, push, pull request, remote configuration, deployment, or external database action was created by this work unit.

## Current Work Unit: Replay Parity Remediation

| Field | Boundary |
|---|---|
| Start | Existing local-only disposable replay harness and superseded same-target receipt. |
| End | Two-target/workspace guard, local-link absence gate, receipt preflight/platform-version schema, and strict runtime catalog parity validation. |
| Dependency | Foundation executable chain and static manifest. |
| Follow-up | Run only against two separately recreated local disposable workspaces after local runtime prerequisites are available. |
| Out of scope | Relational/Security objects, staging binding, remote Supabase, Railway, production, configuration, deployment, commits, pushes, and pull requests. |
| Rollback | Remove only replay harness/policy/tests, supersession receipt/progress notes, and this evidence file. |

## Intended Feature-Branch Chain

```text
feature tracker (no PR created)
  └─ PR 1: executable chain and extension contract
      └─ 📍 PR 2: replay parity remediation and local proof
          └─ PR 3: staging apply gate
```

## Verification Boundary

- Focused static test: `python3 -m unittest bot/tests/test_disposable_replay.py bot/tests/test_staging_schema.py`.
- Runtime proof: blocked until two independent local Supabase-compatible workspaces exist. It must never substitute a remote target.
- Receipt must report per-target empty-ledger/table preflight and platform version, then reject any catalog defaults, sequence ownership, extension, or extra-object mismatch.
