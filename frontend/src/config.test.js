import fs from "fs";
import path from "path";
import { spawnSync } from "child_process";
import { getFrontendConfig, resolveFrontendConfig } from "./config";
import { normalizeHostname } from "./environmentValidation";

const stagingEnvironment = {
  APP_ENV: "staging",
  REACT_APP_ENV: "staging",
  REACT_APP_API_URL: "https://api.staging.quartzplay.example",
  REACT_APP_IAQP_URL: "https://casino.staging.iaqp.example",
  REACT_APP_APP_ORIGIN: "https://staging.quartzplay.example",
  REACT_APP_CASINO_HOSTS: "casino.staging.iaqp.example, www.casino.staging.iaqp.example",
  REACT_APP_BOT_USERNAME: "quartzplay_staging_bot",
};

const productionEnvironment = {
  APP_ENV: "production",
  REACT_APP_ENV: "production",
  REACT_APP_API_URL: "https://api.iaqp.lat",
  REACT_APP_IAQP_URL: "https://api-casino.iaqp.lat",
  REACT_APP_APP_ORIGIN: "https://valiant-gentleness-production-a779.up.railway.app",
  REACT_APP_CASINO_HOSTS: "iaqp.lat, www.iaqp.lat",
  REACT_APP_BOT_USERNAME: "quartzplay_bot",
};

const validatorPath = path.resolve(__dirname, "../scripts/validate-env.js");

function runPreflight(environment) {
  return spawnSync(process.execPath, [validatorPath], {
    env: { ...process.env, ...environment },
    encoding: "utf8",
  });
}

function expectRejectedWithoutValue(environment, variableName) {
  expect(() => resolveFrontendConfig(environment)).toThrow(variableName);
  try {
    resolveFrontendConfig(environment);
  } catch (error) {
    if (environment[variableName]) {
      expect(error.message).not.toContain(environment[variableName]);
    }
  }
}

