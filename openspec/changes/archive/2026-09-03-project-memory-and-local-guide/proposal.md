# Proposal: QuartzPlay Project Memory and Local Guide Handoff

## Intent

Give takeover developer portable, evidence-backed QuartzPlay memory. QuartzPlay is canonical for identity, wallet, betting, and operations; IAQP remains authoritative for roulette. Delivered external guide adds orientation without duplication and stays local-only and excluded from PR.

## Scope

### In Scope
- Add versioned `project-memory` capability covering system map, ownership, journeys, maturity, stack, safety, verification, evidence, and unknowns.
- Define evidence fields: source, revision, verification date, confidence, owner, status (`verified`, `assumption`, `open`), and limitations. Require freshness metadata before use.
- Define boundary: IAQP owns roulette state, results, and records; QuartzPlay owns balances, identity, authorization, and wallet operations. Record contract inputs, outputs, failure, retry/idempotency, and exit states without copying IAQP memory.
- Record delivered external guide extension: whole-system entry point, ownership map, QuartzPlay journeys, maturity links, and freshness pointers; preserve IAQP safety pages and exclude guide files from repository review.
- Forecast one documentation-only PR; permit `exception-ok` above 400 lines.

### Out of Scope
- Runtime, API, database, deployment, authentication, wallet, betting, or frontend implementation changes.
- IAQP files or generated/local HTML, assets, or guide generators in this phase.
- IAQP duplication, live-topology guarantees, or secret values.
- PR splitting or chaining without review decision.

## Capabilities

### New Capabilities
- `project-memory`: Canonical QuartzPlay takeover memory with evidence, freshness, ownership, contracts, and unknowns.

### Modified Capabilities
- None.

## Approach

Create `openspec/specs/project-memory/spec.md` as authoritative Markdown from checked-in QuartzPlay evidence and read-only IAQP contract evidence. Use compact tables and task-oriented journeys. Treat sibling HTML as derived teaching; its delivered external extension carries both revisions and generation date, and remains excluded from this PR.

## Affected Areas

| Area | Impact | Description |
|---|---|---|
| `openspec/specs/project-memory/spec.md` | New | QuartzPlay canonical memory. |
| QuartzPlay `frontend/`, `bot/` | Read-only | Evidence sources only. |
| IAQP OpenSpec | Read-only | Roulette ownership and contract evidence only. |
| External local guide | Delivered, excluded | Local-only teaching layer; never staged, committed, or included in this PR. |

## Risks

| Risk | Likelihood | Mitigation |
|---|---|---|
| Evidence drift or maturity overclaim | Med | Revision/date/status/confidence/limitations. |
| Boundary confusion or secret exposure | Med | Ownership matrix; names only, no values; link, do not duplicate. |
| Review exceeds 400 lines | Med | Forecast diff; use single `exception-ok` PR strategy. |

## Rollback Plan

Remove unmerged OpenSpec artifacts, or revert documentation-only commit. No runtime, IAQP, or external-guide rollback is authorized.

## Success Criteria

- [ ] Memory is portable, traceable, freshness-qualified, and usable for takeover.
- [ ] Ownership, wallet authority, boundary, failure/idempotency, safety, maturity, and unknowns are explicit.
- [x] Delivered external/local-only guide extension is targeted and links to canonical memory without duplication; it is excluded from this PR.
- [ ] No IAQP, local HTML, or implementation files are modified in this phase.
