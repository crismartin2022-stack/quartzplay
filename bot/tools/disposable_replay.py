"""Portless, disposable Supabase migration replay evidence tool.

Host process manages Docker resources only. PostgreSQL is reached exclusively
from containers attached to isolated internal networks.
"""

import argparse
import csv
import io
import json
import os
from pathlib import Path
import secrets
import subprocess
import sys
import time


EXPECTED_COUNTS = {"tables": 80, "columns": 845, "sequences": 72}
REQUIRED_EXTENSIONS = {("pgcrypto", "1.3", "extensions"), ("uuid-ossp", "1.1", "extensions")}
REQUIRED_EXTENSION_AVAILABILITY = {("pgcrypto", "1.3"), ("uuid-ossp", "1.1")}
EXPECTED_FOUNDATION_LEDGER = ("20260914090000", "20260914090100", "20260914090200")
RETIRED_LEDGER_PREFIX = "20260907"
POLICY_PATH = Path(__file__).with_name("disposable-replay-policy.json")
ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = ROOT / "supabase" / "foundation-schema-manifest.json"
LOCAL_LINK_PATHS = (Path("supabase/.temp/project-ref"), Path("supabase/.temp/project-id"))
BLOCKED_ENVIRONMENT_KEYS = (
    "DATABASE_URL", "PGHOST", "PGPORT", "PGDATABASE", "PGUSER", "PGPASSWORD",
    "QUARTZPLAY_LOCAL_DATABASE_URL_A", "QUARTZPLAY_LOCAL_DATABASE_URL_B",
)
OWNERSHIP_LABEL = "com.quartzplay.replay-owner"
POSTGRES_READY_ATTEMPTS = 30
POSTGRES_READY_DELAY_SECONDS = 1
POSTGRES_READY_COMMAND_TIMEOUT_SECONDS = 5
SCHEMA_CONTRACT_KEYS = (
    "tables", "columns", "sequences", "extensions", "ledger", "relational",
    "security", "grants", "default_privileges",
)
SAFE_FAILURE_COUNT_KEYS = (
    "tables", "columns", "sequences", "ledger", "rows", "relational",
    "security", "grants", "default_privileges",
)
SAFE_FAILURE_SCOPES = {"schema-contract", "target-gate"}
SAFE_FAILURE_CATEGORIES = set(SCHEMA_CONTRACT_KEYS) | {
    "validation", "application-rows", "platform-version", "extension-availability",
    "provider-extensions-schema",
}
SAFE_FAILURE_CLASSES = {"mismatch", "gate-failed"}


class SafetyError(RuntimeError):
    """Raised when portless replay safety proof is absent."""


class CleanupError(SafetyError):
    """Raised when owned disposable resources cannot be proven removed."""


def load_policy():
    policy = json.loads(POLICY_PATH.read_text())
    required = {
        "target": "portless-disposable-only",
        "replays": 2,
        "no_seed": True,
        "network_mode": "internal",
        "database_image": "supabase/postgres:15.8.1.060",
        "platform_version": "15.8",
        "architecture": "arm64",
        "executor": "container-internal-psql",
        "ledger_semantics": "psql-success-recorded",
        "independent_targets": "separate-containers-volumes-and-internal-networks",
        "expected_counts": EXPECTED_COUNTS,
    }
    if any(policy.get(key) != value for key, value in required.items()):
        raise SafetyError("replay policy does not require pinned portless independent targets")
    return policy


def assert_local_link_absent(project_root=ROOT):
    if [path for path in LOCAL_LINK_PATHS if (project_root / path).is_file()]:
        raise SafetyError("local Supabase link metadata is present; refusing replay")
    return True


def validate_portless_environment(environment):
    unsafe = [key for key in environment if key.startswith("SUPABASE_") or key in BLOCKED_ENVIRONMENT_KEYS]
    if unsafe:
        raise SafetyError("remote, linked, or host TCP environment is present; refusing replay")
    return True


def validate_replay_topology(targets):
    if len(targets) != 2:
        raise SafetyError("exactly two independent disposable targets are required")
    resource_keys = ("network", "database", "volume")
    resources = [tuple(target[key] for key in resource_keys) for target in targets]
    owners = [target.get("owner") for target in targets]
    if len(set(resources)) != 2 or any(len(set(resource)) != len(resource) for resource in resources) or any(len({target[key] for target in targets}) != len(targets) for key in resource_keys) or len(set(owners)) != 2 or not all(owners):
        raise SafetyError("two independent container, network, and tool targets are required")
    return True


