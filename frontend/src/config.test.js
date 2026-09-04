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

describe("frontend destination configuration", () => {
  test("uses CRA-exposed staging identity for browser configuration", () => {
    const browserEnvironment = { ...stagingEnvironment, APP_ENV: undefined };
    expect(getFrontendConfig(browserEnvironment)).toEqual(resolveFrontendConfig(stagingEnvironment));
    expect(() => getFrontendConfig({ ...browserEnvironment, REACT_APP_API_URL: "not-a-url" })).toThrow("REACT_APP_API_URL");
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

  test.each([
    [{ ...stagingEnvironment, REACT_APP_API_URL: "" }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_IAQP_URL: "not-a-url" }, "REACT_APP_IAQP_URL"],
    [{ ...stagingEnvironment, REACT_APP_APP_ORIGIN: "http://staging.quartzplay.example" }, "REACT_APP_APP_ORIGIN"],
    [{ ...stagingEnvironment, REACT_APP_API_URL: "https://api.iaqp.lat" }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_API_URL: "https://api.iaqp.lat." }, "REACT_APP_API_URL"],
    [{ ...stagingEnvironment, REACT_APP_CASINO_HOSTS: "iaqp.lat." }, "REACT_APP_CASINO_HOSTS"],
    [{ ...stagingEnvironment, APP_ENV: "production" }, "APP_ENV"],
  ])("rejects unsafe destinations without exposing values", (environment, variableName) => {
    expect(() => resolveFrontendConfig(environment)).toThrow(variableName);
    try {
      resolveFrontendConfig(environment);
    } catch (error) {
      if (environment[variableName]) {
        expect(error.message).not.toContain(environment[variableName]);
      }
    }
  });

  test("keeps first-party production destinations out of frontend sources", () => {
    const sourceDirectory = path.resolve(__dirname);
    const sourceFiles = ["App.jsx", "Web.jsx", "Agencia.jsx", "Admin.jsx", "Box.jsx", "Casino.jsx", "index.js"];
    const productionDestinations = [
      "api.iaqp.lat",
      "api-casino.iaqp.lat",
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
    const validatorPath = path.resolve(__dirname, "../scripts/validate-env.js");
    const unsafeApiUrl = "https://api.iaqp.lat";
    const result = spawnSync(process.execPath, [validatorPath], {
      env: { ...process.env, ...stagingEnvironment, REACT_APP_API_URL: unsafeApiUrl },
      encoding: "utf8",
    });

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
    const validatorPath = path.resolve(__dirname, "../scripts/validate-env.js");
    const result = spawnSync(process.execPath, [validatorPath], {
      env: { ...process.env, ...stagingEnvironment, ...override },
      encoding: "utf8",
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain(variableName);
  });
});
