const PRODUCTION_HOSTS = new Set([
  "api.iaqp.lat",
  "api-casino.iaqp.lat",
  "iaqp.lat",
  "www.iaqp.lat",
  "juego.iaqp.lat",
  "valiant-gentleness-production-a779.up.railway.app",
]);

const ENVIRONMENTS = new Set(["staging", "production"]);
const PRODUCTION_BOT_USERNAME = "quartzplay_bot";

function normalizeHostname(hostname) {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function resolveEnvironment(value) {
  const environment = value?.trim();
  return ENVIRONMENTS.has(environment) ? environment : null;
}

function isStagingEnvironment(environment) {
  return resolveEnvironment(environment.APP_ENV) === "staging";
}

function hostMatchesEnvironment(hostname, environment) {
  const isProductionHost = PRODUCTION_HOSTS.has(hostname);
  return environment === "production" ? isProductionHost : !isProductionHost;
}

function parseDestinationUrl(value, environment) {
  if (!value?.trim() || !resolveEnvironment(environment)) return null;

  try {
    const parsed = new URL(value.trim());
    const hostname = normalizeHostname(parsed.hostname);
    if (
      parsed.protocol !== "https:" ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !hostname ||
      !hostMatchesEnvironment(hostname, environment)
    ) {
      return null;
    }
    return `https://${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return null;
  }
}

function parseStagingUrl(value) {
  return parseDestinationUrl(value, "staging");
}

function parseCasinoHosts(rawHosts, environment = "staging") {
  if (!rawHosts?.trim() || !resolveEnvironment(environment)) return null;

  const hosts = rawHosts.split(",").map(normalizeHostname).filter(Boolean);
  if (
    !hosts.length ||
    hosts.some((host) => !/^[a-z0-9.-]+$/.test(host) || !hostMatchesEnvironment(host, environment))
  ) {
    return null;
  }
  return [...new Set(hosts)];
}

function parseBotUsername(value, environment = "staging") {
  const username = value?.trim().replace(/^@/, "");
  if (!username || !/^[a-zA-Z0-9_]{5,}$/.test(username) || !resolveEnvironment(environment)) {
    return null;
  }
  const isProductionBot = username.toLowerCase() === PRODUCTION_BOT_USERNAME;
  return (environment === "production") === isProductionBot ? username : null;
}

module.exports = {
  isStagingEnvironment,
  normalizeHostname,
  parseBotUsername,
  parseCasinoHosts,
  parseDestinationUrl,
  parseStagingUrl,
  resolveEnvironment,
};
