# Migration Note: quartzplay-staging-backend-config

- **Original name:** `staging-foundation`, a tracker in the `quartzplay-staging-backend-recovery` worktree on branch `feat/staging-backend-config-recovery`; never committed.
- **Migrated:** 2026-09-15 by `quartzplay-openspec-consolidation`; renamed to avoid confusion with `quartzplay-staging-foundations`. File contents are unchanged.
- **Why not superseded:** the branch is merged into `main`, but verification on `origin/main` found open work.

## Verified State on origin/main (2026-09-15)

| Task | State | Evidence |
|---|---|---|
| 1.1–1.3 | Done | `bot/config.py` with fail-closed parsers and production-disjoint checks; config tests in `bot/tests/test_runtime_config.py` (not compared line by line with the tracker) |
| 2.1 | Open | No constructor probes found |
| 2.2 | Partial | `bot/casino_api.py` loads runtime settings before app construction; `bot/db.py` still reads `DATABASE_URL` from the environment |
| 2.3 | Partial | `bot/server.py` uses poller runtime settings; `bot/admin_handlers.py` still reads `ADMIN_IDS` from the environment |
| 2.4 | Open | Depends on 2.1–2.3 |
| 3.1–3.3 | Done per tracker | Tracker evidence |

## Residual Risk

Low: the same variables pass fail-closed validation at process start, but these consumers bypass the validated values.

## Next

Continue as its own SDD change (tasks 2.1–2.4) after the consolidation lands.
