import { execFileSync } from "child_process";
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const SOURCES = fs
  .readdirSync(SRC)
  .filter((name) => /\.(js|jsx)$/.test(name) && !name.includes(".test."))
  .map((name) => path.join(SRC, name));

function undefinedReferences(file) {
  try {
    execFileSync(
      path.resolve(SRC, "../node_modules/.bin/eslint"),
      [
        "--no-eslintrc",
        "--env", "browser,es2021,node",
        "--parser-options", "ecmaFeatures:{jsx:true},ecmaVersion:2021,sourceType:module",
        "--rule", JSON.stringify({ "no-undef": "error" }),
        "--format", "json",
        file,
      ],
      { encoding: "utf8" }
    );
    return [];
  } catch (error) {
    const report = JSON.parse(error.stdout || "[]");
    return report.flatMap((result) =>
      result.messages
        .filter((message) => message.ruleId === "no-undef")
        .map((message) => `${path.basename(result.filePath)}:${message.line} ${message.message}`)
    );
  }
}

describe("browser sources", () => {
  test.each(SOURCES.map((file) => [path.basename(file), file]))(
    "%s references no undefined variable",
    (_name, file) => {
      expect(undefinedReferences(file)).toEqual([]);
    },
    60000
  );
});
