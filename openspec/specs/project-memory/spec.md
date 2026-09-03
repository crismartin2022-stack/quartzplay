# QuartzPlay Project Memory

> **Authority:** This committed OpenSpec document is QuartzPlay's canonical takeover memory. The external local HTML guide is a derived reading aid. IAQP is authoritative only for its roulette lifecycle, result, and record details.

## 1. Takeover Quick Path and Memory Metadata

### Start Here

1. Read [safety invariants](#7-safety-invariants-and-verification-playbook) before changing money, authorization, or a cross-service flow.
2. Locate a surface in [system maps](#2-system-repository-and-observed-deployment-maps), then follow its `QP-JR` journey.
3. Read the relevant `QP-CT` contract before a roulette wallet change; refresh cited evidence before any operational decision.
4. Resolve linked `QP-OQ` records rather than converting source gaps into runtime guarantees.

**Boundary rule:** QuartzPlay owns player identity, authorization, and wallet balances. IAQP owns roulette state, results, and roulette records. No cross-service transaction is implied.

### Memory Metadata

| Field | Value |
|---|---|
| QuartzPlay revision | `7637a35f4e1452aa1a946997832e7ce8cdc9c254` |
| IAQP revision | `9c2b519a80d01eab6a3982733a7ce340dbff56a6` |
| Evidence verified on | 2026-09-03 UTC |
| Evidence scope | Checked-in source, configuration, and read-only IAQP canonical memory; no live service, cloud, database, or secret inspection. |
| Accountable operations owner | `QP-OQ-001` — not evidenced in repository. |
| Contract reviewer | `QP-OQ-002` — not evidenced in repository. |

### Status Legend

| Status | Meaning | Operational use |
|---|---|---|
| `verified` | Directly supported by cited checked-in evidence. | State only as repository evidence. |
| `assumption` | Plausible interpretation without enough proof. | Do not use as a guarantee. |
| `open` | Missing, contradictory, or owner-confirmation-required evidence. | Resolve with named evidence before action. |

## 2. System, Repository, and Observed Deployment Maps

### System Map

```text
React entry routes ──► player, public, agency, box, admin, casino surfaces
       │                         │
       │ observed sports/ops API │ observed roulette API
       ▼                         ▼
QuartzPlay FastAPI + Telegram ──► IAQP roulette service
       │                              │
       ▼                              └── QP-CT wallet request
QuartzPlay PostgreSQL ──► users.balance + casino_movimientos(ref)
```

| Component | Responsibility | Owner | Evidence |
|---|---|---|---|
| React entry | Selects `/admin`, `/agencia`, `/box`, `/sitio`, `/casino`, host-based casino, or player surface. | QuartzPlay | [QP-EV-001] |
| Player and public surfaces | Sports, betslips, account-linked player flows, and public staged-entry flow. | QuartzPlay | [QP-EV-002] [QP-EV-003] |
| Casino surface | Collects Telegram user ID, polls a roulette table, submits bets, and sends table chat to IAQP. | QuartzPlay client / IAQP game boundary | [QP-EV-004] |
| FastAPI service | Agency, box, admin, sports, wallet-facing, reporting, and rate-limit source evidence. | QuartzPlay | [QP-EV-005] [QP-EV-006] |
| Telegram service | Player onboarding, account linking, betslips, and bot-admin commands. | QuartzPlay | [QP-EV-007] [QP-EV-008] |
| PostgreSQL access | Stores user balances and operational records; schema bootstrap runs in source. | QuartzPlay | [QP-EV-009] |
| Roulette lifecycle | Round state, outcomes, roulette records, verification, and IAQP-to-wallet caller behavior. | IAQP | [IAQP:EV-IAQP-001] [IAQP:EV-IAQP-004] [IAQP:EV-IAQP-005] |

### Repository Map

| Area | What source establishes | Limitation | Evidence |
|---|---|---|---|
| `frontend/src/index.js` | Route and host selection. | No deployed route or host-health proof. | [QP-EV-001] |
| `frontend/src/{App,Web}.jsx` | Player sports/wallet/betslip and public pay-at-agency UI flows. | UI/source is not end-to-end proof. | [QP-EV-002] [QP-EV-003] |
| `frontend/src/{Casino,Agencia,Box,Admin}.jsx` | Casino handoff and operations surfaces. | Admin has explicit mock sections; surface presence is not feature availability. | [QP-EV-004] [QP-EV-010] |
| `bot/casino_api.py` | FastAPI operations, authorization patterns, wallet endpoints, and source-only host settings. | File title and URLs do not establish deployed ownership or topology. | [QP-EV-005] [QP-EV-006] |
| `bot/{auth,db,bot_handlers,admin_handlers}.py` | Auth patterns, persistence bootstrap, Telegram operations, and bot administration. | No live authorization or provisioning audit. | [QP-EV-007] [QP-EV-008] [QP-EV-009] |

### Observed Deployment Map

| Source observation | Status | Limitation | Evidence |
|---|---|---|---|
| Frontend source contains sports/operations and casino API destinations. | `verified` | URLs do not prove DNS, routing, TLS, CORS, health, or current deployment binding. | [QP-EV-002] [QP-EV-004] [QP-OQ-003] |
| FastAPI source declares CORS origins, process-local limits, and environment-named configuration. | `verified` | Does not prove current cloud settings, worker count, or secret values. | [QP-EV-005] [QP-EV-006] [QP-OQ-003] |

## 3. Ownership and Cross-Service Contracts

### Ownership Matrix

| Domain | Owner | Rule | Evidence |
|---|---|---|---|
| Player identity and account links | QuartzPlay | Telegram and agency/account linkage stay QuartzPlay responsibilities. | [QP-EV-007] |
| Authorization | QuartzPlay | Admin-key, agency bearer-session, Telegram identity, and service-key patterns are distinct; do not generalize one to another. | [QP-EV-006] [QP-EV-007] |
| Wallet balances and movements | QuartzPlay | IAQP is not a balance store. QuartzPlay owns balance mutation and duplicate-reference handling shown in source. | [QP-EV-005] |
| Sports bets, betslips, agencies, box, reporting, and support surfaces | QuartzPlay | These are QuartzPlay domains even where source names use IAQP branding. | [QP-EV-002] [QP-EV-006] [QP-EV-009] |
| Roulette state, results, and roulette records | IAQP | QuartzPlay does not own roulette draw, lifecycle, verification, or IAQP record handling. | [IAQP:EV-IAQP-001] [IAQP:EV-IAQP-004] |

### QP-CT-001 — Roulette Balance Lookup

| Field | Value |
|---|---|
| Caller → provider | IAQP → QuartzPlay |
| Inputs → outputs | Player identifier → `saldo_centavos` source response. |
| Data owner | QuartzPlay owns the balance; IAQP receives a value only. |
| Authorization evidence | QuartzPlay wallet routes depend on a service-key header. Do not record its value. |
| Transaction boundary | Read-only lookup; no shared transaction is implied. |
| Failure / retry | QuartzPlay handler failure behavior is source evidence; IAQP retry behavior belongs to IAQP evidence. |
| Idempotency / duplicate response | No QuartzPlay lookup idempotency record is evidenced. |
| Exit state | Balance response or explicit HTTP error; runtime interoperability remains open. |
| Evidence | [QP-EV-005] [IAQP:EV-IAQP-005] [QP-OQ-004] |

### QP-CT-002 — Roulette Bet Debit

| Field | Value |
|---|---|
| Caller → provider | IAQP → QuartzPlay |
| Inputs → outputs | Player identifier, positive amount, and required idempotency `ref` → post-debit balance response. |
| Data owner | QuartzPlay owns balance and `casino_movimientos` reference handling; IAQP owns roulette bet acceptance and its records. |
| Authorization evidence | Service-key guard protects wallet route in QuartzPlay source. |
| Transaction boundary | QuartzPlay source performs balance/movement work in its database transaction. No cross-service transaction is implied. |
| Failure | Missing/invalid request, unknown player, insufficient balance, or provider error rejects this operation; IAQP must not be documented as accepting an unfunded bet. |
| Retry / idempotency | Repeated `ref` is looked up before mutation and returns recorded post-balance in QuartzPlay source. IAQP's deterministic-reference caller behavior is external evidence. |
| Exit state | Funded debit with recorded reference and balance response, or explicit error with no documented cross-service rollback. |
| Evidence | [QP-EV-005] [IAQP:EV-IAQP-004] [IAQP:EV-IAQP-005] |

### QP-CT-003 — Roulette Prize Credit

| Field | Value |
|---|---|
| Caller → provider | IAQP → QuartzPlay |
| Inputs → outputs | Player identifier, positive amount, required `ref`, and credit type → post-credit balance response. |
| Data owner | QuartzPlay owns wallet mutation; IAQP owns result and pending-payment record state. |
| Authorization evidence | Service-key guard protects wallet route in QuartzPlay source. |
| Transaction boundary | QuartzPlay transaction covers its local balance/movement update only. |
| Failure | Failed credit does not authorize a roulette-result rollback. Result/pending-payment follow-up is IAQP-owned. |
| Retry / idempotency | QuartzPlay source returns existing post-balance for duplicate `ref`; IAQP source documents deterministic retry references. |
| Exit state | Credited balance, duplicate replay response, or actionable provider failure without claimed result reversal. |
| Evidence | [QP-EV-005] [IAQP:EV-IAQP-004] [IAQP:EV-IAQP-005] |

### QP-CT-004 — Roulette Refund Credit

| Field | Value |
|---|---|
| Caller → provider | IAQP → QuartzPlay |
| Inputs → outputs | Player identifier, amount, required `ref`, and refund indication → post-credit balance response. |
| Data owner | QuartzPlay owns wallet mutation; IAQP owns whether/when a roulette round is annulled. |
| Authorization evidence | Service-key guard protects wallet route in QuartzPlay source. |
| Transaction boundary | QuartzPlay local only; no distributed rollback or transaction is evidenced. |
| Failure | Provider error leaves reconciliation/action ownership unresolved; do not claim automatic compensation. |
| Retry / idempotency | Duplicate `ref` replay is source-evidenced in QuartzPlay; IAQP refund invocation path remains external/open. |
| Exit state | Credited/refunded balance or explicit failure requiring owner review. |
| Evidence | [QP-EV-005] [IAQP:EV-IAQP-005] [QP-OQ-005] |

## 4. QuartzPlay Architecture and Persistence

### Boundary Map

| Boundary | Observed responsibility | Constraint |
|---|---|---|
| React → FastAPI | Browser surfaces call observed API destinations for sports, operations, and player actions. | Treat source destinations as evidence, never current topology. |
| React casino → IAQP | Casino component polls table state and posts bets/chat with Telegram-derived identity. | UI has no authority over roulette result or wallet mutation. |
| FastAPI → PostgreSQL | API holds operational data and wallet mutation logic. | Pooling, schema, and deployment state require runtime review. |
| Telegram → PostgreSQL | Bot creates/links users and records bets/betslips. | Handler source is not a production delivery guarantee. |
| IAQP → wallet routes | IAQP requests wallet effects through contracts above. | Preserve caller/provider ownership and idempotency references. |

### Persistence Maturity

| Concern | Repository evidence | Status |
|---|---|---|
| Users, balances, sports bets, wallet transactions, casino rounds, betslips, agencies, tickets, and influencers | `bot/db.py` has startup `CREATE TABLE IF NOT EXISTS` statements. | `verified` source presence |
| Wallet movement reference ledger | `bot/casino_api.py` queries/inserts `casino_movimientos` by `ref`. | `verified` source presence |
| Reproducible provisioning | No tracked migration inventory was established for the complete active schema. | `open` — [QP-OQ-006] |

## 5. Actor Journeys and Failure Exits

### QP-JR-001 — Player Places a Sports Bet

| Field | Value |
|---|---|
| Actor / entry | Authenticated player through QuartzPlay app and Telegram WebApp context. |
| Preconditions | Player identity data, valid selections, stake, and observed API path. |
| Steps | Frontend normalizes picks and posts a bet request; QuartzPlay API validates and persists/mutates according to its implementation. |
| Failure exit | Client reports connection or API error; exact live settlement/authorization behavior requires runtime validation. |
| Owner / exit state | QuartzPlay; source-backed request path, not an end-to-end guarantee. |
| Evidence | [QP-EV-002] [QP-OQ-007] |

### QP-JR-002 — Public Visitor Pays a Betslip at an Agency

| Field | Value |
|---|---|
| Actor / entry | Visitor uses `/sitio`, creates a public betslip, then agency surface retrieves/pays it. |
| Preconditions | Valid picks and code; public source explicitly calls this staged, no-login flow. |
| Steps | Public surface creates code; agency bearer-session flow retrieves and submits payment. |
| Failure exit | Invalid/expired code, missing/expired session, network, or API error is surfaced by source UI; payment finality requires contract review. |
| Owner / exit state | QuartzPlay; pending betslip or reported payment outcome. |
| Evidence | [QP-EV-003] [QP-EV-006] [QP-OQ-008] |

### QP-JR-003 — Telegram Onboarding and Account Link

| Field | Value |
|---|---|
| Actor / entry | Player invokes Telegram `/start`, optionally with a link code. |
| Preconditions | Bot update, database pool, and unexpired unused link code when linking. |
| Steps | Bot creates/updates Telegram user; linking transaction may merge balances and records, then associates Telegram identity. |
| Failure exit | Missing, used, expired, or unresolved link returns a user-visible response. |
| Owner / exit state | QuartzPlay; player is linked, created/updated, or explicitly rejected. |
| Evidence | [QP-EV-007] |

### QP-JR-004 — Agency, Box, and Admin Operations

| Field | Value |
|---|---|
| Actor / entry | Agency `/agencia`, box `/box`, or admin `/admin`. |
| Preconditions | Agency bearer session or admin key where route requires it; box is configured for an agency code. |
| Steps | Frontend calls QuartzPlay operation routes; server enforces observed agency/admin mechanisms. |
| Failure exit | Missing/expired session, invalid admin key, connection, or API error. Admin mock sections remain non-operational UI evidence. |
| Owner / exit state | QuartzPlay; operation result only—no roulette state change implied. |
| Evidence | [QP-EV-006] [QP-EV-010] [QP-OQ-009] |

### QP-JR-005 — Player Hands Off a Roulette Bet

| Field | Value |
|---|---|
| Actor / entry | Player enters QuartzPlay casino surface via `/casino` or source host condition. |
| Preconditions | Telegram-derived player identity, reachable IAQP table endpoint, and open roulette round. |
| Steps | Casino client polls IAQP table state; sends bet/chat to IAQP. IAQP then invokes `QP-CT-002` before accepting funded roulette bet. |
| Failure exit | Client shows missing Telegram identity, table connection, or IAQP response errors. Wallet failure must not be described as a roulette result rollback. |
| Owner / exit state | QuartzPlay owns identity/wallet handoff; IAQP owns table/result lifecycle. |
| Evidence | [QP-EV-004] [QP-CT-002] [IAQP:EV-IAQP-004] [QP-OQ-010] |

## 6. Feature Maturity and Stack

| Feature | Owner | Maturity | Limitation | Evidence |
|---|---|---|---|---|
| React route-selected surfaces | QuartzPlay | `verified` source presence | Not browser/runtime verified. | [QP-EV-001] |
| Sports/player requests | QuartzPlay | `partial` | Source requests exist; authorization, settlement, and deployed API behavior need verification. | [QP-EV-002] |
| Public betslip to agency payment | QuartzPlay | `partial` | Source calls show staged flow; end-to-end payment outcome not reviewed. | [QP-EV-003] |
| Casino table client | Cross-service | `partial` | Frontend-to-IAQP path is source-evidenced only. | [QP-EV-004] |
| Wallet debit/credit duplicate-reference behavior | QuartzPlay | `verified` source contract shape | No live contract test or service-owner acceptance. | [QP-EV-005] |
| Agency/box operations | QuartzPlay | `partial` | Route/API source exists; deployment/session behavior unverified. | [QP-EV-006] |
| Admin surface | QuartzPlay | `partial` | `Admin.jsx` contains explicit example/mock data sections. | [QP-EV-010] |
| Reproducible database provisioning | QuartzPlay | `planned/open` | Startup schema is not a tracked migration strategy. | [QP-EV-009] [QP-OQ-006] |

| Technology | Observed use | Evidence |
|---|---|---|
| React 18 / Create React App | Frontend package and route-selected SPA. | [QP-EV-001] |
| Python FastAPI / asyncpg | API, asynchronous PostgreSQL access, and rate-limit middleware. | [QP-EV-005] [QP-EV-009] |
| python-telegram-bot | Player and administrative bot handlers. | [QP-EV-007] [QP-EV-008] |
| PostgreSQL | Users, balances, bets, and operations tables in source SQL. | [QP-EV-009] |
| External odds provider | Sports source imports/calls an odds client. | [QP-EV-002] |

## 7. Safety Invariants and Verification Playbook

### Non-Negotiable Invariants

| Invariant | Rule | Evidence |
|---|---|---|
| Wallet authority | QuartzPlay remains balance authority. IAQP MUST NOT be treated as a balance store. | [QP-EV-005] [IAQP:EV-IAQP-005] |
| Duplicate safety | Wallet debit/credit request references MUST be supplied and duplicate references MUST not create a second local balance mutation in documented source behavior. | [QP-EV-005] |
| Result separation | A failed prize/refund provider call MUST NOT be represented as roulette result reversal. IAQP owns result follow-up. | [QP-CT-003] [QP-CT-004] |
| Authorization separation | Admin key, agency session, Telegram identity, and service key MUST remain separate documented contexts. | [QP-EV-006] [QP-EV-007] |
| No secrets | Never copy values for keys, tokens, passwords, connection strings, or private topology into memory or guide. | This document |
| Evidence honesty | UI presence, URLs, schema bootstrap, and source comments MUST NOT become live, end-to-end, or reproducible-provisioning claims. | [QP-EV-001] to [QP-EV-010] |

### Verification Playbook

**Canonical CI validation MUST read committed OpenSpec content only; it MUST NOT read the external local guide.**

| Check | Method | What it proves | Limitation |
|---|---|---|---|
| Memory validation | Run `projectMemoryValidation.test.js` from `frontend/` with the React test runner. | Canonical OpenSpec authority, ownership boundary, wallet-contract records, and clean-CI boundary exist. | Does not validate every claim or runtime service. |
| Markdown structure | Check headings, all `QP-EV`/`QP-CT`/`QP-JR`/`QP-OQ` references, and local relative links. | Documentation structure and traceability. | No live behavior proof. |
| Secret scan | Search changed docs for key/token/password/connection values and review manually. | Obvious copied secret prevention. | Cannot prove absence of sensitive inference. |
| Diff hygiene | Run `git diff --check` and inspect changed paths. | Whitespace and approved QuartzPlay scope. | Does not validate semantics. |
| Evidence refresh | Compare cited paths with recorded revisions, update status/limitations, then request named owner review. | Freshness before operational use. | Requires access outside this repository. |

## 8. Evidence Register and Open Questions

### Evidence Register

| ID | Status | Owner | Source | Revision / verification | Confidence | Claim and limitation | Linked records |
|---|---|---|---|---|---|---|---|
| QP-EV-001 | verified | QuartzPlay | `frontend/src/index.js`, `frontend/package.json` | `7637a35f`, 2026-09-03 UTC | High | React 18/CRA entry selects player, public, casino, agency, box, and admin surfaces. No deployed-route proof. | QP-JR-004, QP-JR-005 |
| QP-EV-002 | verified | QuartzPlay | `frontend/src/App.jsx` | `7637a35f`, 2026-09-03 UTC | Medium | Player source has sports, wallet, bet, support, and API request behavior. No live API confirmation. | QP-JR-001 |
| QP-EV-003 | verified | QuartzPlay | `frontend/src/Web.jsx`, `frontend/src/Agencia.jsx` | `7637a35f`, 2026-09-03 UTC | Medium | Public no-login betslip creation and agency payment UI calls are source-evidenced. Payment finality untested. | QP-JR-002 |
| QP-EV-004 | verified | QuartzPlay | `frontend/src/Casino.jsx` | `7637a35f`, 2026-09-03 UTC | High | Casino source calls an IAQP table API, requires Telegram identity to bet, polls state, and posts chat. No live table proof. | QP-JR-005, QP-CT-002 |
| QP-EV-005 | verified | QuartzPlay | `bot/casino_api.py` wallet routes | `7637a35f`, 2026-09-03 UTC | High | Service-key-guarded balance, debit, and credit handlers require references for movement writes and look up duplicate refs. Live contract behavior untested. | QP-CT-001 to QP-CT-004 |
| QP-EV-006 | verified | QuartzPlay | `bot/casino_api.py`, `bot/auth.py` | `7637a35f`, 2026-09-03 UTC | High | API source shows admin-key and agency bearer-session paths, CORS/rate limits, and operations endpoints. No security audit. | QP-JR-002, QP-JR-004 |
| QP-EV-007 | verified | QuartzPlay | `bot/bot_handlers.py` | `7637a35f`, 2026-09-03 UTC | High | Telegram source creates/updates users and supports account linking/betslips. Runtime delivery not verified. | QP-JR-003 |
| QP-EV-008 | verified | QuartzPlay | `bot/admin_handlers.py` | `7637a35f`, 2026-09-03 UTC | Medium | Telegram admin commands gate on configured IDs and operate on QuartzPlay data. No operations review. | QP-JR-004 |
| QP-EV-009 | verified | QuartzPlay | `bot/db.py` | `7637a35f`, 2026-09-03 UTC | High | Startup source creates users, balances, bets, wallet transactions, casino rounds, betslips, agencies, tickets, and influencers. No migration/reproducibility proof. | QP-OQ-006 |
| QP-EV-010 | verified | QuartzPlay | `frontend/src/{Agencia,Box,Admin}.jsx` | `7637a35f`, 2026-09-03 UTC | High | Operations surfaces call observed API routes; Admin explicitly contains mock/example sections. No end-to-end claim. | QP-JR-004, QP-OQ-009 |

### Open Questions

| ID | Status | Resolution owner | Question | Required resolution evidence | Linked records |
|---|---|---|---|---|---|
| QP-OQ-001 | open | QuartzPlay maintainer | Who owns production operations, incidents, and documentation approval? | Named owner in versioned governance or confirmed owner record. | All |
| QP-OQ-002 | open | QuartzPlay maintainer | Who accepts wallet-contract changes and reconciliation policy? | Named contract reviewer and reviewed contract test/evidence. | QP-CT-001 to QP-CT-004 |
| QP-OQ-003 | open | QuartzPlay operations owner | Which hosts, routes, CORS origins, and cloud bindings are current? | Environment-reviewed deployment evidence, not source URLs. | QP-EV-001, QP-EV-004, QP-EV-006 |
| QP-OQ-004 | open | QuartzPlay and IAQP maintainers | What exact response/error semantics are accepted across balance lookup? | Reviewed integration contract without secret values. | QP-CT-001 |
| QP-OQ-005 | open | IAQP and QuartzPlay maintainers | Which IAQP annulment path invokes refund and how is failed compensation reconciled? | Exercised integration evidence and owner-approved runbook. | QP-CT-004 |
| QP-OQ-006 | open | QuartzPlay maintainer | What versioned source provisions full current schema and deployment bindings? | Tracked migrations/schema plus environment-independent instructions. | QP-EV-009 |
| QP-OQ-007 | open | QuartzPlay maintainer | Does sports betting complete with correct authorization and settlement in current environments? | End-to-end or owner-reviewed runtime evidence. | QP-JR-001 |
| QP-OQ-008 | open | QuartzPlay maintainer | What guarantees prevent duplicate or conflicting public-to-agency payments? | Contract tests and owner-reviewed payment evidence. | QP-JR-002 |
| QP-OQ-009 | open | QuartzPlay maintainer | Which agency/box/admin functions are live versus mock or transitional? | Runtime inventory and owner review. | QP-JR-004 |
| QP-OQ-010 | open | QuartzPlay and IAQP maintainers | Does current casino client interoperate with IAQP and wallet contracts in production? | End-to-end test or owner-reviewed runtime evidence. | QP-JR-005 |

## 9. Local-Guide Handoff Contract

### Derived Artifact Boundary

| Requirement | Contract |
|---|---|
| Location | `/Users/usuario/Documents/Trabajo 2026/iaqp/local-docs/project-memory-and-local-guide/` |
| Authority | This OpenSpec and IAQP canonical memory remain authoritative; HTML explains and links, never duplicates registers or endpoint inventory. |
| Required inputs | Reviewed QuartzPlay and IAQP revisions plus guide generation date. |
| Delivery status | Delivered externally and observed at the local-only location; excluded from QuartzPlay staging, commits, and PR. |
| Targeted page deltas | Existing six pages provide whole-system entry, ownership, selected QuartzPlay journeys, maturity pointers, change-entry guidance, and namespace/freshness explanations. |
| Preserved material | IAQP safety framing and diagrams remain; QuartzPlay does not copy IAQP lifecycle details. |
| Freshness | Refresh affected evidence against current revisions, review canonical memory, then refresh guide. Visible `open` uncertainty must remain visible. |
| Local-only rule | Never add, stage, commit, or include guide HTML/assets/generators in QuartzPlay or IAQP review. |

### Documentation Rollback

Before merge, remove unaccepted OpenSpec documentation. After merge, revert only the documentation work unit. This memory authorizes no runtime, wallet, deployment, cloud-setting, secret, or IAQP modification.
