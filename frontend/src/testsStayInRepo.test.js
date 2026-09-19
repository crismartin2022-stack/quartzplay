// A test that reads a file outside the repository passes on the machine
// that happens to have that file and throws ENOENT everywhere else —
// during collection, so the whole suite goes red for a reason that has
// nothing to do with the code. It happened three times in this project
// with the same sibling prototype tree, and the review that caught two of
// them could not have caught the third, because it only sees the files a
// change touches. This is the check that sees all of them.
const fs = require("fs");
const path = require("path");

const SRC = __dirname;
const REPO_ROOT = path.resolve(SRC, "..", "..");

const testFiles = fs
  .readdirSync(SRC)
  .filter((name) => name.endsWith(".test.js"))
  .filter((name) => name !== path.basename(__filename));

// Any path built by walking far enough up to leave the repository. The
// repository root is two levels above src, so three or more is outside.
const ESCAPES = /path\.(resolve|join)\([^)]*(\.\.[^)]*){3,}\)/s;

describe("the suite depends only on what the repository ships", () => {
  test("there is something to check", () => {
    expect(testFiles.length).toBeGreaterThan(0);
  });

  test.each(testFiles)("%s reads nothing above the repository root", (name) => {
    const source = fs.readFileSync(path.join(SRC, name), "utf8");
    expect(source).not.toMatch(ESCAPES);
  });

  test("the repository root is where this check thinks it is", () => {
    expect(fs.existsSync(path.join(REPO_ROOT, "package.json"))).toBe(false);
    expect(fs.existsSync(path.join(REPO_ROOT, "frontend", "package.json"))).toBe(true);
  });
});
