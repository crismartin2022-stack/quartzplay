# Apply Progress: Staging Relational and Security Slices

## Status

Partial. Tasks 1.1, 1.2, 2.2, 2.3 are complete (TDD RED/GREEN cycle for chain
governance, structural slice tests, and the Foundation disposable replay
harness restriction). Tasks 3.2 (staging dry run + apply) and 4.1 (open PR)
are out of scope for this pass — no cloud resource was touched, no commit was
made, and no branch action was taken, per the operating constraints for this
session.

## TDD Cycle Evidence

| Phase | Command | Result |
|---|---|---|
| RED | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `4 failed, 133 passed, 128 warnings in 3.61s` — failures: `test_staging_schema.py::FoundationSchemaTests::test_executable_ledger_contains_only_authoritative_foundation_chain`, `test_disposable_replay.py::DisposableReplayTests::test_migrations_are_exact_lexical_files_and_ledger_records_only_successes`, `test_disposable_replay.py::DisposableReplayTests::test_portless_commands_use_two_internal_networks_and_target_local_psql`, `test_disposable_replay.py::DisposableReplayTests::test_failed_migration_or_ledger_write_stops_ordered_apply_without_repair` |
| GREEN (targeted) | `cd bot && <venv>/bin/python -m pytest tests/test_staging_schema.py tests/test_disposable_replay.py -q` | `58 passed in 0.12s` |
| GREEN (full suite) | `cd bot && <venv>/bin/python -m pytest tests/ -q` | `148 passed, 128 warnings in 3.63s` |
| Lint | `git diff --check` | exit 0, no output (no whitespace/conflict-marker errors) |
| Working tree | `git status --short` | 3 modified test/harness files; the 5 generated migration SQL files and the openspec change folder remain untracked (`??`), unmodified |

148 = 133 previously passing + 4 fixed + 11 new tests (3 in
`test_disposable_replay.py`, 8 in `test_staging_schema.py`).

## Changed Files

- `bot/tests/test_staging_schema.py` — renamed `AUTHORITATIVE_CHAIN` to
  `FOUNDATION_CHAIN` (kept as a backward-compatible alias), added
  `SLICE_CHAIN` (the five new migrations), updated
  `test_executable_ledger_contains_only_authoritative_foundation_chain` to
  assert the executable files equal `FOUNDATION_CHAIN + SLICE_CHAIN` while the
  manifest's `executable_chain` still equals `FOUNDATION_CHAIN` only. Added a
  new `RelationalSecuritySliceTests` class with 8 structural tests covering:
  exact primary/unique constraint counts (87 = 79 + 8), exact index count
  (144) with `IF NOT EXISTS` guarding only the 7 named bootstrap indexes,
  exact foreign key count (3), the single `v_actividad` view, RLS enabled for
  exactly the 80 tables in the Foundation manifest, the six anon/authenticated
  revoke statements (tables, sequences, functions, and their three default
  privilege forms), absence of `INSERT`/`COPY`/`OWNER TO`/`GRANT` across all
  five slice files, and that `IF NOT EXISTS` appears only in the indexes file
  and only on the 7 guarded statements.
- `bot/tests/test_disposable_replay.py` — added 3 tests proving
  `migration_files()` ignores later non-Foundation slice files (using a temp
  directory and `patch("disposable_replay.ROOT", ...)`, matching the pattern
  used by the existing `assert_local_link_absent` tests), still refuses when a
  retired-prefix file is present, and still refuses when the Foundation subset
  is incomplete, all with slice files also present in the directory.
- `bot/tools/disposable_replay.py` — `migration_files()` now filters
  `supabase/migrations/*.sql` down to the Foundation ledger versions before
  checking the exact 3-file chain, instead of requiring the whole directory to
  contain only Foundation files. It still raises `SafetyError` if any
  retired-prefix (`20260907`) file exists anywhere in the directory, or if the
  Foundation subset is not exactly `EXPECTED_FOUNDATION_LEDGER`. Non-Foundation
  slice files (the five new relational/security migrations) are now
  transparently ignored by this harness, matching the spec's "Foundation
  harness ignores later slices" scenario.

## Deviations

- Did not modify `supabase/foundation-schema-manifest.json`. No test in scope
  required a manifest change: the manifest's `executable_chain` field
  correctly continues to describe the Foundation-only chain, and the new
  chain-governance assertion accounts for the five slice files separately via
  `SLICE_CHAIN` rather than expecting the manifest to enumerate them.
- Kept `AUTHORITATIVE_CHAIN` as a name (aliased to `FOUNDATION_CHAIN`) rather
  than removing it, since no test or other file outside
  `test_staging_schema.py` referenced it; this is a minimal, low-risk
  compatibility shim rather than a functional requirement.
- Did not touch the five generated SQL migration files, `tasks.md` items 3.2
  or 4.1, or any git/branch/commit/cloud state, per explicit instruction.

## Rollback Boundary

Everything in this pass is confined to three test/tooling files under `bot/`
plus this progress note and the `tasks.md` checkbox updates. Nothing was
staged or committed. To roll back: `git checkout -- bot/tests/test_staging_schema.py
bot/tests/test_disposable_replay.py bot/tools/disposable_replay.py
openspec/changes/quartzplay-staging-relational-security/tasks.md` and remove
this file. No SQL, no branch, no cloud resource was touched, so there is
nothing else to unwind.
