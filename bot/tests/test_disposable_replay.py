import json
import io
import subprocess
import sys
import tempfile
from pathlib import Path
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT / "bot" / "tools"))

from disposable_replay import (  # noqa: E402
    _expected_catalog,
    _inspect_resource,
    _target,
    cleanup_target,
    cleanup_targets,
    CleanupError,
    SafetyError,
    assert_local_link_absent,
    assert_local_image,
    build_database_command,
    build_internal_network_command,
    build_ledger_insert_command,
    build_ledger_bootstrap_command,
    build_failure_diagnostic_receipt,
    build_migration_command,
    build_replay_receipt,
    compare_replays,
    capture_snapshot,
    execute_two_replays,
    load_policy,
    migration_files,
    main,
    preflight,
    persist_failure_diagnostic,
    redact_preflight,
    redact_receipt,
    sanitize_process_error,
    validate_portless_environment,
    validate_replay_topology,
    validate_snapshot,
    wait_for_postgres,
)


def valid_snapshot():
    catalog = _expected_catalog()
    return {
        "ledger": [
            ["20260914090000", "quartzplay_foundation_extensions"],
            ["20260914090100", "quartzplay_foundation_sequences"],
            ["20260914090200", "quartzplay_foundation_tables"],
        ],
        **catalog,
        "rows": [["private_table", "0"] for _ in range(80)],
        "relational": [],
        "security": [],
        "grants": [],
        "default_privileges": [],
        "platform_version": [["15.8"]],
        "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]],
        "schemas": [["extensions"]],
    }