def validate_replay_targets(first, second):
    return validate_replay_topology((first, second))


def build_internal_network_command(target):
    return ["docker", "network", "create", "--internal", "--label", f"{OWNERSHIP_LABEL}={target['owner']}", target["network"]]


def build_volume_command(target):
    return ["docker", "volume", "create", "--label", f"{OWNERSHIP_LABEL}={target['owner']}", target["volume"]]


def build_database_command(target, policy):
    return [
        "docker", "run", "--detach", "--name", target["database"], "--label", f"{OWNERSHIP_LABEL}={target['owner']}", "--network", target["network"],
        "--mount", f"type=volume,src={target['volume']},dst=/var/lib/postgresql/data",
        "--mount", f"type=bind,src={ROOT / 'supabase' / 'migrations'},dst=/work/migrations,readonly",
        "--env", f"POSTGRES_PASSWORD={target['password']}", policy["database_image"],
    ]


def migration_files():
    files = tuple(sorted((ROOT / "supabase" / "migrations").glob("*.sql")))
    versions = tuple(path.name.split("_", 1)[0] for path in files)
    if versions != EXPECTED_FOUNDATION_LEDGER or any(path.name.startswith(RETIRED_LEDGER_PREFIX) for path in files):
        raise SafetyError("migration directory is not exact Foundation lexical chain; refusing replay")
    return files


def build_migration_command(target, migration_path):
    return [
        "docker", "exec", "--env", f"PGPASSWORD={target['password']}", target["database"], "psql",
        "--no-psqlrc", "--set=ON_ERROR_STOP=1", "--host", "localhost", "--username", "postgres", "--dbname", "postgres",
        "--file", f"/work/migrations/{migration_path.name}",
    ]


def build_psql_command(target, query):
    return ["docker", "exec", "--env", f"PGPASSWORD={target['password']}", target["database"], "psql", "--no-psqlrc", "--tuples-only", "--no-align", "--field-separator", "\t", "--host", "localhost", "--username", "postgres", "--dbname", "postgres", "--command", query]


def build_ledger_bootstrap_command(target):
    query = "CREATE SCHEMA IF NOT EXISTS supabase_migrations; CREATE TABLE supabase_migrations.schema_migrations (version text PRIMARY KEY, statements text[], name text NOT NULL);"
    return build_psql_command(target, query)


def build_ledger_insert_command(target, migration_path):
    version, name = migration_path.name.removesuffix(".sql").split("_", 1)
    query = f"INSERT INTO supabase_migrations.schema_migrations (version, statements, name) VALUES ('{version}', ARRAY[]::text[], '{name}');"
    return build_psql_command(target, query)


def _expected_catalog():
    manifest = json.loads(MANIFEST_PATH.read_text())
    owners, tables, columns = {}, [], []
    for table in manifest["tables"]:
        tables.append([table["name"], "t" if table["row_security"] else "f", "t" if table["force_row_security"] else "f"])
        for column in table["columns"]:
            default = column["default_expression"] or ""
            columns.append([table["name"], column["name"], column["type"], default, "NO" if column["not_null"] else "YES", column["identity_kind"] or "", column["generated_kind"] or ""])
            if default.startswith("nextval('"):
                owners[default.split("'")[1].split("::")[0]] = (table["name"], column["name"])
    sequences = []
    for sequence in manifest["sequences"]:
        sequences.append([sequence["name"], sequence["data_type"], str(sequence["start_value"]), str(sequence["increment_by"]), str(sequence["min_value"]), str(sequence["max_value"]), str(sequence["cache_size"]), "t" if sequence["cycle"] else "f", *owners.get(sequence["name"], ("", ""))])
    extensions = [[item["name"], item["version"], item["schema"]] for item in manifest["extensions"]]
    return {"tables": tables, "columns": columns, "sequences": sequences, "extensions": extensions}


def normalize_snapshot(snapshot):
    return {key: sorted(tuple(row) for row in snapshot.get(key, [])) for key in sorted(snapshot)}


