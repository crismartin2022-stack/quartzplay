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
    expect(manifest).toContain("Schema-only metadata; no runnable migrations.");
    expect(manifest).toContain(
      "Rows, credentials, connection strings, tunnel output, and private topology are excluded."
    );
    expect(manifest).toContain("| Reconciliation status | Blocked pending approved differences |");
    expect(manifest).not.toContain("postgres://");
    expect(manifest).not.toContain("DATABASE_URL=");
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