describe("frontend destination configuration", () => {
  test("uses CRA-exposed staging identity for browser configuration", () => {
    const browserEnvironment = { ...stagingEnvironment, APP_ENV: undefined };
    expect(getFrontendConfig(browserEnvironment)).toEqual(resolveFrontendConfig(stagingEnvironment));
    expect(() => getFrontendConfig({ ...browserEnvironment, REACT_APP_API_URL: "not-a-url" })).toThrow("REACT_APP_API_URL");
  });

  test("uses CRA-exposed production identity for browser configuration", () => {
    const browserEnvironment = { ...productionEnvironment, APP_ENV: undefined };
    expect(getFrontendConfig(browserEnvironment)).toEqual(resolveFrontendConfig(productionEnvironment));
  });

  test.each([
    ["IAQP.LAT.", "iaqp.lat"],
    ["api.iaqp.lat.", "api.iaqp.lat"],
  ])("normalizes hostname %s before production matching", (hostname, expected) => {
    expect(normalizeHostname(hostname)).toBe(expected);
  });

  test("resolves only normalized staging destinations", () => {
    expect(resolveFrontendConfig(stagingEnvironment)).toEqual({
      apiUrl: "https://api.staging.quartzplay.example",
      iaqpUrl: "https://casino.staging.iaqp.example",
      appOrigin: "https://staging.quartzplay.example",
      casinoHosts: [
        "casino.staging.iaqp.example",
        "www.casino.staging.iaqp.example",
      ],
      botUsername: "quartzplay_staging_bot",
    });
  });

  test("resolves normalized production destinations", () => {
    expect(resolveFrontendConfig({ ...productionEnvironment, REACT_APP_API_URL: "https://API.IAQP.LAT." })).toEqual({
      apiUrl: "https://api.iaqp.lat",
      iaqpUrl: "https://api-casino.iaqp.lat",
      appOrigin: "https://valiant-gentleness-production-a779.up.railway.app",
      casinoHosts: ["iaqp.lat", "www.iaqp.lat"],
      botUsername: "quartzplay_bot",
    });
  });

  test.each([
    [{ ...stagingEnvironment, REACT_APP_API_URL: "" }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_IAQP_URL: "not-a-url" }, "REACT_APP_IAQP_URL"],
    [{ ...stagingEnvironment, REACT_APP_APP_ORIGIN: "http://staging.quartzplay.example" }, "REACT_APP_APP_ORIGIN"],
    [{ ...stagingEnvironment, REACT_APP_API_URL: "https://api.iaqp.lat" }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_API_URL: "https://api.iaqp.lat." }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_CASINO_HOSTS: "iaqp.lat." }, "REACT_APP_CASINO_HOSTS"],
    [{ ...stagingEnvironment, REACT_APP_APP_ORIGIN: "https://juego.iaqp.lat" }, "REACT_APP_APP_ORIGIN"],
    [{ ...stagingEnvironment, REACT_APP_BOT_USERNAME: "quartzplay_bot" }, "REACT_APP_BOT_USERNAME"],
    [{ ...stagingEnvironment, APP_ENV: "production" }, "REACT_APP_API_URL"],
  ])("rejects unsafe staging destinations without exposing values", (environment, variableName) => {
    expectRejectedWithoutValue(environment, variableName);
  });

  test.each([
    [{ ...productionEnvironment, APP_ENV: "development" }, "APP_ENV"],
    [{ ...productionEnvironment, REACT_APP_API_URL: "https://api.staging.quartzplay.example" }, "REACT_APP_API_URL"],
    [{ ...productionEnvironment, REACT_APP_API_URL: "http://api.iaqp.lat" }, "REACT_APP_API_URL"],
    [{ ...productionEnvironment, REACT_APP_CASINO_HOSTS: "casino.staging.iaqp.example" }, "REACT_APP_CASINO_HOSTS"],
    [{ ...productionEnvironment, REACT_APP_BOT_USERNAME: "quartzplay_staging_bot" }, "REACT_APP_BOT_USERNAME"],
  ])("rejects unsafe production destinations without exposing values", (environment, variableName) => {
    expectRejectedWithoutValue(environment, variableName);
  });

  test("keeps first-party production destinations out of frontend sources", () => {
    const sourceDirectory = path.resolve(__dirname);
    const sourceFiles = ["App.jsx", "Web.jsx", "Agencia.jsx", "Admin.jsx", "Box.jsx", "Casino.jsx", "index.js"];
    const productionDestinations = [
      "api.iaqp.lat",
      "api-casino.iaqp.lat",
      "juego.iaqp.lat",
      "valiant-gentleness-production-a779.up.railway.app",
      "t.me/quartzplay_bot",
      "@quartzplay_bot",
      "@Quartzplay_bot",
      "iaqp.lat ·",
      'host === "iaqp.lat"',
    ];

    const sources = sourceFiles.map((file) => fs.readFileSync(path.join(sourceDirectory, file), "utf8")).join("\n");

    productionDestinations.forEach((destination) => {
      expect(sources).not.toContain(destination);
    });
  });

  test("startup preflight rejects production destinations without printing them", () => {
    const unsafeApiUrl = "https://api.iaqp.lat";
    const result = runPreflight({ ...stagingEnvironment, REACT_APP_API_URL: unsafeApiUrl });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("REACT_APP_API_URL");
    expect(result.stderr).not.toContain(unsafeApiUrl);
  });

  test.each([
    [{ REACT_APP_API_URL: "https://api.iaqp.lat." }, "REACT_APP_API_URL"],
    [{ REACT_APP_CASINO_HOSTS: "iaqp.lat." }, "REACT_APP_CASINO_HOSTS"],
    [{ APP_ENV: "production" }, "APP_ENV"],
    [{ REACT_APP_ENV: "production" }, "REACT_APP_ENV"],
  ])("startup preflight rejects unsafe normalized values", (override, variableName) => {
    const result = runPreflight({ ...stagingEnvironment, ...override });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(variableName);
  });

  test("startup preflight accepts a coherent production environment", () => {
    const result = runPreflight(productionEnvironment);

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("Frontend environment validation passed.");
  });

  test("startup preflight rejects mismatched environments naming APP_ENV", () => {
    const result = runPreflight({ ...productionEnvironment, REACT_APP_ENV: "staging" });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("APP_ENV");
  });
});
