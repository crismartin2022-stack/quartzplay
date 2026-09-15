# Staging Foundations Specification

## Purpose

Define safe, executable schema foundations for an approved empty QuartzPlay Supabase Staging target. This specification authorizes no migration application, cloud/runtime change, Git action, or data handling.

## Requirements

### Requirement: Protected Catalog Authority

The system MUST use only validated protected current production API-connected catalog evidence as schema authority: 80 ordinary tables and 845 columns. Repository/Supabase baselines and `bot/db.py` MUST remain reference-only. The historical 46-public-table observation MUST NOT be an authority or migration input.

#### Scenario: Authority evidence is complete

- GIVEN sanitized protected catalog evidence reports 80 tables and 845 columns
- WHEN a Foundation manifest or migration is prepared
- THEN it MUST reconcile only against that authority

#### Scenario: Non-authoritative input is offered

- GIVEN a legacy baseline, `bot/db.py`, or historical count is offered as source
- WHEN generation is requested
- THEN generation MUST reject it as authority

### Requirement: Single Empty-Target Executable Chain

The executable ledger MUST contain one lexical, forward-only chain for an empty staging target. All `20260907*_baseline.sql` files MUST be retired from the executable migration path. The current local non-empty legacy baseline MAY be quarantined outside that path as a non-authoritative reference only; its manifest MUST record only current local hash and that original byte-exact provenance is unrecoverable because legacy files were never tracked. Application tables and sequences MUST use fail-closed creation; ledger repair and fake applied entries are prohibited.

#### Scenario: Clean ledger begins

- GIVEN Supabase platform bootstrap is complete and application ledger is empty
- WHEN executable migrations run in lexical order
- THEN legacy baseline DDL MUST NOT execute before Foundation migrations

#### Scenario: Legacy ledger consumption is found

- GIVEN any target records a retired `20260907*` migration version
- WHEN staging execution is considered
- THEN execution MUST stop pending separate environment reconciliation

### Requirement: Supabase Extension Contract

The chain MUST assert existing Supabase-managed `extensions` schema and MUST NOT create, alter, or own it. It MUST ensure only `pgcrypto` version 1.3 and `uuid-ossp` version 1.1, with exact availability and installed namespace/version checks before and after guarded creation. `IF NOT EXISTS` MUST NOT apply to application objects.

#### Scenario: Compatible extension state

- GIVEN `extensions` exists and exact extension versions are available
- WHEN the extension migration runs
- THEN each extension MUST be installed or validated at exact schema and version

#### Scenario: Extension drift

- GIVEN schema absence, unavailable version, wrong namespace, or wrong installed version
- WHEN extension migration runs
- THEN it MUST fail without application-object creation

### Requirement: Disposable Replay and Data Exclusion

The system MUST prove two independent from-zero replays on disposable Supabase-compatible instances without seeds or data rows. Each replay MUST validate empty application ledger preflight, 80 tables, 845 columns, 72 sequences, extension contract, zero rows, and normalized catalog/ledger equivalence. Rows, credentials, URLs, identifiers, checksums, and private topology MUST NOT enter artifacts.

#### Scenario: Two clean resets match

- GIVEN separate disposable targets are reset to platform baseline
- WHEN full chain runs once on each target
- THEN both receipts MUST match and report zero application rows

#### Scenario: Replay evidence is incomplete

- GIVEN either replay fails, differs, or contains rows
- WHEN staging binding is requested
- THEN binding MUST remain blocked

### Requirement: Execution Approval Gates

Before any target execution, the system MUST record approved destination identity, empty application tables, empty application ledger, rollback owner, change window, extension capability, and data-owner approval for unknown or destructive differences. After binding, rollback MUST use reviewed forward compensation; before binding, target recreation MAY be used. Production MUST remain untouched.

#### Scenario: All execution gates close

- GIVEN every required approval and preflight result is recorded
- WHEN owner approves a staging execution slice
- THEN that approved slice MAY proceed

#### Scenario: Gate remains open

- GIVEN any execution gate is pending or fails
- WHEN migration, binding, or deployment is requested
- THEN request MUST be blocked