class DisposableReplayTests(unittest.TestCase):
    def test_capture_treats_absent_platform_ledger_as_empty_and_reads_existing_ledger(self):
        def rows_without_ledger(_target, query, _environment):
            if "to_regclass" in query:
                return [["f"]]
            if "count(*)" in query:
                return [["0"]]
            return [["catalog"]]

        def rows_with_ledger(_target, query, _environment):
            if "to_regclass" in query:
                return [["t"]]
            if "schema_migrations" in query:
                return [["20260914090000"]]
            if "count(*)" in query:
                return [["0"]]
            return [["catalog"]]

        with patch("disposable_replay._psql_rows", side_effect=rows_without_ledger):
            without_ledger = capture_snapshot({"host": "localhost"}, {})
        with patch("disposable_replay._psql_rows", side_effect=rows_with_ledger):
            with_ledger = capture_snapshot({"host": "localhost"}, {})

        self.assertEqual(without_ledger["ledger"], [])
        self.assertEqual(with_ledger["ledger"], [["20260914090000"]])

    def test_policy_declares_two_portless_internal_targets(self):
        policy = load_policy()

        self.assertEqual(policy["target"], "portless-disposable-only")
        self.assertEqual(policy["replays"], 2)
        self.assertEqual(policy["expected_counts"], {"tables": 80, "columns": 845, "sequences": 72})
        self.assertTrue(policy["no_seed"])
        self.assertEqual(policy["network_mode"], "internal")
        self.assertEqual(policy["architecture"], "arm64")
        self.assertEqual(policy["executor"], "container-internal-psql")
        self.assertEqual(policy["ledger_semantics"], "psql-success-recorded")
        self.assertNotIn("cli_image", policy)

    def test_portless_commands_use_two_internal_networks_and_target_local_psql(self):
        policy = load_policy()
        first = {"label": "a", "owner": "test-a", "network": "quartzplay-replay-a-net", "database": "quartzplay-replay-a-db", "tool": "quartzplay-replay-a-tool", "volume": "quartzplay-replay-a-data", "password": "test-password"}
        second = {"label": "b", "owner": "test-b", "network": "quartzplay-replay-b-net", "database": "quartzplay-replay-b-db", "tool": "quartzplay-replay-b-tool", "volume": "quartzplay-replay-b-data", "password": "test-password"}

        self.assertEqual(build_internal_network_command(first), ["docker", "network", "create", "--internal", "--label", "com.quartzplay.replay-owner=test-a", first["network"]])
        database = build_database_command(first, policy)
        migration = build_migration_command(first, migration_files()[0])

        self.assertIn("supabase/postgres:15.8.1.060", database)
        self.assertNotIn("-p", database)
        self.assertNotIn("--publish", database)
        self.assertTrue(any("readonly" in item for item in database))
        self.assertTrue(any("/work/migrations" in item for item in database))
        self.assertEqual(migration[:4], ["docker", "exec", "--env", f"PGPASSWORD={first['password']}"])
        self.assertIn(first["database"], migration)
        self.assertIn("psql", migration)
        self.assertIn("--no-psqlrc", migration)
        self.assertIn("--set=ON_ERROR_STOP=1", migration)
        self.assertIn("--file", migration)
        self.assertNotIn("supabase", migration)
        self.assertTrue(validate_replay_topology((first, second)))
        with self.assertRaisesRegex(SafetyError, "independent"):
            validate_replay_topology((first, {**first, "label": "b"}))

    def test_targets_are_unique_owned_and_reject_shared_networks_or_volumes(self):
        first = _target("a")
        second = _target("b")

        self.assertNotEqual(first["network"], second["network"])
        self.assertNotEqual(first["volume"], second["volume"])
        self.assertNotEqual(first["owner"], second["owner"])
        self.assertIn("--label", build_internal_network_command(first))
        self.assertIn("--label", build_database_command(first, load_policy()))
        with self.assertRaisesRegex(SafetyError, "independent"):
            validate_replay_topology((first, {**second, "network": first["network"]}))
        with self.assertRaisesRegex(SafetyError, "independent"):
            validate_replay_topology((first, {**second, "volume": first["volume"]}))

    def test_cleanup_refuses_unowned_resources_and_never_reports_destroyed(self):
        target = _target("a")
        with patch("disposable_replay._inspect_resource", return_value={"com.quartzplay.replay-owner": "other"}):
            with self.assertRaisesRegex(CleanupError, "cleanup"):
                cleanup_target(target)

    def test_inspection_accepts_only_resource_kind_specific_docker_absence_errors(self):
        absence_errors = (
            ("container", "Error response from daemon: No such container: missing-container"),
            ("volume", "Error response from daemon: get missing-volume: no such volume"),
            ("network", "Error response from daemon: network missing-network not found"),
        )

        for kind, stderr in absence_errors:
            with self.subTest(kind=kind), patch(
                "disposable_replay.subprocess.run",
                return_value=subprocess.CompletedProcess([], 1, "", stderr),
            ):
                self.assertIsNone(_inspect_resource(kind, f"missing-{kind}"))

    def test_inspection_fails_closed_for_permission_and_unknown_errors(self):
        for kind, name, stderr in (
            ("container", "owned", "permission denied while trying to connect to Docker daemon socket"),
            ("network", "missing-network", "Error response from daemon: network missing-network not found unexpectedly"),
            ("container", "missing-container", "No such object: missing-container"),
            ("volume", "missing-volume", "Error response from daemon: no such volume: missing-volume"),
        ):
            with self.subTest(kind=kind, stderr=stderr), patch(
                "disposable_replay.subprocess.run",
                return_value=subprocess.CompletedProcess([], 1, "", stderr),
            ):
                with self.assertRaisesRegex(CleanupError, "inspection"):
                    _inspect_resource(kind, name)

    def test_inspection_fails_closed_for_mixed_errors_with_absence_text(self):
        absence_errors = (
            ("container", "missing-container", "Error response from daemon: No such container: missing-container"),
            ("volume", "missing-volume", "Error response from daemon: no such volume: missing-volume"),
            ("network", "missing-network", "Error response from daemon: network missing-network not found"),
        )

        for prefix in ("permission denied; ", "unknown Docker failure; "):
            for kind, name, absence_error in absence_errors:
                with self.subTest(prefix=prefix, kind=kind), patch(
                    "disposable_replay.subprocess.run",
                    return_value=subprocess.CompletedProcess([], 1, "", prefix + absence_error),
                ):
                    with self.assertRaisesRegex(CleanupError, "inspection"):
                        _inspect_resource(kind, name)

    def test_cleanup_attempts_every_owned_resource_and_aggregates_failures(self):
        target = _target("a")
        attempted = []

        def inspect(kind, name):
            if name in {target["database"], target["volume"]}:
                return {"com.quartzplay.replay-owner": target["owner"]}
            return None

        def remove(command, **_kwargs):
            attempted.append(command[-1])
            return subprocess.CompletedProcess(command, 1, "", "remove failed")

        with patch("disposable_replay._inspect_resource", side_effect=inspect), patch("disposable_replay.subprocess.run", side_effect=remove):
            with self.assertRaisesRegex(CleanupError, "cleanup"):
                cleanup_target(target)

        self.assertEqual(attempted, [target["database"], target["volume"]])

    def test_cleanup_attempts_both_targets_when_first_target_cleanup_fails(self):
        first = _target("a")
        second = _target("b")
        attempted = []

        def clean(target):
            attempted.append(target["label"])
            if target is second:
                raise CleanupError("resource cleanup failed")

        with patch("disposable_replay.cleanup_target", side_effect=clean):
            with self.assertRaisesRegex(CleanupError, "cleanup"):
                cleanup_targets((first, second))

        self.assertEqual(attempted, ["b", "a"])

    def test_preflight_rejects_postgresql_versions_other_than_pinned_15_8(self):
        target = _target("a")

        def snapshot(platform_version):
            return {
                "ledger": [],
                "tables": [],
                "platform_version": [[platform_version]],
                "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]],
                "extensions": [],
                "schemas": [["extensions"]],
            }

        with patch("disposable_replay.capture_snapshot", return_value=snapshot("15.8")):
            self.assertTrue(preflight(target)["pinned_platform_version"])
        for version in ("15.7", "16.0"):
            with self.subTest(version=version), patch("disposable_replay.capture_snapshot", return_value=snapshot(version)):
                with self.assertRaisesRegex(SafetyError, "pinned platform version"):
                    preflight(target)

    def test_process_errors_are_redacted_and_postgres_readiness_is_bounded(self):
        target = _target("a")
        raw = subprocess.CalledProcessError(1, ["docker"], output="postgresql://postgres:secret@db", stderr="secret")
        safe = sanitize_process_error(raw, (target,))

        self.assertIsInstance(safe, SafetyError)
        self.assertNotIn("secret", str(safe))
        self.assertNotIn("postgresql://", str(safe))
        with patch("disposable_replay._run", side_effect=raw), patch("disposable_replay.time.sleep") as sleep:
            with self.assertRaisesRegex(SafetyError, "readiness"):
                wait_for_postgres(target, attempts=2, delay_seconds=0)
        self.assertEqual(sleep.call_count, 1)

    def test_every_readiness_retry_has_a_subprocess_timeout_and_timeout_retries(self):
        target = _target("a")
        calls = []

        def timed_run(command, timeout=None):
            calls.append(timeout)
            raise subprocess.TimeoutExpired(command, timeout)

        with patch("disposable_replay._run", side_effect=timed_run), patch("disposable_replay.time.sleep"):
            with self.assertRaisesRegex(SafetyError, "readiness"):
                wait_for_postgres(target, attempts=2, delay_seconds=0)

        self.assertEqual(len(calls), 2)
        self.assertTrue(all(timeout and timeout > 0 for timeout in calls))

    def test_main_never_prints_called_process_error_command_secrets(self):
        raw = subprocess.CalledProcessError(1, ["docker", "exec", "postgresql://postgres:secret@db"], output="secret", stderr="secret")
        stderr = io.StringIO()

        with patch("disposable_replay.execute_two_replays", side_effect=raw), patch("sys.stderr", stderr):
            with self.assertRaises(SystemExit):
                main(["--execute", "--receipt", "safe.json"])

        self.assertNotIn("secret", stderr.getvalue())
        self.assertNotIn("postgresql://", stderr.getvalue())

    def test_portless_environment_rejects_remote_linked_and_host_tcp_inputs(self):
        self.assertTrue(validate_portless_environment({"PATH": "/usr/bin"}))
        for unsafe in (
            {"SUPABASE_ACCESS_TOKEN": "present"},
            {"SUPABASE_DB_URL": "postgresql://remote"},
            {"QUARTZPLAY_LOCAL_DATABASE_URL_A": "postgresql://localhost/db"},
            {"PGHOST": "127.0.0.1"},
            {"DATABASE_URL": "postgresql://staging/db"},
        ):
            with self.assertRaises(SafetyError):
                validate_portless_environment(unsafe)

    def test_validator_rejects_rows_and_deferred_objects(self):
        snapshot = valid_snapshot()
        snapshot["rows"][0][1] = "1"
        snapshot["relational"] = [["private_fk", "foreign key"]]
        snapshot["security"] = [["private_table", "row_security"]]

        result = validate_snapshot(snapshot)

        self.assertFalse(result["ok"])
        self.assertEqual(result["counts"]["rows"], 1)
        self.assertEqual(result["counts"]["relational"], 1)
        self.assertEqual(result["counts"]["security"], 1)

    def test_validator_rejects_grants_and_default_privileges(self):
        grants = valid_snapshot()
        defaults = valid_snapshot()
        grants["grants"] = [["private_table", "role=arwdDxt"]]
        defaults["default_privileges"] = [["postgres", "r", "role=arwdDxt"]]

        self.assertIn("grants", validate_snapshot(grants)["failures"])
        self.assertIn("default-privileges", validate_snapshot(defaults)["failures"])

    def test_global_default_privileges_query_covers_namespace_zero(self):
        from disposable_replay import CATALOG_QUERIES

        self.assertIn("defaclnamespace = 0", CATALOG_QUERIES["default_privileges"])

    def test_validator_requires_exact_foundation_ledger_and_receipt_reports_it(self):
        snapshot = valid_snapshot()
        validation = validate_snapshot(snapshot)
        receipt = redact_receipt("run-a", validation)
        snapshot["ledger"][2][0] = "20260914090300"

        invalid = validate_snapshot(snapshot)

        self.assertTrue(validation["ok"])
        self.assertTrue(receipt["checks"]["foundation_ledger"])
        self.assertFalse(invalid["ok"])
        self.assertIn("foundation-ledger", invalid["failures"])

    def test_migrations_are_exact_lexical_files_and_ledger_records_only_successes(self):
        target = _target("a")
        files = migration_files()

        self.assertEqual([path.name for path in files], [
            "20260914090000_quartzplay_foundation_extensions.sql",
            "20260914090100_quartzplay_foundation_sequences.sql",
            "20260914090200_quartzplay_foundation_tables.sql",
        ])
        self.assertEqual(build_migration_command(target, files[1])[-2:], ["--file", "/work/migrations/20260914090100_quartzplay_foundation_sequences.sql"])
        self.assertIn("CREATE TABLE", build_ledger_bootstrap_command(target)[-1])
        insert = build_ledger_insert_command(target, files[1])
        self.assertIn("20260914090100", insert[-1])
        self.assertIn("quartzplay_foundation_sequences", insert[-1])

    def test_migration_files_ignores_later_non_foundation_slices(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / "supabase" / "migrations"
            migrations.mkdir(parents=True)
            for name in (
                "20260914090000_quartzplay_foundation_extensions.sql",
                "20260914090100_quartzplay_foundation_sequences.sql",
                "20260914090200_quartzplay_foundation_tables.sql",
                "20260917010000_quartzplay_relational_keys.sql",
                "20260917010100_quartzplay_relational_indexes.sql",
                "20260917010200_quartzplay_relational_foreign_keys.sql",
                "20260917010300_quartzplay_relational_views.sql",
                "20260917010400_quartzplay_security_baseline.sql",
            ):
                (migrations / name).write_text("-- placeholder\n")

            with patch("disposable_replay.ROOT", root):
                files = migration_files()

            self.assertEqual(
                [path.name for path in files],
                [
                    "20260914090000_quartzplay_foundation_extensions.sql",
                    "20260914090100_quartzplay_foundation_sequences.sql",
                    "20260914090200_quartzplay_foundation_tables.sql",
                ],
            )

    def test_migration_files_still_refuses_retired_versions_when_slices_present(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / "supabase" / "migrations"
            migrations.mkdir(parents=True)
            for name in (
                "20260907190103_retired.sql",
                "20260914090000_quartzplay_foundation_extensions.sql",
                "20260914090100_quartzplay_foundation_sequences.sql",
                "20260914090200_quartzplay_foundation_tables.sql",
                "20260917010000_quartzplay_relational_keys.sql",
            ):
                (migrations / name).write_text("-- placeholder\n")

            with patch("disposable_replay.ROOT", root):
                with self.assertRaisesRegex(SafetyError, "Foundation lexical chain"):
                    migration_files()

    def test_migration_files_refuses_incomplete_foundation_subset_when_slices_present(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            migrations = root / "supabase" / "migrations"
            migrations.mkdir(parents=True)
            for name in (
                "20260914090000_quartzplay_foundation_extensions.sql",
                "20260914090200_quartzplay_foundation_tables.sql",
                "20260917010000_quartzplay_relational_keys.sql",
            ):
                (migrations / name).write_text("-- placeholder\n")

            with patch("disposable_replay.ROOT", root):
                with self.assertRaisesRegex(SafetyError, "Foundation lexical chain"):
                    migration_files()

    def test_topology_and_receipt_never_describe_a_cli_or_tool_target(self):
        target = _target("a")
        validation = validate_snapshot(valid_snapshot())
        receipt = build_replay_receipt(
            load_policy(),
            [redact_preflight({"ledger": [], "tables": [], "platform_version": [["15.8"]], "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]], "extensions": [], "schemas": [["extensions"]]})] * 2,
            validation, validation, {"match": True, "first_ok": True, "second_ok": True},
            {"created": True, "validated": True, "cleanup": {"attempted": True, "succeeded": True}, "destroyed": True},
        )

        self.assertNotIn("tool", target)
        self.assertEqual(receipt["runtime"]["architecture"], "arm64")
        self.assertEqual(receipt["runtime"]["executor"], "container-internal-psql")
        self.assertEqual(receipt["runtime"]["ledger_semantics"], "psql-success-recorded")
        self.assertNotIn("cli", json.dumps(receipt).lower())

    def test_local_pinned_image_must_be_arm64_before_creating_disposable_resources(self):
        with patch("disposable_replay._run", return_value=subprocess.CompletedProcess([], 0, "arm64\n", "")):
            self.assertTrue(assert_local_image(load_policy()))
        with patch("disposable_replay._run", return_value=subprocess.CompletedProcess([], 0, "amd64\n", "")):
            with self.assertRaisesRegex(SafetyError, "arm64"):
                assert_local_image(load_policy())

    def test_failed_migration_or_ledger_write_stops_ordered_apply_without_repair(self):
        target = _target("a")
        commands = []

        def run(command, **_kwargs):
            commands.append(command)
            if "--file" in command:
                raise subprocess.CalledProcessError(1, command)
            return subprocess.CompletedProcess(command, 0, "", "")

        with patch("disposable_replay._run", side_effect=run):
            with self.assertRaises(subprocess.CalledProcessError):
                from disposable_replay import apply_foundation_migrations
                apply_foundation_migrations(target)

        self.assertEqual(sum("INSERT INTO supabase_migrations" in command[-1] for command in commands if command), 0)

    def test_preflight_receipt_reports_empty_ledger_and_application_tables(self):
        empty = redact_preflight({"ledger": [], "tables": [], "platform_version": [["PostgreSQL 15.8"]], "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]], "extensions": [["plpgsql", "1.0", "pg_catalog"], ["supabase_vault", "0.3.1", "vault"]], "schemas": [["extensions"]]})
        nonempty = redact_preflight(
            {
                "ledger": [["20260914090000"]],
                "tables": [["private_table"]],
                "platform_version": [["PostgreSQL 15.8"]],
                "extension_available": [["pgcrypto", "1.3"]],
                "extensions": [["pgcrypto", "1.2", "public"]],
                "schemas": [],
            }
        )

        self.assertEqual(
            empty,
            {
                "empty_application_ledger": True,
                "zero_application_tables": True,
                "platform_version": "PostgreSQL 15.8",
                "pinned_platform_version": False,
                "extension_capability": True,
                "provider_extensions_schema": True,
                "installed_extension_state": True,
            },
        )
        self.assertEqual(
            nonempty,
            {
                "empty_application_ledger": False,
                "zero_application_tables": False,
                "platform_version": "PostgreSQL 15.8",
                "pinned_platform_version": False,
                "extension_capability": False,
                "provider_extensions_schema": False,
                "installed_extension_state": False,
            },
        )

    def test_validator_rejects_catalog_parity_and_exact_extension_drift(self):
        snapshot = valid_snapshot()
        snapshot["columns"][0][3] = "now()"
        snapshot["sequences"][0][8] = "wrong_table"
        snapshot["extensions"].append(["unapproved_extension", "1.0", "extensions"])

        result = validate_snapshot(snapshot)

        self.assertFalse(result["ok"])
        self.assertIn("column-parity", result["failures"])
        self.assertIn("sequence-parity", result["failures"])
        self.assertIn("extensions", result["failures"])

    def test_metadata_only_target_gate_drift_is_not_a_schema_contract_failure(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["platform_version"] = [["15.7"]]

        validation = validate_snapshot(second)
        comparison = compare_replays(first, second)

        self.assertTrue(validation["schema_contract_ok"])
        self.assertFalse(validation["target_gates_ok"])
        self.assertIn("platform-version", validation["target_gate_failures"])
        self.assertTrue(comparison["schema_contract_match"])
        self.assertFalse(comparison["match"])
        self.assertEqual(
            comparison["first_difference"],
            {"scope": "target-gate", "category": "platform-version", "reason": "gate-failed"},
        )

    def test_schema_default_and_sequence_ownership_drift_fail_contract_with_safe_diagnostic(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["columns"][0][3] = "unsafe-default-value"
        second["sequences"][0][8] = "private_table_name"

        validation = validate_snapshot(second)
        comparison = compare_replays(first, second)
        serialized = json.dumps(comparison)

        self.assertFalse(validation["schema_contract_ok"])
        self.assertIn("column-parity", validation["schema_contract_failures"])
        self.assertIn("sequence-parity", validation["schema_contract_failures"])
        self.assertFalse(comparison["schema_contract_match"])
        self.assertEqual(
            comparison["first_difference"],
            {"scope": "schema-contract", "category": "columns", "reason": "mismatch"},
        )
        self.assertNotIn("unsafe-default-value", serialized)
        self.assertNotIn("private_table_name", serialized)

    def test_now_default_is_stable_schema_contract_data(self):
        snapshot = valid_snapshot()
        now_defaults = [row[3] for row in snapshot["columns"] if row[3] == "now()"]

        validation = validate_snapshot(snapshot)
        comparison = compare_replays(snapshot, valid_snapshot())

        self.assertGreater(len(now_defaults), 0)
        self.assertTrue(validation["schema_contract_ok"])
        self.assertTrue(comparison["schema_contract_match"])

    def test_comparison_diagnostic_never_retains_sensitive_values_or_topology(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["tables"][0][0] = "postgresql://user:secret@private-host/private_table"
        second["columns"][0][3] = "password=secret"
        second["sequences"][0][8] = "internal-network-topology"

        comparison = compare_replays(first, second)
        serialized = json.dumps(comparison)

        self.assertEqual(
            comparison["first_difference"],
            {"scope": "schema-contract", "category": "tables", "reason": "mismatch"},
        )
        self.assertNotIn("postgresql://", serialized)
        self.assertNotIn("secret", serialized)
        self.assertNotIn("private-host", serialized)
        self.assertNotIn("topology", serialized)

    def test_failure_diagnostic_receipt_retains_only_sanitized_comparison_evidence(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["tables"][0][0] = "postgresql://user:secret@private-host/private_table"
        second["columns"][0][3] = "password=secret"
        comparison = compare_replays(first, second)

        receipt = build_failure_diagnostic_receipt(
            validate_snapshot(first), validate_snapshot(second), comparison
        )
        serialized = json.dumps(receipt)

        self.assertEqual(receipt["status"], "failed")
        self.assertTrue(receipt["redacted"])
        self.assertEqual(receipt["comparison_category"], "schema-contract")
        self.assertEqual(receipt["first_difference"], {"key": "tables", "class": "mismatch"})
        self.assertEqual(receipt["counts"]["first"], {"tables": 80, "columns": 845, "sequences": 72, "ledger": 3, "rows": 0, "relational": 0, "security": 0, "grants": 0, "default_privileges": 0})
        self.assertEqual(receipt["target_gate_outcomes"], {"first": True, "second": True})
        for forbidden in ("postgresql://", "secret", "private-host", "private_table", "password=", "sql", "url", "credential", "artifact", "topology"):
            self.assertNotIn(forbidden, serialized.lower())

    def test_failure_diagnostic_receipt_reports_target_gate_outcomes_without_success_claim(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["platform_version"] = [["15.7"]]

        receipt = build_failure_diagnostic_receipt(
            validate_snapshot(first), validate_snapshot(second), compare_replays(first, second)
        )

        self.assertEqual(receipt["status"], "failed")
        self.assertNotIn("passed", json.dumps(receipt))
        self.assertEqual(receipt["comparison_category"], "target-gate")
        self.assertEqual(receipt["first_difference"], {"key": "platform-version", "class": "gate-failed"})
        self.assertEqual(receipt["target_gate_outcomes"], {"first": True, "second": False})

    def test_failure_diagnostic_receipt_sanitizes_untrusted_diagnostic_and_count_inputs(self):
        hostile = {
            "counts": {"tables": "private_table", "columns": "password=secret"},
            "target_gates_ok": "postgresql://user:secret@private-host",
        }
        receipt = build_failure_diagnostic_receipt(
            hostile,
            hostile,
            {"first_difference": {"scope": "internal-topology", "category": "private_table", "reason": "password=secret"}},
        )
        serialized = json.dumps(receipt)

        self.assertEqual(receipt["comparison_category"], "comparison")
        self.assertEqual(receipt["first_difference"], {"key": "unavailable", "class": "blocked"})
        self.assertEqual(receipt["counts"], {"first": {"tables": 0, "columns": 0, "sequences": 0, "ledger": 0, "rows": 0, "relational": 0, "security": 0, "grants": 0, "default_privileges": 0}, "second": {"tables": 0, "columns": 0, "sequences": 0, "ledger": 0, "rows": 0, "relational": 0, "security": 0, "grants": 0, "default_privileges": 0}})
        self.assertEqual(receipt["target_gate_outcomes"], {"first": False, "second": False})
        for forbidden in ("private_table", "password=", "postgresql://", "secret", "private-host", "topology"):
            self.assertNotIn(forbidden, serialized)

    def test_persisted_failure_diagnostic_exists_without_claiming_replay_success(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["platform_version"] = [["15.7"]]
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "failure-receipt.json"

            persist_failure_diagnostic(
                receipt_path,
                validate_snapshot(first),
                validate_snapshot(second),
                compare_replays(first, second),
            )

            persisted = json.loads(receipt_path.read_text())
        self.assertEqual(persisted["status"], "failed")
        self.assertNotIn("passed", json.dumps(persisted))
        self.assertEqual(persisted["target_gate_outcomes"], {"first": True, "second": False})

    def test_receipt_is_redacted_and_comparison_requires_exact_normalized_match(self):
        first = valid_snapshot()
        second = valid_snapshot()
        second["columns"][0][2] = "uuid"

        comparison = compare_replays(first, second)
        receipt = redact_receipt("run-a", validate_snapshot(first), comparison)
        serialized = json.dumps(receipt)

        self.assertFalse(comparison["match"])
        self.assertTrue(receipt["redacted"])
        self.assertNotIn(first["tables"][0][0], serialized)
        self.assertNotIn("postgresql" + "://", serialized)

    def test_final_receipt_records_safe_portless_lifecycle_without_private_resources(self):
        validation = validate_snapshot(valid_snapshot())
        receipt = build_replay_receipt(
            load_policy(),
            [redact_preflight({"ledger": [], "tables": [], "platform_version": [["15.8"]], "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]], "extensions": [], "schemas": [["extensions"]]})] * 2,
            validation,
            validation,
            {"match": True, "first_ok": True, "second_ok": True},
            {"created": True, "validated": True, "cleanup": {"attempted": True, "succeeded": True}, "destroyed": True},
        )
        serialized = json.dumps(receipt)

        self.assertEqual(receipt["status"], "passed")
        self.assertEqual(receipt["topology"], {"independent": True, "internal_networks": True, "published_ports": False})
        self.assertTrue(receipt["lifecycle"]["destroyed"])
        self.assertNotIn("quartzplay-replay-a-db", serialized)
        self.assertNotIn("test-password", serialized)

    def test_receipt_fails_when_cleanup_is_incomplete(self):
        validation = validate_snapshot(valid_snapshot())
        receipt = build_replay_receipt(
            load_policy(), [], validation, validation,
            {"match": True, "first_ok": True, "second_ok": True},
            {"created": True, "validated": True, "cleanup": {"attempted": True, "succeeded": False}, "destroyed": False},
        )

        self.assertEqual(receipt["status"], "failed")
        self.assertFalse(receipt["lifecycle"]["destroyed"])

    def test_receipt_requires_created_two_complete_preflights_and_explicit_exact_parity(self):
        validation = validate_snapshot(valid_snapshot())
        complete_preflight = redact_preflight({"ledger": [], "tables": [], "platform_version": [["15.8"]], "extension_available": [["pgcrypto", "1.3"], ["uuid-ossp", "1.1"]], "extensions": [], "schemas": [["extensions"]]})
        receipt = build_replay_receipt(
            load_policy(), [complete_preflight], validation, validation,
            {"match": True, "first_ok": True, "second_ok": True},
            {"created": False, "validated": True, "cleanup": {"attempted": True, "succeeded": True}, "destroyed": True},
        )

        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["checks"]["complete_preflight"], False)
        self.assertEqual(receipt["checks"]["created"], False)
        self.assertEqual(receipt["checks"]["exact_table_parity"], True)
        self.assertEqual(receipt["checks"]["exact_column_parity"], True)
        self.assertEqual(receipt["checks"]["exact_sequence_parity"], True)
        self.assertEqual(receipt["checks"]["platform_version"], True)

    def test_failed_execution_removes_stale_receipt_before_any_replay_work(self):
        with tempfile.TemporaryDirectory() as directory:
            receipt_path = Path(directory) / "receipt.json"
            receipt_path.write_text('{"status": "passed"}\n')

            with patch("disposable_replay.assert_local_link_absent", side_effect=SafetyError("blocked")):
                with self.assertRaisesRegex(SafetyError, "blocked"):
                    execute_two_replays(receipt_path)

            self.assertFalse(receipt_path.exists())

    def test_local_supabase_link_metadata_blocks_replay_before_reset(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            self.assertTrue(assert_local_link_absent(root))
            link_path = root / "supabase" / ".temp" / "project-ref"
            link_path.parent.mkdir(parents=True)
            link_path.write_text("remote-project")

            with self.assertRaisesRegex(SafetyError, "link metadata"):
                assert_local_link_absent(root)


if __name__ == "__main__":
    unittest.main()
