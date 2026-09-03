# Tasks: QuartzPlay Project Memory and Local Guide Handoff

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | 300–450 in canonical memory and validation docs |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 → canonical map, ownership, contracts, journeys; PR 2 → evidence, freshness, maturity, safety, unknowns, validation |
| Delivery strategy | exception-ok (user-approved) |
| Chain strategy | none |

Decision needed before apply: No — user approved `exception-ok`.
Chained PRs recommended: No — one documentation-only QuartzPlay PR is approved as an exception.
Chain strategy: none
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Make canonical QuartzPlay memory usable for takeover | PR 1 | Depends only on checked-in evidence; tests/checks included |
| 2 | Qualify claims and complete safety/handoff controls | PR 2 | Base on PR 1; delivered external guide remains local-only and excluded from PR |

## Phase 1: Evidence Inventory and Guardrails

- [x] 1.1 Inventory revision/date/scope evidence from `frontend/src/{App,Casino,Web,Agencia,Box,Admin}.jsx` and `bot/{auth,casino_api,db,bot_handlers,admin_handlers}.py`; record names only, never secrets or private topology.
- [x] 1.2 Define Markdown structure, namespace, uniqueness, freshness, secret-scan, and changed-path checks against `openspec/specs/project-memory/spec.md` before content expansion; no runtime test seam exists.

## Phase 2: Canonical Memory

- [x] 2.1 Expand `openspec/specs/project-memory/spec.md` with quick path, repository/system maps, authority legend, ownership matrix, architecture boundaries, and maturity limits.
- [x] 2.2 Add stable `QP-EV`, `QP-CT`, and `QP-JR` records covering evidence, wallet debit/credit/refund contracts, and takeover journeys; include caller/provider, inputs/outputs, authorization, failure, retry/idempotency, owner, and exit state.
- [x] 2.3 Add freshness protocol and evidence fields: source, revision, UTC verification date, confidence, owner, status, limitations, linked records, and refresh-before-use rule.
- [x] 2.4 Document wallet/result safety, IAQP ownership of roulette state/results/records, QuartzPlay wallet authority, non-guarantees, open questions with owners, and no shared transaction or IAQP-detail duplication.

## Phase 3: External Guide Delivery Verification

- [x] 3.1 Verify the delivered external local-guide extension across `index.html`, `system-and-business.html`, `journeys.html`, `features-and-stack.html`, `architecture-and-operations.html`, and `evidence-and-unknowns.html`; it extends IAQP framing without parallel pages or duplicate registers.
- [x] 3.2 Verify canonical links, both revisions, generation date, freshness pointers, visible uncertainty, and QuartzPlay ownership/journey/maturity orientation; preserve IAQP safety pages and keep all HTML/assets local-only and excluded from this repository review and PR.

## Phase 4: Verification and Handoff

- [x] 4.1 Run Markdown structure/ID/link checks, secret scan, `git diff --check`, and changed-path inspection against proposal/design scenarios.
- [x] 4.2 Verify no IAQP repository files, local HTML, assets, generators, runtime code, migrations, or deployment files changed; record unresolved operations/deployment bindings as open questions.

## Phase 5: Verification Blocker Remediation

- [x] 5.1 Add a `project-memory` delta specification with Given/When/Then scenarios for committed canonical authority, ownership, wallet contracts, and clean-CI validation.
- [x] 5.2 Configure every OpenSpec test command to enter `frontend/` before invoking the Create React App test runner.
- [x] 5.3 Refactor `projectMemoryValidation.test.js` into focused canonical-content checks using a repository path derived from the test file; remove all external local-guide reads.
- [x] 5.4 Record OpenSpec-only apply progress and strict TDD RED/GREEN evidence.
- [x] 5.5 Run the focused test through the configured OpenSpec command and inspect documentation whitespace and changed paths.
