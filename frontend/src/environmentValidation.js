const PRODUCTION_HOSTS = new Set([
  "api.iaqp.lat",
  "api-casino.iaqp.lat",
  "iaqp.lat",
  "www.iaqp.lat",
  "valiant-gentleness-production-a779.up.railway.app",
]);

function normalizeHostname(hostname) {
  return hostname.trim().toLowerCase().replace(/\.+$/, "");
}

function isStagingEnvironment(environment) {
  return environment.APP_ENV?.trim() === "staging";
}

function parseStagingUrl(value) {
  if (!value?.trim()) return null;

  try {
    const parsed = new URL(value.trim());
    const hostname = normalizeHostname(parsed.hostname);
    if (
      parsed.protocol !== "https:" ||
      parsed.pathname !== "/" ||
      parsed.search ||
      parsed.hash ||
      !hostname ||
      PRODUCTION_HOSTS.has(hostname)
    ) {
      return null;
    }
    return `https://${hostname}${parsed.port ? `:${parsed.port}` : ""}`;
  } catch {
    return null;
  }
}

function parseCasinoHosts(rawHosts) {
  if (!rawHosts?.trim()) return null;

  const hosts = rawHosts.split(",").map(normalizeHostname).filter(Boolean);
  if (!hosts.length || hosts.some((host) => !/^[a-z0-9.-]+$/.test(host) || PRODUCTION_HOSTS.has(host))) {
    return null;
  }
  return [...new Set(hosts)];
}

function parseBotUsername(value) {
  const username = value?.trim().replace(/^@/, "");
  if (!username || !/^[a-zA-Z0-9_]{5,}$/.test(username) || username.toLowerCase() === "quartzplay_bot") {
    return null;
  }
  return username;
}

module.exports = {
  isStagingEnvironment,
  normalizeHostname,
  parseBotUsername,
  parseCasinoHosts,
  parseStagingUrl,
};
