import fs from "fs";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../..");
const canonicalMemoryPath = path.join(
  repositoryRoot,
  "openspec/specs/project-memory/spec.md"
);
const migrationManifestPath = path.join(
  repositoryRoot,
  "openspec/changes/quartzplay-staging-foundations/migration-manifest.md"
);
const forbiddenConnectionUri = ["post", "gres", "://"].join("");
const forbiddenDatabaseAssignment = ["DATABASE", "URL="].join("_");

function readFile(filePath) {
  return fs.readFileSync(filePath, "utf8");
}

describe("QuartzPlay project-memory handoff", () => {
  test("declares committed OpenSpec as canonical authority", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain("# QuartzPlay Project Memory");
    expect(memory).toContain(
      "This committed OpenSpec document is QuartzPlay's canonical takeover memory."
    );
  });

  test("records QuartzPlay and IAQP ownership boundaries", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain("QuartzPlay owns player identity, authorization, and wallet balances.");
    expect(memory).toContain("IAQP owns roulette state, results, and roulette records.");
    expect(memory).toContain("No cross-service transaction is implied.");
  });

  test("records wallet debit, prize credit, and refund contracts", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain("QP-CT-002 — Roulette Bet Debit");
    expect(memory).toContain("QP-CT-003 — Roulette Prize Credit");
    expect(memory).toContain("QP-CT-004 — Roulette Refund Credit");
  });

  test("defines a clean-CI validation boundary", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain(
      "Canonical CI validation MUST read committed OpenSpec content only; it MUST NOT read the external local guide."
    );
  });

  test("records approved staging authority and blocks unsafe reconciliation", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain("## 10. Staging Authority and Safety Record");
    expect(memory).toContain("| Operations owner | Juan León |");
    expect(memory).toContain("| Rollback owner | Juan León |");
    expect(memory).toContain("| Data owner | Juan León |");
    expect(memory).toContain("| Change window | Pending |");
    expect(memory).toContain(
      "Supabase and `bot/db.py` remain reference-only and MUST NOT generate migrations."
    );
    expect(memory).toContain(
      "Unknown or destructive differences remain blocked until data-owner approval."
    );
  });

  test("keeps migration manifest to sanitized schema metadata", () => {
    const manifest = readFile(migrationManifestPath);

    expect(manifest).toContain("# QuartzPlay Staging Migration Manifest");
    expect(manifest).toContain(
      "Schema-only migration metadata; Foundation chain is runnable only after required staging approvals."
    );
    expect(manifest).toContain(
      "Rows, credentials, connection strings, tunnel output, and private topology are excluded."
    );
    expect(manifest).toContain("| Reconciliation status | Classified; not approved for execution. |");
    expect(manifest).not.toContain(forbiddenConnectionUri);
    expect(manifest).not.toContain(forbiddenDatabaseAssignment);
  });

  test("keeps rejected candidate provenance fail-closed", () => {
    const manifest = readFile(migrationManifestPath);

    expect(manifest).toContain("## Rejected-Candidate Correction");
    expect(manifest).toContain(
      "| Rejected candidate correction | Rejected; never authority; no source claim retained. |"
    );
    expect(manifest).toContain(
      "Snapshot-derived object names, identifiers, locations, raw checksums, connection data, rows, tunnel logs, and private topology are not recorded."
    );
  });

  test("quarantines legacy history as non-authoritative and blocks execution", () => {
    const manifest = readFile(migrationManifestPath);

    expect(manifest).toContain("## Reconciliation Decision");
    expect(manifest).toContain(
      "| Legacy migration history | Retired from executable path; current local untracked baseline is quarantined as non-authoritative; historical byte-exact provenance is unrecoverable. |"
    );
    expect(manifest).toContain(
      "| Object reconciliation | Complete as a review-safe opaque inventory; every destination action remains blocked pending approval. |"
    );
    expect(manifest).toContain(
      "No migration was applied to any database."
    );
  });

  test("records validated aggregate inventory without retaining checksums", () => {
    const manifest = readFile(migrationManifestPath);

    expect(manifest).toContain("| Count completeness | Passed: all required aggregate counts match the validated inventory. |");
    expect(manifest).toContain("| Sanitization | Passed: no rows or prohibited connection-like content detected. |");
    expect(manifest).toContain("| Fingerprints | Validated locally; omitted from Git because checksums are prohibited. |");
    expect(manifest).toContain("| Table | 80 | `001-080` | `create` | `blocked` |");
    expect(manifest).not.toContain(forbiddenConnectionUri);
    expect(manifest).not.toContain(forbiddenDatabaseAssignment);
  });

  test("records complete opaque reconciliation coverage from validated authority evidence", () => {
    const manifest = readFile(migrationManifestPath);

    expect(manifest).toContain("## Review-Safe Per-Object Reconciliation Inventory");
    expect(manifest).toContain("| Table | 80 | `001-080` | `create` | `blocked` |");
    expect(manifest).toContain("| Column | 845 | `001-845` | `create` | `blocked` |");
    expect(manifest).toContain("| Constraint | 90 | `001-090` | `create` | `blocked` |");
    expect(manifest).toContain("| Index | 224 | `001-224` | `mixed` | `blocked` |");
    expect(manifest).toContain("| Sequence | 72 | `001-072` | `create` | `blocked` |");
    expect(manifest).toContain("| Type | 162 | `001-162` | `exclude` | `blocked` |");
    expect(manifest).toContain("| View | 1 | `001` | `create` | `blocked` |");
    expect(manifest).toContain("| Extension | 5 | `001-005` | `translate` | `blocked` |");
    expect(manifest).toContain("| Rejected candidate correction | Rejected; never authority; no source claim retained. |");
    expect(manifest).not.toMatch(/`[a-f0-9]{64}`/i);
  });

  test("defines distinct staging identities and staging-only bindings", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain("## 11. Staging Isolation Contract");
    expect(memory).toContain(
      "Staging MUST use distinct Supabase, Railway API, Railway worker, PostgreSQL, and Redis identities."
    );
    expect(memory).toContain(
      "Each staging binding MUST resolve only to its staging identity and MUST NOT resolve to a production domain."
    );
    expect(memory).toContain(
      "Production PSP and Telegram credentials MUST NOT be present in staging."
    );
  });

  test("limits staging data and requires non-value smoke evidence", () => {
    const memory = readFile(canonicalMemoryPath);

    expect(memory).toContain(
      "Staging MUST contain zero production rows and only empty or approved synthetic schema data."
    );
    expect(memory).toContain(
      "Smoke evidence MUST verify staging identity, expected schema version, API health, worker health, Redis health, and absence of production bindings without printing values."
    );
    expect(memory).toContain(
      "Railway-to-Supabase production migration remains a separate future change requiring backup, restore, validation, cutover, and explicit approval."
    );
  });
});