def _count_nonzero_rows(rows):
    return sum(int(row[1]) for row in rows)


def validate_snapshot(snapshot):
    normalized, expected = normalize_snapshot(snapshot), _expected_catalog()
    counts = {"tables": len(normalized["tables"]), "columns": len(normalized["columns"]), "sequences": len(normalized["sequences"]), "ledger": len(normalized["ledger"]), "rows": _count_nonzero_rows(normalized["rows"]), "relational": len(normalized["relational"]), "security": len(normalized["security"]), "grants": len(normalized["grants"]), "default_privileges": len(normalized["default_privileges"])}
    schema_contract_failures = [f"{name}-count" for name, value in EXPECTED_COUNTS.items() if counts[name] != value]
    if any(row[0].startswith(RETIRED_LEDGER_PREFIX) for row in normalized["ledger"]): schema_contract_failures.append("retired-ledger")
    if tuple(row[0] for row in normalized["ledger"]) != EXPECTED_FOUNDATION_LEDGER or any(len(row) != 2 or not row[1] for row in normalized["ledger"]): schema_contract_failures.append("foundation-ledger")
    if counts["relational"]: schema_contract_failures.append("relational-objects")
    if counts["security"]: schema_contract_failures.append("security-objects")
    if counts["grants"]: schema_contract_failures.append("grants")
    if counts["default_privileges"]: schema_contract_failures.append("default-privileges")
    for name in ("tables", "columns", "sequences"):
        if normalized[name] != sorted(tuple(row) for row in expected[name]): schema_contract_failures.append(f"{name[:-1]}-parity")
    if normalized["extensions"] != sorted(tuple(row) for row in expected["extensions"]): schema_contract_failures.append("extensions")
    if any(len(row) != 10 or not row[8] or not row[9] for row in normalized["sequences"]): schema_contract_failures.append("sequence-ownership")
    target_gate_failures = []
    if counts["rows"]: target_gate_failures.append("application-rows")
    if normalized.get("platform_version") != [(load_policy()["platform_version"],)]: target_gate_failures.append("platform-version")
    if set(normalized.get("extension_available", [])) != REQUIRED_EXTENSION_AVAILABILITY: target_gate_failures.append("extension-availability")
    if normalized.get("schemas") != [("extensions",)]: target_gate_failures.append("provider-extensions-schema")
    failures = sorted(schema_contract_failures + target_gate_failures)
    return {
        "ok": not failures,
        "schema_contract_ok": not schema_contract_failures,
        "target_gates_ok": not target_gate_failures,
        "counts": counts,
        "failures": failures,
        "schema_contract_failures": sorted(schema_contract_failures),
        "target_gate_failures": sorted(target_gate_failures),
        "normalized": normalized,
    }


def _safe_first_difference(first, second, first_result, second_result):
    for category in SCHEMA_CONTRACT_KEYS:
        if first_result["normalized"].get(category) != second_result["normalized"].get(category):
            return {"scope": "schema-contract", "category": category, "reason": "mismatch"}
    for result in (first_result, second_result):
        if result["schema_contract_failures"]:
            return {"scope": "schema-contract", "category": "validation", "reason": "gate-failed"}
    for result in (first_result, second_result):
        if result["target_gate_failures"]:
            return {"scope": "target-gate", "category": result["target_gate_failures"][0], "reason": "gate-failed"}
    return None


def compare_replays(first, second):
    first_result, second_result = validate_snapshot(first), validate_snapshot(second)
    schema_contract_match = (
        first_result["schema_contract_ok"]
        and second_result["schema_contract_ok"]
        and all(first_result["normalized"].get(key) == second_result["normalized"].get(key) for key in SCHEMA_CONTRACT_KEYS)
    )
    target_gates_match = first_result["target_gates_ok"] and second_result["target_gates_ok"]
    return {
        "match": schema_contract_match and target_gates_match,
        "first_ok": first_result["ok"],
        "second_ok": second_result["ok"],
        "schema_contract_match": schema_contract_match,
        "target_gates_match": target_gates_match,
        "first_difference": _safe_first_difference(first, second, first_result, second_result),
    }


