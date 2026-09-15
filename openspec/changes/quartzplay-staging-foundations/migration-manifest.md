# QuartzPlay Staging Migration Manifest

Schema-only migration metadata; Foundation chain is runnable only after required staging approvals.

## Authority

| Field | Record |
|---|---|
| Source authority | Validated protected production schema catalog; identity remains outside Git and is not asserted here. |
| Authority scope | Observed schema metadata only. |
| Operations owner | Juan León |
| Rollback owner | Juan León |
| Data owner | Juan León |
| Change window | Pending |
| Capture approval | Local validation passed; candidate content is not retained. |

## Evidence Validation

| Check | Result |
|---|---|
| Protected snapshot identity | Validated locally; no source identifier is retained. |
| Count completeness | Passed: all required aggregate counts match the validated inventory. |
| Sanitization | Passed: no rows or prohibited connection-like content detected. |
| Fingerprints | Validated locally; omitted from Git because checksums are prohibited. |
| Authority candidate result | Accepted for approved Foundation schema-only migration generation; no destination action is authorized. |

Snapshot-derived object names, identifiers, locations, raw checksums, connection data, rows, tunnel logs, and private topology are not recorded.

## Rejected-Candidate Correction

| Field | Record |
|---|---|
| Rejected candidate correction | Rejected; never authority; no source claim retained. |
| Prior rejection record | Retained only as fail-closed provenance: incomplete and unsafe evidence could not support reconciliation. |
| Source attribution | None. The rejected material is not attributed to the validated authority. |
| Reuse | Prohibited for inventory, fingerprint, planning, or migration decisions. |

This correction removes the prior rejected candidate's aggregate counts and checksum. It does not
reclassify that candidate, infer its source, or claim it represented production.

## Exclusions

Rows, credentials, connection strings, tunnel output, and private topology are excluded.

Production data is not copied, seeded, or handled by this work unit. Wallet balances,
payments, identifiers, Telegram identities, agency credentials, and tokens require separate
data-owner approval before any handling decision.

## Reconciliation Decision

| Field | Record |
|---|---|
| Authority inventory | Validated protected catalog; schema-only evidence used locally for review-safe reconciliation. |
| Repository migration inventory | Reference-only aggregate scan: 80 tables, 72 sequences, 137 indexes; no authority inference. |
| Bootstrap reference | Reference-only aggregate scan: 9 tables, 7 indexes; it cannot generate migrations. |
| Empty Supabase baseline | Destination reference only; no destination query, apply, or inspection occurred. |
| Object reconciliation | Complete as a review-safe opaque inventory; every destination action remains blocked pending approval. |
| Reconciliation status | Classified; not approved for execution. |
| Legacy migration history | Retired from executable path; current local untracked baseline is quarantined as non-authoritative; historical byte-exact provenance is unrecoverable. |
| Runnable migrations | Foundation chain (`20260914*`) only; retired `20260907*` baselines are excluded from execution. |

## Review-Safe Per-Object Reconciliation Inventory

Opaque ordinal ranges cover every validated object exactly once within its kind. They are local
review handles, not source names, source identifiers, or fingerprints. Object fingerprints and
crosswalks were validated locally but are omitted because this artifact cannot retain sensitive
checksums, object names, or identifiers. `blocked` destination action means no migration, query,
or configuration action is permitted.

| Kind | Count | Opaque ordinal coverage | Classification | Destination action |
|---|---:|---|---|---|
| Table | 80 | `001-080` | `create` | `blocked` |
| Column | 845 | `001-845` | `create` | `blocked` |
| Constraint | 90 | `001-090` | `create` | `blocked` |
| Index | 224 | `001-224` | `mixed` | `blocked` |
| Sequence | 72 | `001-072` | `create` | `blocked` |
| Type | 162 | `001-162` | `exclude` | `blocked` |
| View | 1 | `001` | `create` | `blocked` |
| Extension | 5 | `001-005` | `translate` | `blocked` |

| Kind detail | Count | Opaque ordinal coverage | Classification | Dependencies / review condition |
|---|---:|---|---|---|
| Primary-key constraint | 79 | `001-079` | `create` | Table and columns; approval required. |
| Unique constraint | 8 | `080-087` | `create` | Table and columns; approval required. |
| Foreign-key constraint | 3 | `088-090` | `create` | Referenced table order; deferred-cycle review required. |
| Constraint-backed index | 87 | `001-087` | `exclude` | Created by its constraint; do not duplicate. |
| Standalone index | 137 | `088-224` | `create` | Table and columns; approval required. |
| Derived type | 162 | `001-162` | `exclude` | Catalog-derived type; do not create separately. |

The authority-to-reference comparison is complete locally. `match` is not claimed from repository
or bootstrap evidence because those sources remain reference-only. All proposed `create`,
`translate`, and `exclude` outcomes require explicit review before a later migration task may
turn them into a destination action.

## Foundation Implementation (PR 2, `size:exception`)

Maintainer approval permits this Foundation-only, schema-only DDL work unit despite its expected
review size. The generated static manifest records 80 tables, 845 columns, 72 sequences, 162
derived types, and 5 extensions. It records all 90 constraints, 224 indexes, and 1 view as
future Relational scope only; no definition from those categories is included in Foundation DDL.

| Artifact | Status | Boundary |
|---|---|---|
| `supabase/foundation-schema-manifest.json` | Created | Sanitized static parity data for Foundation objects and aggregate future-slice counts. |
| `20260914090000_quartzplay_foundation_extensions.sql` | Created | Creates only approved supported extensions after capability preflight; built-in and provider-managed extensions are explicitly excluded. |
| `20260914090100_quartzplay_foundation_sequences.sql` | Created | Creates all Foundation sequences before their dependent table defaults. |
| `20260914090200_quartzplay_foundation_tables.sql` | Created | Creates all tables, columns, defaults, and sequence ownership links; identity/generated metadata is recorded as absent. |
| `bot/tests/test_staging_schema.py` | Created | Static parity, order, schema-only, no-DML, and sensitive-provenance checks. |

Foundation migrations deliberately omit constraints, foreign keys, indexes, views, policies,
roles, grants, RLS, application configuration, runtime bindings, rows, and seed data. They use
unguarded creation so an already-present object stops migration rather than concealing drift.
No migration was applied to any database.

## Next Gate

Foundation static work is complete. Do not begin Relational or Security work without its separate
approved work unit. Applying these migrations still requires destination identity, extension
capability, empty-target, migration-ledger, rollback-owner, and change-window approval.

## Rollback

Remove Foundation migration files, Foundation static manifest, paired static test, and this
Foundation manifest section together. No runtime, database, cloud, deployment, configuration,
or data state changed in this work unit.
