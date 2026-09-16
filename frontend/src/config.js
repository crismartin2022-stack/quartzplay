import {
  parseBotUsername,
  parseCasinoHosts,
  parseDestinationUrl,
  resolveEnvironment,
} from "./environmentValidation";

const REQUIRED_DESTINATIONS = [
  "APP_ENV",
  "REACT_APP_API_URL",
  "REACT_APP_IAQP_URL",
  "REACT_APP_APP_ORIGIN",
  "REACT_APP_CASINO_HOSTS",
  "REACT_APP_BOT_USERNAME",
];

function configurationError(variableName) {
  return new Error(`Invalid frontend environment variable: ${variableName}`);
}

export function resolveFrontendConfig(environment) {
  REQUIRED_DESTINATIONS.forEach((variableName) => {
    if (!environment[variableName]?.trim()) {
      throw configurationError(variableName);
    }
  });

  const appEnvironment = resolveEnvironment(environment.APP_ENV);
  if (!appEnvironment) {
    throw configurationError("APP_ENV");
  }

  const apiUrl = parseDestinationUrl(environment.REACT_APP_API_URL, appEnvironment);
  const iaqpUrl = parseDestinationUrl(environment.REACT_APP_IAQP_URL, appEnvironment);
  const appOrigin = parseDestinationUrl(environment.REACT_APP_APP_ORIGIN, appEnvironment);
  const casinoHosts = parseCasinoHosts(environment.REACT_APP_CASINO_HOSTS, appEnvironment);
  const botUsername = parseBotUsername(environment.REACT_APP_BOT_USERNAME, appEnvironment);

  if (!apiUrl) throw configurationError("REACT_APP_API_URL");
  if (!iaqpUrl) throw configurationError("REACT_APP_IAQP_URL");
  if (!appOrigin) throw configurationError("REACT_APP_APP_ORIGIN");
  if (!casinoHosts) throw configurationError("REACT_APP_CASINO_HOSTS");
  if (!botUsername) throw configurationError("REACT_APP_BOT_USERNAME");

  return {
    apiUrl,
    iaqpUrl,
    appOrigin,
    casinoHosts,
    botUsername,
  };
}

export function getFrontendConfig(environment = process.env) {
  return resolveFrontendConfig({
    ...environment,
    APP_ENV: environment.REACT_APP_ENV,
  });
}
