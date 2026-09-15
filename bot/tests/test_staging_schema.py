import json
import hashlib
from pathlib import Path
import re
import unittest


ROOT = Path(__file__).resolve().parents[2]
MIGRATIONS = ROOT / "supabase" / "migrations"
LEGACY_REFERENCE = ROOT / "supabase" / "legacy-reference" / "20260907191524_baseline.sql"
MANIFEST = ROOT / "supabase" / "foundation-schema-manifest.json"
CHANGE = ROOT / "openspec" / "changes" / "quartzplay-staging-foundations"
OPENSPEC_CONFIG = ROOT / "openspec" / "config.yaml"

AUTHORITATIVE_CHAIN = [
    "20260914090000_quartzplay_foundation_extensions.sql",
    "20260914090100_quartzplay_foundation_sequences.sql",
    "20260914090200_quartzplay_foundation_tables.sql",
]


class FoundationSchemaTests(unittest.TestCase):
    def test_executable_ledger_contains_only_authoritative_foundation_chain(self):
        manifest = json.loads(MANIFEST.read_text())
        executable_files = sorted(file.name for file in MIGRATIONS.glob("*.sql"))

        self.assertEqual(executable_files, AUTHORITATIVE_CHAIN)
        self.assertEqual(manifest["executable_chain"], AUTHORITATIVE_CHAIN)
        self.assertEqual(
            {
                key: manifest["legacy_reference"][key]
                for key in ("path", "executable", "retired_versions")
            },
            {
                "path": "supabase/legacy-reference/20260907191524_baseline.sql",
                "executable": False,
                "retired_versions": ["20260907190103", "20260907190144", "20260907191524"],
            },
        )
        self.assertFalse(any(name.startswith("20260907") for name in executable_files))

    def test_non_executable_legacy_baseline_is_reference_only_without_ledger_entries(self):
        executable_sql = "\n".join(file.read_text() for file in MIGRATIONS.glob("*.sql"))

        self.assertTrue(LEGACY_REFERENCE.is_file())
        self.assertNotIn("20260907", executable_sql)
        self.assertNotRegex(
            executable_sql,
            r"(?im)^\s*INSERT\s+INTO\s+.*(?:schema_migrations|migration_history)",
        )

    def test_legacy_reference_records_only_current_local_provenance(self):
        manifest = json.loads(MANIFEST.read_text())
        legacy_reference = manifest["legacy_reference"]
        current_sha256 = hashlib.sha256(LEGACY_REFERENCE.read_bytes()).hexdigest()

        self.assertEqual(legacy_reference["provenance"], "current-local-untracked-baseline")
        self.assertEqual(legacy_reference["historical_byte_exact"], False)
        self.assertEqual(legacy_reference["historical_provenance"], "unrecoverable")
        self.assertEqual(legacy_reference["current_local_sha256"], current_sha256)

        for artifact in [
            CHANGE / "design.md",
            CHANGE / "tasks.md",
            CHANGE / "specs" / "staging-foundations" / "spec.md",
        ]:
            artifact_text = artifact.read_text().lower()
            self.assertNotRegex(
                artifact_text,
                r"(?:legacy|historical).{0,120}byte[- ]for[- ]byte",
            )
            self.assertNotRegex(
                artifact_text,
                r"byte[- ]for[- ]byte.{0,120}(?:legacy|historical)",
            )

    def test_manifest_records_complete_foundation_catalog_without_sensitive_provenance(self):
        manifest = json.loads(MANIFEST.read_text())

        self.assertEqual(
            manifest["expected_counts"],
            {
                "tables": 80,
                "columns": 845,
                "constraints": 90,
                "indexes": 224,
                "sequences": 72,
                "types": 162,
                "views": 1,
                "extensions": 5,
            },
        )
        self.assertEqual(len(manifest["tables"]), 80)
        self.assertEqual(sum(len(table["columns"]) for table in manifest["tables"]), 845)
        self.assertEqual(len(manifest["sequences"]), 72)
        self.assertEqual(len(manifest["extensions"]), 5)
        self.assertEqual(manifest["standalone_types"], [])
        self.assertEqual(manifest["derived_type_count"], 162)

        provenance_safe_manifest = dict(manifest)
        provenance_safe_manifest.pop("legacy_reference", None)
        serialized = json.dumps(provenance_safe_manifest).lower()
        self.assertNotRegex(serialized, r"postgres(?:ql)?://|[a-f0-9]{64}|resource[_-]?id")

    def test_foundation_migrations_are_ordered_schema_only_and_match_manifest_objects(self):
        manifest = json.loads(MANIFEST.read_text())
        files = sorted(MIGRATIONS.glob("20260914*_quartzplay_foundation_*.sql"))

        self.assertEqual(
            [file.name for file in files],
            [
                "20260914090000_quartzplay_foundation_extensions.sql",
                "20260914090100_quartzplay_foundation_sequences.sql",
                "20260914090200_quartzplay_foundation_tables.sql",
            ],
        )

        sql = "\n".join(file.read_text() for file in files)
        self.assertEqual(len(re.findall(r"^CREATE TABLE public\.", sql, re.MULTILINE)), 80)
        self.assertEqual(len(re.findall(r"^CREATE SEQUENCE public\.", sql, re.MULTILINE)), 72)
        self.assertEqual(len(re.findall(r"^CREATE EXTENSION ", sql, re.MULTILINE)), 2)
        self.assertIn("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions VERSION '1.3';", sql)
        self.assertIn('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION \'1.1\';', sql)
        self.assertNotRegex(sql, r"(?im)^\s*CREATE\s+(TABLE|SEQUENCE)\s+IF\s+NOT\s+EXISTS\b")
        self.assertNotRegex(sql, r"(?im)^\s*(INSERT|UPDATE|DELETE|COPY|MERGE|GRANT|REVOKE)\b")
        self.assertNotRegex(sql, r"postgres(?:ql)?://|password\s*=|api[_-]?key\s*=|secret\s*=", re.IGNORECASE)

        for table in manifest["tables"]:
            self.assertIn(f"CREATE TABLE public.{table['name']} (", sql)
            for column in table["columns"]:
                self.assertIn(f"    {column['name']} {column['type']}", sql)

        for sequence in manifest["sequences"]:
            self.assertIn(f"CREATE SEQUENCE public.{sequence['name']}", sql)

    def test_extension_migration_requires_provider_schema_and_exact_versions(self):
        extension_sql = (MIGRATIONS / AUTHORITATIVE_CHAIN[0]).read_text()

        self.assertNotRegex(extension_sql, r"(?im)^\s*CREATE\s+SCHEMA\s+extensions\b")
        self.assertIn("to_regnamespace('extensions')", extension_sql)
        self.assertRegex(
            extension_sql,
            r"pg_available_extension_versions[\s\S]*extname\s*=\s*'pgcrypto'[\s\S]*version\s*=\s*'1\.3'",
        )
        self.assertRegex(
            extension_sql,
            r"pg_available_extension_versions[\s\S]*extname\s*=\s*'uuid-ossp'[\s\S]*version\s*=\s*'1\.1'",
        )
        self.assertRegex(
            extension_sql,
            r"pg_extension[\s\S]*extversion\s*<>\s*'1\.3'[\s\S]*extnamespace\s*<>\s*to_regnamespace\('extensions'\)",
        )
        self.assertRegex(
            extension_sql,
            r"pg_extension[\s\S]*extversion\s*<>\s*'1\.1'[\s\S]*extnamespace\s*<>\s*to_regnamespace\('extensions'\)",
        )
        self.assertIn("CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions VERSION '1.3';", extension_sql)
        self.assertIn('CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA extensions VERSION \'1.1\';', extension_sql)

    def test_known_static_artifacts_have_no_trailing_whitespace(self):
        static_artifacts = [
            LEGACY_REFERENCE,
            ROOT / ".atl" / "skill-registry.md",
            ROOT / "openspec" / "changes" / "archive" / "2026-09-03-project-memory-and-local-guide" / "verify-report.md",
        ]

        for artifact in static_artifacts:
            with self.subTest(artifact=artifact):
                self.assertTrue(artifact.is_file())
                self.assertTrue(
                    all(line == line.rstrip() for line in artifact.read_text().splitlines()),
                    f"{artifact.relative_to(ROOT)} contains trailing whitespace",
                )

    def test_test_runner_configuration_matches_package_script(self):
        package = json.loads((ROOT / "frontend" / "package.json").read_text())
        config = OPENSPEC_CONFIG.read_text()

        self.assertEqual(package["scripts"]["test"], "react-scripts test")
        self.assertIn("configured_script: true", config)


if __name__ == "__main__":
    unittest.main()
