const {
  parseBotUsername,
  parseCasinoHosts,
  parseDestinationUrl,
  resolveEnvironment,
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

const appEnvironment = resolveEnvironment(process.env.APP_ENV);
const clientEnvironment = resolveEnvironment(process.env.REACT_APP_ENV);

if (!appEnvironment) fail("APP_ENV");
if (!clientEnvironment) fail("REACT_APP_ENV");
if (appEnvironment && clientEnvironment && appEnvironment !== clientEnvironment) {
  fail("APP_ENV");
  fail("REACT_APP_ENV");
}

const environment = appEnvironment && appEnvironment === clientEnvironment ? appEnvironment : null;

if (environment) {
  ["REACT_APP_API_URL", "REACT_APP_IAQP_URL", "REACT_APP_APP_ORIGIN"].forEach((variableName) => {
    if (!parseDestinationUrl(process.env[variableName], environment)) fail(variableName);
  });
  if (!parseCasinoHosts(process.env.REACT_APP_CASINO_HOSTS, environment)) fail("REACT_APP_CASINO_HOSTS");
  if (!parseBotUsername(process.env.REACT_APP_BOT_USERNAME, environment)) fail("REACT_APP_BOT_USERNAME");
}

if (!process.exitCode) {
  console.log("Frontend environment validation passed.");
}