def redact_receipt(run_label, validation, comparison=None):
    receipt = {"receipt_version": 4, "run": run_label, "redacted": True, "validated": validation["ok"], "counts": validation["counts"], "checks": {"foundation_ledger": "foundation-ledger" not in validation["failures"], "no_application_rows": validation["counts"]["rows"] == 0, "no_relational_objects": validation["counts"]["relational"] == 0, "no_security_objects": validation["counts"]["security"] == 0, "no_grants": validation["counts"]["grants"] == 0, "no_default_privileges": validation["counts"]["default_privileges"] == 0, "exact_extensions": "extensions" not in validation["failures"], "sequence_ownership": "sequence-ownership" not in validation["failures"]}, "failures": validation["failures"]}
    if comparison is not None: receipt["comparison"] = comparison
    return receipt


def build_failure_diagnostic_receipt(first, second, comparison):
    """Build the only receipt allowed for an A/B comparison failure."""
    first_difference = comparison.get("first_difference") or {}
    scope = first_difference.get("scope")
    category = first_difference.get("category")
    reason = first_difference.get("reason")
    if scope not in SAFE_FAILURE_SCOPES or category not in SAFE_FAILURE_CATEGORIES or reason not in SAFE_FAILURE_CLASSES:
        scope, category, reason = "comparison", "unavailable", "blocked"

    def sanitized_counts(validation):
        counts = validation.get("counts", {})
        return {
            key: value if isinstance(value := counts.get(key), int) and not isinstance(value, bool) and value >= 0 else 0
            for key in SAFE_FAILURE_COUNT_KEYS
        }

    return {
        "receipt_version": 5,
        "redacted": True,
        "status": "failed",
        "comparison_category": scope,
        "first_difference": {
            "key": category,
            "class": reason,
        },
        "counts": {"first": sanitized_counts(first), "second": sanitized_counts(second)},
        "target_gate_outcomes": {
            "first": first.get("target_gates_ok") is True,
            "second": second.get("target_gates_ok") is True,
        },
    }


def persist_failure_diagnostic(receipt_path, first, second, comparison):
    receipt_path.write_text(
        json.dumps(build_failure_diagnostic_receipt(first, second, comparison), indent=2) + "\n"
    )


def build_replay_receipt(policy, preflights, first, second, comparison, lifecycle):
    """Build review-safe proof after all private Docker resources are removed."""
    checks = {
        "created": lifecycle["created"],
        "complete_preflight": len(preflights) == policy["replays"] and all(all(receipt.values()) for receipt in preflights),
        "exact_table_parity": "table-parity" not in first["failures"] and "table-parity" not in second["failures"],
        "exact_column_parity": "column-parity" not in first["failures"] and "column-parity" not in second["failures"],
        "exact_sequence_parity": "sequence-parity" not in first["failures"] and "sequence-parity" not in second["failures"],
        "platform_version": "platform-version" not in first["failures"] and "platform-version" not in second["failures"],
    }
    return {
        "receipt_version": 4,
        "redacted": True,
        "status": "passed" if comparison["match"] and all(checks.values()) and lifecycle["validated"] and lifecycle["cleanup"]["attempted"] and lifecycle["cleanup"]["succeeded"] and lifecycle["destroyed"] else "failed",
        "topology": {"independent": True, "internal_networks": True, "published_ports": False},
        "runtime": {"database_image": policy["database_image"], "architecture": policy["architecture"], "platform_version": policy["platform_version"], "executor": policy["executor"], "ledger_semantics": policy["ledger_semantics"]},
        "checks": checks,
        "preflight": preflights,
        "lifecycle": lifecycle,
        "runs": [redact_receipt("a", first), redact_receipt("b", second)],
        "comparison": comparison,
    }


