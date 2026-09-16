# Delta for Project Memory

## ADDED Requirements

### Requirement: Staging Authority and Safety Record

Project memory MUST record validated protected current production API-connected catalog evidence as staging schema authority, with 80 ordinary tables and 845 columns. It MUST preserve reference-only status for repository/Supabase baselines and `bot/db.py`, the superseded 46-public-table observation, no-row policy, executable-chain remediation boundary, and execution approvals. It MUST NOT record rows, credentials, connection strings, tunnel logs, identifiers, checksums, or private topology.

#### Scenario: Approved staging record

- GIVEN authority evidence and required execution approvals are recorded
- WHEN project memory is updated
- THEN it records the 80-table/845-column scope, exclusions, chain status, and unresolved gates

#### Scenario: Unsafe memory content

- GIVEN proposed memory includes data rows or sensitive connection detail
- WHEN memory review runs
- THEN the content MUST be rejected

#### Scenario: Superseded or unsafe authority input

- GIVEN a historical 46-table observation, a legacy baseline, or unsafe capture content is proposed
- WHEN memory review runs
- THEN it MUST preserve it only as non-authoritative history or reject it
