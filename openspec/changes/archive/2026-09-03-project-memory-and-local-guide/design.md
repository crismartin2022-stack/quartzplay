# Design: QuartzPlay Project Memory and Local Guide Handoff

## Technical Approach

Build one QuartzPlay-authoritative memory at `openspec/specs/project-memory/spec.md`, with every material claim traceable to checked-in evidence. IAQP remains external roulette authority: record only boundary facts needed by QuartzPlay, then reference IAQP stable IDs for lifecycle and safety detail.

Shared local guide is a delivered external teaching layer. Its six-page QuartzPlay orientation extension was observed at the local-only guide path; it is excluded from this repository, staging, and PR. This change writes no HTML, assets, generator, or production files.

## Content Architecture

| Section | Content |
|---|---|
| 1. Quick path and metadata | Reading order, authority, repository revisions, verification date/scope, status legend. |
| 2. System and repository maps | Frontend surfaces, FastAPI, Telegram, PostgreSQL, odds provider, and IAQP boundary. Hosts remain source evidence. |
| 3. Ownership and contracts | Domain owner matrix plus provider-side wallet contracts for balance, debit, prize credit, and refund. |
| 4. Architecture and persistence | Frontend, API, Telegram, database, and external-service boundaries; schema bootstrap is not called a reproducible migration. |
| 5. Actor journeys | Sports/betslip, public-to-agency payment, Telegram, agency/box/admin, and roulette handoff; actor, preconditions, service steps, failures, owner, exit. |
| 6. Maturity and stack | `verified`, `partial`, `planned/open` catalog with limits; no invented rationale. |
| 7. Safety and verification | Wallet authority, idempotent movement, authorization separation, no-secret rules, focused source/document checks. |
| 8. Evidence and unknowns | Complete evidence register and resolution-owned open questions. |
| 9. Local-guide handoff | Derived-artifact boundary, selected page deltas, freshness contract, and exclusion from Git/review. |

## Architecture Decisions

| Decision | Alternatives / tradeoff | Choice and rationale |
|---|---|---|
| Authority | Mirror full memory in HTML for convenience, increasing drift. | OpenSpec is complete authority; guide paraphrases and links. |
| Stable IDs | Reuse IAQP's unqualified IDs, causing collisions in shared guide. | QuartzPlay owns `QP-EV-###`, `QP-CT-###`, `QP-JR-###`, `QP-SI-###`, and `QP-OQ-###`. External references stay namespaced, for example `IAQP:CT-002`; never renumber or copy their records. |
| Evidence granularity | Tiny rows harm reading; broad rows hide gaps. | One immutable ID per coherent source claim, with every spec-required field and linked IDs. Retired IDs remain reserved. |
| Boundary view | Copy IAQP lifecycle into QuartzPlay memory. | Trace QuartzPlay provider behavior and final wallet state; link IAQP caller lifecycle and roulette invariants. |
| Guide extension | Add parallel QuartzPlay pages and duplicate navigation/content. | Extend existing pages only where IAQP-only framing blocks whole-system understanding. Preserve IAQP safety material. |

## Boundary and Data Flow

```text
QuartzPlay Casino.jsx -> IAQP roulette API -> QP-CT wallet request
                                                |
                                                v
service-key guard -> transaction -> users.balance + casino_movimientos(ref)
                                                |
                                                v
                   balance response / explicit error / duplicate replay
```

Each `QP-CT` records caller/provider, request/response units, owner, authorization, transaction boundary, failure classes, idempotency and duplicate response, retry owner, and exit states. IAQP owns roulette state/results/records. QuartzPlay owns endpoint authorization, identity lookup, balance mutation, and wallet movement. No cross-service transaction is implied.

## Freshness and Update Protocol

1. Capture full QuartzPlay and IAQP revisions plus UTC verification date and evidence scope.
2. Diff cited paths from recorded revision; changed or missing paths force re-verification.
3. Reclassify claim status/confidence, update limitations and linked unknowns, and preserve stable IDs.
4. Validate sections, unique/resolved IDs, contract fields, no secrets, and non-guarantees.
5. Review canonical memory. Before operational use, refresh affected records against current revisions.
6. For a later guide refresh, verify revisions, generation date, links, offline use, and visible unknowns; the current extension is already delivered externally and excluded from the PR.

## Delivered Shared Local-Guide Extension

Observed delivered externally: `index.html` is whole-system entry with dual canonical links/freshness. `system-and-business.html` covers QuartzPlay surfaces and ownership. `journeys.html` includes selected journeys linked to `QP-JR` records. `features-and-stack.html` has maturity pointers. `architecture-and-operations.html` preserves IAQP safety and adds QuartzPlay change-entry guidance. `evidence-and-unknowns.html` teaches both namespaces and links registers. Shared chrome, CSS, accessibility, offline constraints, and IAQP diagrams remain; no second evidence table or endpoint inventory. All guide files are local-only and excluded from this PR.

## File Changes

| File | Action | Description |
|---|---|---|
| `openspec/changes/project-memory-and-local-guide/design.md` | Create | Technical design only. |
| `openspec/specs/project-memory/spec.md` | Modify during apply | Expand canonical QuartzPlay memory using architecture above. |
| IAQP repository | None | Read-only cross-service evidence. |
| External local guide | Excluded | Delivered external/local-only extension observed; never staged, committed, or included in this PR. |

## Verification and Rollout

Run Markdown structure/ID/link checks, secret scan, `git diff --check`, and changed-path inspection. No runtime test, migration, or deployment. Roll back by removal before merge or documentation revert after merge.

QuartzPlay size exception is approved for one documentation-only PR. Risk is **High**: complete memory may exceed 400 changed lines. The approved delivery strategy is `exception-ok`; no chained PRs are required for this change.

## Open Questions

- Delta requirements are recorded at `openspec/changes/project-memory-and-local-guide/specs/project-memory/spec.md`; the canonical takeover memory remains `openspec/specs/project-memory/spec.md`.
- Accountable QuartzPlay operations/contract reviewer and current deployment bindings remain evidence-owned unknowns.
