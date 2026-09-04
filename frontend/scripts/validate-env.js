const {
  isStagingEnvironment,
  parseBotUsername,
  parseCasinoHosts,
  parseStagingUrl,
} = require("../src/environmentValidation");

const requiredVariables = [
  "APP_ENV",
  "REACT_APP_ENV",
  "REACT_APP_API_URL",
  "REACT_APP_IAQP_URL",
  "REACT_APP_APP_ORIGIN",
  "REACT_APP_CASINO_HOSTS",
  "REACT_APP_BOT_USERNAME",
];

function fail(variableName) {
  console.error(`Invalid frontend environment variable: ${variableName}`);
  process.exitCode = 1;
}

requiredVariables.forEach((variableName) => {
  if (!process.env[variableName]?.trim()) fail(variableName);
});

["REACT_APP_API_URL", "REACT_APP_IAQP_URL", "REACT_APP_APP_ORIGIN"].forEach((variableName) => {
  if (!parseStagingUrl(process.env[variableName])) fail(variableName);
});

if (!isStagingEnvironment(process.env)) fail("APP_ENV");
if (!isStagingEnvironment({ APP_ENV: process.env.REACT_APP_ENV })) fail("REACT_APP_ENV");
if (!parseCasinoHosts(process.env.REACT_APP_CASINO_HOSTS)) fail("REACT_APP_CASINO_HOSTS");
if (!parseBotUsername(process.env.REACT_APP_BOT_USERNAME)) fail("REACT_APP_BOT_USERNAME");

if (!process.exitCode) {
  console.log("Frontend environment validation passed.");
}
