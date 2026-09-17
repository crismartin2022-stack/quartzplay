import fs from "fs";
import path from "path";

const buildConfig = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../public/serve.json"), "utf8")
);
const packageJson = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../package.json"), "utf8")
);

function headerFor(source) {
  const rule = buildConfig.headers.find((entry) => entry.source === source);
  return rule?.headers?.find((header) => header.key === "Cache-Control")?.value;
}

describe("static hosting configuration", () => {
  test("never caches the entry document", () => {
    expect(headerFor("index.html")).toBe("no-store, must-revalidate");
    expect(headerFor("asset-manifest.json")).toBe("no-store, must-revalidate");
  });

  test("caches hashed assets immutably", () => {
    expect(headerFor("static/**")).toBe("public, max-age=31536000, immutable");
  });

  test("keeps the single-page fallback for unknown routes", () => {
    expect(buildConfig.rewrites).toEqual([
      { source: "**", destination: "/index.html" },
    ]);
  });

  test("serves with the configuration file instead of the single flag", () => {
    expect(packageJson.scripts.serve).toBe("serve build -l ${PORT:-3000}");
  });
});