CATALOG_QUERIES = {"ledger": "SELECT version::text FROM supabase_migrations.schema_migrations ORDER BY version;", "tables": "SELECT c.relname, c.relrowsecurity::text, c.relforcerowsecurity::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind = 'r' ORDER BY 1;", "columns": "SELECT c.relname, a.attname, format_type(a.atttypid, a.atttypmod), coalesce(pg_get_expr(d.adbin, d.adrelid), ''), CASE WHEN a.attnotnull THEN 'NO' ELSE 'YES' END, CASE WHEN a.attidentity = '' THEN '' ELSE a.attidentity::text END, CASE WHEN a.attgenerated = '' THEN '' ELSE a.attgenerated::text END FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace JOIN pg_attribute a ON a.attrelid = c.oid LEFT JOIN pg_attrdef d ON d.adrelid = c.oid AND d.adnum = a.attnum WHERE n.nspname = 'public' AND c.relkind = 'r' AND a.attnum > 0 AND NOT a.attisdropped ORDER BY 1, a.attnum;", "sequences": "SELECT s.relname, seq.seqtypid::regtype::text, seq.seqstart::text, seq.seqincrement::text, seq.seqmin::text, seq.seqmax::text, seq.seqcache::text, seq.seqcycle::text, coalesce(t.relname, ''), coalesce(a.attname, '') FROM pg_class s JOIN pg_namespace n ON n.oid = s.relnamespace JOIN pg_sequence seq ON seq.seqrelid = s.oid LEFT JOIN pg_depend d ON d.objid = s.oid AND d.deptype = 'a' LEFT JOIN pg_class t ON t.oid = d.refobjid LEFT JOIN pg_attribute a ON a.attrelid = t.oid AND a.attnum = d.refobjsubid WHERE n.nspname = 'public' AND s.relkind = 'S' ORDER BY 1;", "extensions": "SELECT e.extname, e.extversion, n.nspname FROM pg_extension e JOIN pg_namespace n ON n.oid = e.extnamespace ORDER BY 1;", "schemas": "SELECT nspname FROM pg_namespace WHERE nspname = 'extensions';", "extension_available": "SELECT name, default_version FROM pg_available_extensions WHERE name IN ('pgcrypto', 'uuid-ossp') ORDER BY 1;", "relational": "SELECT c.relname, c.relkind::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND c.relkind IN ('i', 'v', 'm') UNION ALL SELECT conname, contype::text FROM pg_constraint WHERE connamespace = 'public'::regnamespace ORDER BY 1;", "security": "SELECT c.relname, 'row-security' FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace WHERE n.nspname = 'public' AND (c.relrowsecurity OR c.relforcerowsecurity) UNION ALL SELECT policyname, 'policy' FROM pg_policies WHERE schemaname = 'public' ORDER BY 1;", "platform_version": "SHOW server_version;"}


def _psql_rows(target, query, _environment=None):
    result = subprocess.run(build_psql_command(target, query), check=True, capture_output=True, text=True)
    return [row for row in csv.reader(io.StringIO(result.stdout), delimiter="\t") if row]


CATALOG_QUERIES.update({
    "ledger": "SELECT version::text, name FROM supabase_migrations.schema_migrations ORDER BY version;",
    "grants": "SELECT c.relname, acl::text FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace CROSS JOIN LATERAL unnest(c.relacl) acl WHERE n.nspname = 'public' AND c.relkind IN ('r', 'S') ORDER BY 1, 2;",
    "default_privileges": "SELECT d.defaclrole::regrole::text, d.defaclobjtype::text, d.defaclacl::text FROM pg_default_acl d LEFT JOIN pg_namespace n ON n.oid = d.defaclnamespace WHERE d.defaclnamespace = 0 OR n.nspname = 'public' ORDER BY 1, 2, 3;",
})


def _application_ledger_exists(target, environment):
    rows = _psql_rows(target, "SELECT to_regclass('supabase_migrations.schema_migrations') IS NOT NULL;", environment)
    return bool(rows and rows[0][0] in {"t", "true", "1"})


def capture_snapshot(target, environment=None):
    snapshot = {name: _psql_rows(target, query, environment) for name, query in CATALOG_QUERIES.items() if name != "ledger"}
    snapshot["ledger"] = _psql_rows(target, CATALOG_QUERIES["ledger"], environment) if _application_ledger_exists(target, environment) else []
    snapshot["rows"] = []
    for table_name, *_ in snapshot["tables"]:
        rows = _psql_rows(target, f'SELECT count(*)::text FROM ONLY public."{table_name.replace(chr(34), chr(34) * 2)}";', environment)
        snapshot["rows"].append([table_name, rows[0][0]])
    return snapshot


