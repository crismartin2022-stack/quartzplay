# Staging Relational and Security Specification

## Purpose

Keep the QuartzPlay staging schema structurally equal to production and closed to the Supabase Data API.

## Requirements

### Requirement: Versioned Relational Parity

The executable migration chain MUST contain, after Foundation, schema-only migrations that create exactly the production keys (79 primary, 8 unique), 3 foreign keys, 144 standalone indexes, and the reporting view, with no data, owners, or privileges.

#### Scenario: Replay reaches production structure

- GIVEN an empty Postgres 17 database with Supabase roles and the extensions schema
- WHEN the full chain is applied in lexical order
- THEN the public schema has 80 tables, constraints 79/8/3, 231 indexes, and 1 view

#### Scenario: Runtime bootstrap indexes do not break the chain

- GIVEN the seven runtime bootstrap indexes already exist
- WHEN the index migration runs
- THEN those seven are skipped and every other index is created unguarded

### Requirement: Versioned Data API Lockdown

The chain MUST enable row level security on every public table and revoke table, sequence, function, and default privileges from `anon` and `authenticated`.

#### Scenario: Replay leaves no Data API access

- WHEN the full chain is applied
- THEN no public table lacks row level security and `anon` and `authenticated` hold no table grants

### Requirement: Chain Governance

Governance tests MUST pin the exact executable chain, and the Foundation disposable replay harness MUST keep validating only the Foundation files.

#### Scenario: Unexpected migration file

- WHEN a migration file outside the pinned chain appears
- THEN the chain governance test fails

#### Scenario: Foundation harness ignores later slices

- WHEN the harness lists migrations with later slices present
- THEN it returns only the three Foundation files and still refuses retired versions
