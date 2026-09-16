# Staging Readiness Specification

## Purpose

Define process liveness and bounded API traffic-readiness for QuartzPlay staging without coupling readiness to workers, external providers, schema provisioning, or secrets.

## Requirements

### Requirement: Process Liveness Endpoint

The API MUST expose `GET /livez`. It MUST return HTTP `200` with exactly `{"status":"live"}` when the API can serve the request. It MUST perform no database, schema, Telegram, poller, provider, wallet, roulette, odds, or other dependency I/O.

#### Scenario: Liveness succeeds during dependency failure

- GIVEN all readiness and external dependency seams fail if called
- WHEN a client requests `GET /livez`
- THEN the response status is `200`
- AND its body is exactly `{"status":"live"}` and no seam is called

#### Scenario: Liveness is repeatable

- GIVEN API process remains able to serve requests
- WHEN a client requests `GET /livez` repeatedly
- THEN every response is `200` with same body

### Requirement: Bounded Database and Schema Readiness

The API MUST expose `GET /readyz` as a read-only traffic-eligibility check. It MUST complete database connectivity and minimal required relation/column-schema probes under one request deadline. Default deadline MUST be two seconds; configured values MUST be bounded from 100 milliseconds through two seconds. A successful response MUST be HTTP `200` with exactly `{"status":"ready"}`. Readiness MUST NOT bootstrap, create, alter, migrate, or otherwise mutate schema.

#### Scenario: Readiness succeeds after both probes

- GIVEN connectivity and required-schema probes succeed before deadline
- WHEN a client requests `GET /readyz`
- THEN response status is `200` with body `{"status":"ready"}`

#### Scenario: Connectivity failure fails closed

- GIVEN database connectivity probe fails
- WHEN a client requests `GET /readyz`
- THEN response status is `503` and reason is `database_unavailable`

#### Scenario: Required schema is missing

- GIVEN connectivity succeeds and required relation or column probe fails
- WHEN a client requests `GET /readyz`
- THEN response status is `503` and reason is `schema_unavailable`

#### Scenario: Complete readiness operation times out

- GIVEN either readiness probe does not finish before configured deadline
- WHEN a client requests `GET /readyz`
- THEN response status is `503` and reason is `timeout`
- AND response completes no later than configured deadline plus test scheduling tolerance

#### Scenario: Failure response is sanitized and read-only

- GIVEN a probe raises an error containing DSN, credentials, or provider detail
- WHEN a client requests `GET /readyz`
- THEN response contains only `status` and stable `reason` fields
- AND it contains neither error text nor schema-mutating operation

### Requirement: Readiness Dependency and Process Isolation

`/readyz` MUST NOT depend on Telegram, poller state, provider state, background-task state, business queries, or worker availability. Independent `web` and `worker` process definitions MUST remain available for staging. Poller disablement or exit MUST NOT change API liveness or successful database/schema readiness; worker cleanup and exit status remain worker-owned.

#### Scenario: Poller does not gate API readiness

- GIVEN poller is disabled or has exited and database/schema probes succeed
- WHEN a client requests `/livez` and `/readyz` from web process
- THEN responses are `200` with their respective success bodies

#### Scenario: Telegram unavailable does not gate readiness

- GIVEN Telegram initialization is unavailable and database/schema probes succeed
- WHEN a client requests `GET /readyz`
- THEN response is `200` with body `{"status":"ready"}`

### Requirement: Test-First Delivery, Scope, and Rollback

Delivery MUST follow RED-GREEN-REFACTOR: focused failing endpoint/probe/process tests MUST precede production behavior, then pass, then be refactored without behavior change. This slice MUST NOT perform cloud changes, live validation, migrations, schema redesign, secret inspection or changes, commits, pushes, or PRs. Rollback MUST restore prior health-check paths and release without destructive data work; worker MAY be stopped independently.

#### Scenario: Focused test matrix proves contract

- GIVEN delivery begins for this slice
- WHEN test work is reviewed
- THEN tests cover success, timeout, connectivity, schema, secrecy, no-DDL, and worker isolation before behavior is accepted

#### Scenario: Rollback preserves data and process separation

- GIVEN readiness rollout must be withdrawn
- WHEN rollback restores prior release and health-check paths
- THEN no migration, destructive schema action, or secret change occurs
- AND worker can be stopped without requiring API shutdown
