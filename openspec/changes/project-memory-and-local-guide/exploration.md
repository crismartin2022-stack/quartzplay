## Exploration: project-memory-and-local-guide

### Current State

QuartzPlay is the primary repository for a multi-surface betting platform. Its checked-in code combines a React 18/Create React App frontend (`frontend/`) with Python services under `bot/`: a Telegram polling process, FastAPI casino/sports/agency/admin API code, PostgreSQL access, authentication, and an external odds-provider client. `frontend/src/index.js` selects the public, casino, agency, box, and admin surfaces by path or host.

The repository has OpenSpec configuration but no main specifications or active change artifacts. `openspec/config.yaml` declares OpenSpec as spec-driven, strict TDD, Jest/build commands, and rules requiring API, data, authorization, money, idempotency, rollback, and boundary documentation. The current implementation is concentrated in large modules and mixes verified behavior with mock or transitional behavior; documentation must distinguish source evidence from runtime guarantees.

QuartzPlay evidence establishes these ownership boundaries:

- QuartzPlay owns user identity, balances, wallet transactions, sports bets/betslips, agency and influencer hierarchy, cashier flows, support, Telegram onboarding, reporting, and admin operations (`bot/db.py`, `bot/casino_api.py`, `bot/bot_handlers.py`, `bot/admin_handlers.py`, and the frontend surfaces).
- The roulette implementation is a separate IAQP service. The casino frontend calls `https://api-casino.iaqp.lat` for table state, bets, and chat (`frontend/src/Casino.jsx`); sports, agency, box, admin, and support flows call `https://api.iaqp.lat` (`frontend/src/App.jsx`, `Web.jsx`, `Agencia.jsx`, `Box.jsx`, `Admin.jsx`). Hostnames and current deployment topology are implementation evidence, not operational guarantees.
- IAQP's archived equivalent change and main `project-memory` specification are the cross-service source for roulette lifecycle, seed commitment, public verification, dealer isolation, and wallet-contract behavior. QuartzPlay memory should summarize that boundary and link to IAQP rather than duplicate IAQP's complete specification.

The local-only guide at `/Users/usuario/Documents/Trabajo 2026/iaqp/local-docs/project-memory-and-local-guide/` now has a delivered QuartzPlay + IAQP whole-system orientation extension across its six pages. It links both canonical memories, exposes QuartzPlay `QP-*` markers, carries both revisions and generation date, preserves IAQP safety framing, and remains outside both repositories, staging, and PRs. It is a derived teaching layer, not a second canonical document or HTML duplication.

### Affected Areas

- `openspec/config.yaml` — defines QuartzPlay documentation constraints, testing context, and required treatment of money, authorization, idempotency, and rollback.
- `openspec/specs/project-memory/spec.md` — new canonical, versioned QuartzPlay project-memory specification; should become the portable source for the boss's Claude.
- `openspec/changes/project-memory-and-local-guide/` — active OpenSpec change artifacts; exploration only in this phase.
- `frontend/src/index.js` — route/host map for public, casino, agency, box, and admin surfaces.
- `frontend/src/App.jsx` — player sports, wallet, bets, support, responsible-gaming, P2P, influencer, casino-game, and Telegram-linked flows; also records the main QuartzPlay API boundary.
- `frontend/src/Web.jsx` — unauthenticated public betting/betslip entry and its current staged-login limitation.
- `frontend/src/Casino.jsx` — IAQP roulette client boundary, Telegram identity requirement, polling cadence, bet submission, and chat path.
- `frontend/src/Agencia.jsx`, `frontend/src/Box.jsx`, `frontend/src/Admin.jsx` — agency cashier/hierarchy, box terminal, and admin surface ownership and maturity evidence.
- `bot/casino_api.py` — FastAPI API, PostgreSQL pool, CORS/rate limits, agency sessions, wallet-facing endpoints, reporting, and admin authorization evidence. Its `IAQP API` title must be explained carefully because file location and surrounding flows place it in QuartzPlay's service repository.
- `bot/db.py` — QuartzPlay-owned schema bootstrap evidence for users/balances, sports bets, wallet transactions, casino rounds, betslips, agencies, tickets, and influencers; reproducible migration status needs explicit qualification.
- `bot/server.py`, `bot/bot_handlers.py`, `bot/admin_handlers.py`, `bot/auth.py`, `bot/odds_api.py` — Telegram lifecycle, user/account linking, wallet/betslip operations, admin commands, session/password behavior, and external odds dependency.
- `/Users/usuario/Documents/Trabajo 2026/iaqp/IAQP/openspec/specs/project-memory/spec.md` and its archived change — read-only cross-service evidence for roulette ownership and contract invariants; no IAQP file changes are in scope.
- `/Users/usuario/Documents/Trabajo 2026/iaqp/local-docs/project-memory-and-local-guide/` — delivered external/local-only presentation extension; observed as read-only evidence and excluded from repository staging and PR.

