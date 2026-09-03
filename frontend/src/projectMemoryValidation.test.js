import fs from "fs";
import path from "path";

const repositoryRoot = path.resolve(__dirname, "../..");
const canonicalMemoryPath = path.join(
  repositoryRoot,
  "openspec/specs/project-memory/spec.md"
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
});