def redact_preflight(snapshot):
    available = {tuple(row) for row in snapshot["extension_available"]}
    installed = {tuple(row) for row in snapshot["extensions"] if row[0] in {"pgcrypto", "uuid-ossp"}}
    platform_version = snapshot["platform_version"][0][0] if len(snapshot["platform_version"]) == 1 else None
    return {"empty_application_ledger": not snapshot["ledger"], "zero_application_tables": not snapshot["tables"], "platform_version": platform_version, "pinned_platform_version": platform_version == load_policy()["platform_version"], "extension_capability": available == {("pgcrypto", "1.3"), ("uuid-ossp", "1.1")}, "provider_extensions_schema": snapshot["schemas"] == [["extensions"]], "installed_extension_state": installed.issubset(REQUIRED_EXTENSIONS)}


def preflight(target):
    receipt = redact_preflight(capture_snapshot(target))
    if not receipt["pinned_platform_version"]:
        raise SafetyError("target platform version does not match pinned platform version; refusing replay")
    if not all(receipt.values()): raise SafetyError("target is not empty before migration; refusing replay")
    return receipt


def _run(command, timeout=None):
    return subprocess.run(command, check=True, capture_output=True, text=True, timeout=timeout)


def _assert_no_published_ports(target):
    ports = json.loads(_run(["docker", "inspect", "--format", "{{json .NetworkSettings.Ports}}", target["database"]]).stdout or "null")
    if ports not in ({}, None) and not all(binding is None for binding in ports.values()):
        raise SafetyError("database publishes ports; refusing replay")


def assert_local_image(policy):
    architecture = _run(["docker", "image", "inspect", "--format", "{{.Architecture}}", policy["database_image"]]).stdout.strip()
    if architecture != policy["architecture"]:
        raise SafetyError("database image architecture does not match pinned arm64 runtime; refusing replay")
    return True


def assert_exact_runtime(target, policy):
    version_rows = _psql_rows(target, "SHOW server_version;")
    if version_rows != [[policy["platform_version"]]]:
        raise SafetyError("target platform version does not match pinned platform version; refusing replay")
    return True


def _postgres_ready_command(target):
    return ["docker", "exec", target["database"], "pg_isready", "--host", "localhost", "--username", "postgres", "--dbname", "postgres"]


def wait_for_postgres(target, attempts=POSTGRES_READY_ATTEMPTS, delay_seconds=POSTGRES_READY_DELAY_SECONDS):
    for attempt in range(attempts):
        try:
            _run(_postgres_ready_command(target), timeout=POSTGRES_READY_COMMAND_TIMEOUT_SECONDS)
            return True
        except (subprocess.CalledProcessError, subprocess.TimeoutExpired):
            if attempt + 1 < attempts:
                time.sleep(delay_seconds)
    raise SafetyError("database readiness timeout; refusing replay")


def _target(label, run_id=None):
    run_id = run_id or secrets.token_hex(12)
    prefix = f"quartzplay-replay-{run_id}-{label}"
    return {"label": label, "owner": f"{run_id}-{label}-{secrets.token_hex(8)}", "network": f"{prefix}-net", "database": f"{prefix}-db", "volume": f"{prefix}-data", "password": secrets.token_urlsafe(24)}


def _inspect_resource(kind, name):
    label_format = "{{json .Config.Labels}}" if kind == "container" else "{{json .Labels}}"
    result = subprocess.run(["docker", kind, "inspect", "--format", label_format, name], check=False, capture_output=True, text=True)
    absence_patterns = {
        "container": f"Error response from daemon: No such container: {name}",
        "volume": f"Error response from daemon: get {name}: no such volume",
        "network": f"Error response from daemon: network {name} not found",
    }
    absence_pattern = absence_patterns.get(kind)
    if result.returncode == 1 and result.stderr.strip() == absence_pattern:
        return None
    if result.returncode != 0:
        raise CleanupError("resource cleanup inspection failed")
    try:
        return json.loads(result.stdout or "{}") or {}
    except json.JSONDecodeError as error:
        raise CleanupError("resource cleanup inspection failed") from error


def _assert_resources_absent(target):
    for kind, key in (("network", "network"), ("volume", "volume"), ("container", "database")):
        if _inspect_resource(kind, target[key]) is not None:
            raise SafetyError("replay resource name already exists; refusing replay")