### Approaches

1. **QuartzPlay canonical memory plus delivered local-guide extension** — Add a complete QuartzPlay `project-memory` main spec covering the system map, ownership, contracts, surfaces, journeys, feature maturity, stack, safety, evidence, and unknowns. The existing external guide has delivered QuartzPlay orientation sections and cross-links while OpenSpec remains authoritative.
   - Pros: gives Claude portable versioned memory; preserves one canonical truth; explains the whole system without copying IAQP or turning HTML into an audit register; keeps local-only boundary intact.
   - Cons: requires freshness metadata across two repositories and a deliberate guide information-architecture update; QuartzPlay/IAQP claims can drift.
   - Effort: Medium

2. **QuartzPlay OpenSpec only; leave local guide IAQP-focused** — Commit the complete canonical memory but make no guide changes.
   - Pros: smallest review surface; avoids HTML drift and preserves current IAQP teaching scope.
   - Cons: the local guide remains misleadingly IAQP-centric for a reader trying to understand QuartzPlay as a whole; boss's Claude gets memory but human/local orientation remains incomplete.
   - Effort: Low

3. **Duplicate the full system in OpenSpec and HTML** — Reproduce all canonical sections, endpoint inventories, journeys, and evidence records in the local guide.
   - Pros: each artifact is self-contained.
   - Cons: creates two competing sources of truth, duplicates IAQP material, increases review and maintenance cost, and violates the existing guide's intentional presentation-vs-authority design.
   - Effort: High

### Recommendation

Choose Approach 1. QuartzPlay needs its own versioned OpenSpec `project-memory` because the existing IAQP memory is archived and IAQP cannot serve as the canonical owner for QuartzPlay operations. Canonical QuartzPlay memory should document the complete QuartzPlay system and only the IAQP contract needed to understand cross-service behavior, with source paths, verification date, confidence, owner, maturity, and open questions.

Treat the current local HTML as a teaching layer, not a second spec. Its delivered extension clarifies the whole-system entry point, QuartzPlay ownership, player/Telegram/agency/box/admin journeys, maturity and evidence links, while preserving IAQP safety pages. It uses task-oriented sections rather than copying canonical tables. HTML, assets, and any generator remain outside both repositories; both revisions and guide generation date are recorded. No HTML work belongs in this repository scope.

Because the requested review budget is 400 lines and delivery strategy is `exception-ok`, plan one documentation-only PR if forecasted OpenSpec changes exceed the default budget. Do not split or chain work without a later explicit review decision.

### Risks

- The repository contains UI features with explicit mock/partial signals, especially `Admin.jsx`; UI presence must not be documented as end-to-end availability.
- `bot/db.py` creates tables at startup rather than exposing tracked migrations; memory must not claim reproducible provisioning without additional evidence.
- `bot/auth.py` shows separate admin-key, agency-bearer-session, and Telegram identity patterns. Contract authorization must be recorded per flow; do not generalize one mechanism across the platform.
- `bot/casino_api.py` contains both QuartzPlay-owned operations and wallet-facing/IAQP-adjacent naming. File location, endpoint behavior, and service ownership need separate evidence fields.
- The same visible domain family and transitional Railway URLs appear in code. Document observed endpoints with verification dates, not guaranteed production topology.
- IAQP's archived memory says IAQP does not own balances, while QuartzPlay schema visibly stores balances. Cross-service prose must preserve this distinction and avoid implying shared transactional state.
- Delivered local HTML can drift from canonical QuartzPlay and IAQP memories. It has revision metadata and canonical locators, must be refreshed from canonical evidence, and remains outside Git and pull requests.
- Documentation could expose secrets through environment examples or copied URLs. Record variable names and behavior only; never copy values, tokens, keys, connection strings, or private topology.
- A single comprehensive documentation change may exceed 400 review lines. The requested `exception-ok` strategy permits one PR, but the later proposal should forecast line count explicitly.

### Ready for Proposal

Yes. Exploration establishes QuartzPlay as primary repository and canonical documentation owner, IAQP as read-only cross-service evidence, OpenSpec as portable shared memory, and the local HTML as a delivered external/local-only teaching layer rather than duplication. Proposal records the `project-memory` capability, canonical sections and evidence schema, delivered guide extension, freshness/traceability rules, and the single-PR size exception.
