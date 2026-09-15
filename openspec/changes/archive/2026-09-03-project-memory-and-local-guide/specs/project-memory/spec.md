# Delta: Canonical Project Memory Validation

## ADDED Requirements

### Requirement: Committed canonical project memory

QuartzPlay MUST keep `openspec/specs/project-memory/spec.md` as its committed canonical takeover memory. The delivered external local guide MAY explain the memory, remains local-only and excluded from the PR, and MUST NOT be a required input to repository validation.

#### Scenario: CI reads canonical authority without a local guide

- **Given** a clean QuartzPlay checkout containing committed OpenSpec files and no external local guide
- **When** `frontend/src/projectMemoryValidation.test.js` runs from `frontend/`
- **Then** it reads the committed canonical project-memory specification and passes without accessing paths outside the repository

### Requirement: Canonical ownership and contract records

The canonical project-memory specification MUST state QuartzPlay ownership of player identity, authorization, and wallet balances; IAQP ownership of roulette state, results, and records; and the absence of a cross-service transaction. It MUST retain the wallet debit, prize-credit, and refund contract records.

#### Scenario: Reviewer validates ownership boundary

- **Given** the committed canonical project-memory specification
- **When** a reviewer runs the focused project-memory validation test
- **Then** focused assertions confirm the authority statement, ownership boundary, and `QP-CT-002`, `QP-CT-003`, and `QP-CT-004` records

### Requirement: Frontend-scoped OpenSpec test command

OpenSpec test commands MUST enter `frontend/` before invoking the Create React App test runner.

#### Scenario: Repository-root verification invokes CRA successfully

- **Given** verification starts at the QuartzPlay repository root
- **When** the OpenSpec configured test command runs
- **Then** Create React App resolves `frontend/package.json` and executes the focused validation test
