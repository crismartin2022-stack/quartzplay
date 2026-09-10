# QuartzPlay Staging Migration Manifest

Schema-only metadata; no runnable migrations.

## Authority

| Field | Record |
|---|---|
| Source authority | Approved QuartzPlay Railway production PostgreSQL service; identity retained outside Git. |
| Authority scope | Observed schema metadata only. |
| Operations owner | Juan León |
| Rollback owner | Juan León |
| Data owner | Juan León |
| Change window | Pending |
| Capture approval | Schema-only, least-privilege capture approved. |

## Exclusions

Rows, credentials, connection strings, tunnel output, and private topology are excluded.

Production data is not copied, seeded, or handled by this work unit. Wallet balances,
payments, identifiers, Telegram identities, agency credentials, and tokens require separate
data-owner approval before any handling decision.

## Reconciliation Status

| Field | Record |
|---|---|
| Railway schema evidence | Authoritative after approved external schema-only capture. |
| Supabase baseline | Reference-only; cannot generate migrations. |
| `bot/db.py` bootstrap | Reference-only; cannot generate migrations. |
| Reconciliation status | Blocked pending approved differences |
| Unknown or destructive differences | Blocked until data-owner approval. |
| Runnable migrations | None. |

## Next Gate

Record only sanitized, classified schema metadata after approved external capture. Every
difference needs classification and data-owner approval before any migration proposal.

## Rollback

Remove this manifest and its paired documentation validation only. No runtime or data state
changes exist in this work unit.