def cleanup_target(target):
    resources = (("container", target["database"], ["docker", "rm", "--force", target["database"]]), ("volume", target["volume"], ["docker", "volume", "rm", "--force", target["volume"]]), ("network", target["network"], ["docker", "network", "rm", target["network"]]))
    failures = []
    for kind, name, remove_command in resources:
        try:
            labels = _inspect_resource(kind, name)
            if labels is None:
                continue
            if labels.get(OWNERSHIP_LABEL) != target["owner"]:
                failures.append(name)
                continue
            result = subprocess.run(remove_command, check=False, capture_output=True, text=True)
            if result.returncode != 0 or _inspect_resource(kind, name) is not None:
                failures.append(name)
        except Exception:
            failures.append(name)
    if failures:
        raise CleanupError("resource cleanup failed")
    return True


def cleanup_targets(targets):
    failures = []
    for target in reversed(targets):
        try:
            cleanup_target(target)
        except CleanupError:
            failures.append(target["label"])
    if failures:
        raise CleanupError("resource cleanup failed")
    return True


def apply_foundation_migrations(target):
    _run(build_ledger_bootstrap_command(target))
    for migration_path in migration_files():
        _run(build_migration_command(target, migration_path))
        _run(build_ledger_insert_command(target, migration_path))
    return True


def sanitize_process_error(error, targets=()):
    del error, targets
    return SafetyError("Docker command failed; replay blocked")


def execute_two_replays(receipt_path):
    receipt_path.unlink(missing_ok=True)
    policy, run_id = load_policy(), secrets.token_hex(12)
    targets = (_target("a", run_id), _target("b", run_id))
    assert_local_link_absent(); validate_portless_environment(os.environ); validate_replay_topology(targets)
    assert_local_image(policy)
    for target in targets:
        _assert_resources_absent(target)
    lifecycle, snapshots, preflights = {"created": False, "validated": False, "cleanup": {"attempted": False, "succeeded": False}, "destroyed": False}, [], []
    receipt, failure = None, None
    try:
        for target in targets:
            _run(build_internal_network_command(target)); _run(build_volume_command(target)); _run(build_database_command(target, policy)); wait_for_postgres(target); _assert_no_published_ports(target); assert_exact_runtime(target, policy); preflights.append(preflight(target)); apply_foundation_migrations(target); _assert_no_published_ports(target); snapshots.append(capture_snapshot(target))
        lifecycle["created"] = True
        first, second = validate_snapshot(snapshots[0]), validate_snapshot(snapshots[1]); comparison = compare_replays(*snapshots)
        lifecycle["validated"] = comparison["match"]
        receipt = (first, second, comparison)
        if not comparison["match"]:
            persist_failure_diagnostic(receipt_path, first, second, comparison)
            raise SafetyError("two-replay comparison failed; binding remains blocked")
    except subprocess.CalledProcessError as error:
        failure = sanitize_process_error(error, targets)
    except SafetyError as error:
        failure = error
    finally:
        lifecycle["cleanup"]["attempted"] = True
        try:
            cleanup_targets(targets)
            lifecycle["cleanup"]["succeeded"] = True
            lifecycle["destroyed"] = True
        except CleanupError as error:
            lifecycle["destroyed"] = False
            failure = error
    if receipt and not failure:
        first, second, comparison = receipt
        receipt_path.write_text(json.dumps(build_replay_receipt(policy, preflights, first, second, comparison, lifecycle), indent=2) + "\n")
    if failure:
        raise failure


def main(argv=None):
    parser = argparse.ArgumentParser(description="Run an approved portless disposable Supabase replay.")
    parser.add_argument("--execute", action="store_true")
    parser.add_argument("--receipt", type=Path, required=True)
    args = parser.parse_args(argv)
    try:
        if not args.execute: raise SafetyError("dry safety gate: pass --execute only during approved disposable replay")
        execute_two_replays(args.receipt)
    except subprocess.CalledProcessError as error:
        print(f"replay blocked: {sanitize_process_error(error)}", file=sys.stderr)
        raise SystemExit(2)
    except SafetyError as error:
        print(f"replay blocked: {error}", file=sys.stderr)
        raise SystemExit(2)


if __name__ == "__main__":
    main()
