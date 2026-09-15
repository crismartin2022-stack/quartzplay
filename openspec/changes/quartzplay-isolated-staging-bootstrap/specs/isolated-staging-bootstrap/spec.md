# Isolated Staging Bootstrap Specification

## Purpose

Define empty QuartzPlay staging isolated from production.

## Requirements

### Requirement: Protected Staging Branch and Deployment Gate

The system MUST provide a `staging` branch from approved `main`. It MUST accept only passing pull requests and reject direct pushes and deletion. Staging deployment MUST be restricted to this branch and MUST NOT constitute production deployment proof.

#### Scenario: Approved pull request reaches staging

- GIVEN `staging` exists from approved `main`
- WHEN a pull request with required checks passes and is merged
- THEN the merge is accepted into `staging`
- AND the staging deployment gate may evaluate that branch

#### Scenario: Direct branch mutation is attempted

- GIVEN `staging` protection is active
- WHEN an actor attempts a direct push or branch deletion
- THEN the operation is rejected

### Requirement: Railway Resource Isolation

The staging environment MUST bind API, worker, PostgreSQL, and Redis only to distinct staging resources selected under QuartzPlay. Staging MUST NOT use production resources, local Railway linkage, credentials, domains, Telegram credentials, or payment-service-provider identities. Worker polling MUST remain disabled.

#### Scenario: Staging bindings are reviewed

- GIVEN a proposed API, worker, database, and Redis binding set
- WHEN the Railway operator explicitly selects QuartzPlay and verifies each binding
- THEN every binding identifies a distinct staging resource
- AND no prohibited production identity or credential is present

#### Scenario: Production binding is proposed

- GIVEN a staging resource binding references a production identity or domain
- WHEN the isolation gate evaluates the binding
- THEN the staging bootstrap is rejected

### Requirement: Empty Isolated Supabase

The staging environment MUST use a Supabase project distinct from production. Before separately approved foundation work, its application schema MUST be empty and database rows, storage objects, and Auth users MUST each equal zero. Schema source selection and evidence acceptance MUST require data-owner approval.

#### Scenario: Fresh Supabase project passes emptiness gate

- GIVEN an isolated Supabase project with no application schema or stored data
- WHEN the data owner reviews the schema and inventory evidence
- THEN the project is accepted for staging bootstrap

#### Scenario: Non-empty or production Supabase project is selected

- GIVEN the selected project is production or contains application schema, rows, objects, or Auth users
- WHEN the emptiness gate evaluates it
- THEN the staging bootstrap is rejected

### Requirement: Sanitized Evidence and Smoke Contract

The system MUST record value-free evidence of branch protection, QuartzPlay selection, isolated identities, and Supabase inventory. Smoke evidence MUST show `/livez` and `/readyz` return HTTP 200 without values, worker deployment, Redis health, and zero Supabase rows, objects, and users. Evidence MUST NOT expose secrets, production identifiers, domains, PSP identities, Telegram credentials, or customer data; smoke checks MUST NOT claim parity, bindings, runtime probes, or production readiness.

#### Scenario: Sanitized smoke checks pass

- GIVEN all approved staging resources are isolated and available
- WHEN the defined smoke contract is executed
- THEN required checks pass within their stated limits
- AND recorded evidence contains no prohibited values

#### Scenario: Evidence exceeds contract limits

- GIVEN smoke output exposes a secret, production identifier, or unsupported claim
- WHEN the evidence gate reviews it
- THEN the bootstrap is not accepted until sanitized evidence is supplied

### Requirement: Bounded Rollback

Rollback MUST remove staging protections first, then staging API and worker, then staging PostgreSQL and Redis, and finally staging Supabase only after bindings are removed. Deleting `staging` MUST require owner approval and confirmation of no dependents. Rollback MUST NOT alter production or `quartzplay-staging-foundations`.

#### Scenario: Isolated staging rollback completes

- GIVEN owner-approved rollback and no remaining staging dependents
- WHEN rollback follows required order
- THEN only staging resources and policies are removed

#### Scenario: Branch deletion lacks approval or has dependents

- GIVEN `staging` deletion lacks owner approval or dependents remain
- WHEN rollback reaches branch deletion
- THEN the branch is retained
