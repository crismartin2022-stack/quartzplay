"""Fail-closed configuration boundary for runtime entry points."""

from dataclasses import dataclass
from functools import lru_cache
import ipaddress
import os
import re
from typing import Mapping
from urllib.parse import urlparse


class ConfigError(ValueError):
    """Stable configuration error code that never includes input values."""


@dataclass(frozen=True)
class TelegramIdentity:
    token: str
    bot_id: int
    username: str
    admin_ids: tuple[int, ...]


@dataclass(frozen=True)
class RuntimeSettings:
    app_env: str
    database_url: str
    database_host: str
    allowed_origins: tuple[str, ...]
    api_public_url: str
    telegram: TelegramIdentity
    readiness_timeout_ms: int
    psp_webhook_secret: str | None
    app_public_url: str


@dataclass(frozen=True)
class PollerRuntimeSettings:
    app_env: str
    database_url: str
    database_host: str
    telegram: TelegramIdentity
    app_public_url: str


@dataclass(frozen=True)
class PollerSettings:
    enabled: bool
    worker_id: str | None


TOKEN = re.compile(r"([1-9][0-9]*):[A-Za-z0-9_-]{10,}")
USERNAME = re.compile(r"[a-z][a-z0-9_]{4,31}bot")


def _error(code: str):
    raise ConfigError(code)


def _required(values: Mapping[str, str], key: str) -> str:
    value = values.get(key, "").strip()
    if not value:
        _error(f"{key.lower()}.missing")
    return value


def _host(value: str, code: str) -> str:
    value = value.rstrip(".").lower()
    if not value or "@" in value or "*" in value or any(char.isspace() for char in value):
        _error(code)
    try:
        return str(ipaddress.ip_address(value))
    except ValueError:
        try:
            return value.encode("idna").decode("ascii")
        except UnicodeError:
            _error(code)


def _csv(values: Mapping[str, str], key: str) -> tuple[str, ...]:
    raw = _required(values, key)
    items = tuple(item.strip() for item in raw.split(","))
    if not all(items):
        _error(f"{key.lower()}.invalid")
    return items


def _hosts(values: Mapping[str, str], key: str) -> frozenset[str]:
    return frozenset(_host(item, f"{key.lower()}.invalid") for item in _csv(values, key))


def _database(value: str) -> tuple[str, str]:
    try:
        parsed = urlparse(value)
        if (parsed.netloc.count("@") != 1 or parsed.scheme not in {"postgres", "postgresql"}
                or not parsed.username or not parsed.password or not parsed.hostname
                or not parsed.path or parsed.path == "/" or parsed.fragment):
            _error("database_url.invalid")
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            _error("database_url.invalid")
    except (ValueError, AttributeError):
        _error("database_url.invalid")
    return value, _host(parsed.hostname, "database_url.invalid")


def _origin(value: str, code: str) -> str:
    try:
        parsed = urlparse(value)
        if (parsed.scheme not in {"http", "https"} or not parsed.hostname
                or parsed.username or parsed.password or parsed.path not in {"", "/"}
                or parsed.query or parsed.fragment):
            _error(code)
        host = _host(parsed.hostname, code)
        port = parsed.port
    except (ValueError, AttributeError):
        _error(code)
    if port in {80, 443} and ((parsed.scheme == "http" and port == 80)
                              or (parsed.scheme == "https" and port == 443)):
        port = None
    return f"{parsed.scheme.lower()}://{host}{f':{port}' if port else ''}"


def _ids(values: Mapping[str, str], key: str) -> tuple[int, ...]:
    items = _csv(values, key)
    try:
        result = tuple(int(item) for item in items)
    except ValueError:
        _error(f"{key.lower()}.invalid")
    if any(item <= 0 for item in result):
        _error(f"{key.lower()}.invalid")
    if len(set(result)) != len(result):
        _error(f"{key.lower()}.duplicate")
    return result


def _usernames(values: Mapping[str, str], key: str) -> frozenset[str]:
    usernames = frozenset(item.removeprefix("@").lower() for item in _csv(values, key))
    if not all(USERNAME.fullmatch(username) for username in usernames):
        _error(f"{key.lower()}.invalid")
    return usernames


def _readiness_timeout(values: Mapping[str, str]) -> int:
    raw = values.get("READINESS_TIMEOUT_MS", "2000").strip()
    try:
        timeout = int(raw)
    except ValueError:
        _error("readiness_timeout.invalid")
    if not 100 <= timeout <= 2000:
        _error("readiness_timeout.invalid")
    return timeout


def _psp_webhook_secret(values: Mapping[str, str]) -> str | None:
    raw = values.get("PSP_WEBHOOK_SECRET", "").strip()
    if not raw:
        return None
    if len(raw) < 32:
        _error("psp_webhook_secret.invalid")
    return raw


def _environment(values: Mapping[str, str]) -> str:
    app_env = values.get("APP_ENV", "")
    if app_env not in {"production", "staging"}:
        _error("app_env.invalid")
    return app_env


PRODUCTION_APP_HOSTS = frozenset({
    "iaqp.lat",
    "www.iaqp.lat",
    "juego.iaqp.lat",
    "valiant-gentleness-production-a779.up.railway.app",
})


def _app_public_url(values: Mapping[str, str], app_env: str) -> str:
    if app_env == "production":
        raw = values.get("APP_URL", "").strip()
        if not raw:
            return "https://juego.iaqp.lat"
        app_url = _origin(raw, "app_url.invalid")
        if urlparse(app_url).scheme != "https":
            _error("app_url.https_required")
        return app_url

    app_url = _origin(_required(values, "APP_URL"), "app_url.invalid")
    if urlparse(app_url).hostname in PRODUCTION_APP_HOSTS:
        _error("app_url.environment")
    return app_url


def _require_disjoint(production: frozenset[object], staging: frozenset[object], code: str):
    if production & staging:
        _error(code)


def parse_poller_runtime_settings(values: Mapping[str, str]) -> PollerRuntimeSettings:
    app_env = _environment(values)
    database_url, database_host = _database(_required(values, "DATABASE_URL"))
    token = _required(values, "TELEGRAM_TOKEN")
    match = TOKEN.fullmatch(token)
    if not match:
        _error("telegram_token.invalid")
    username = _required(values, "TELEGRAM_BOT_USER").removeprefix("@").lower()
    if not USERNAME.fullmatch(username):
        _error("telegram_username.invalid")
    runtime_admin_ids = _ids(values, "ADMIN_IDS")
    app_public_url = _app_public_url(values, app_env)

    if app_env == "production":
        return PollerRuntimeSettings(
            app_env, database_url, database_host,
            TelegramIdentity(token, int(match.group(1)), username, runtime_admin_ids),
            app_public_url,
        )

    production_database_hosts = _hosts(values, "PRODUCTION_DATABASE_HOSTS")
    staging_database_hosts = _hosts(values, "STAGING_DATABASE_HOSTS")
    production_bot_ids = frozenset(_ids(values, "PRODUCTION_TELEGRAM_BOT_IDS"))
    staging_bot_ids = frozenset(_ids(values, "STAGING_TELEGRAM_BOT_IDS"))
    production_usernames = _usernames(values, "PRODUCTION_TELEGRAM_USERNAMES")
    staging_usernames = _usernames(values, "STAGING_TELEGRAM_USERNAMES")
    production_admin_ids = frozenset(_ids(values, "PRODUCTION_ADMIN_IDS"))
    staging_admin_ids = frozenset(_ids(values, "STAGING_ADMIN_IDS"))

    _require_disjoint(production_database_hosts, staging_database_hosts, "database_hosts.overlap")
    _require_disjoint(production_bot_ids, staging_bot_ids, "telegram_bot_ids.overlap")
    _require_disjoint(production_usernames, staging_usernames, "telegram_usernames.overlap")
    _require_disjoint(production_admin_ids, staging_admin_ids, "admin_ids.overlap")

    if database_host not in staging_database_hosts:
        _error("database_host.environment")
    if int(match.group(1)) not in staging_bot_ids:
        _error("telegram_bot_id.environment")
    if username not in staging_usernames:
        _error("telegram_username.environment")
    if frozenset(runtime_admin_ids) != staging_admin_ids:
        _error("admin_ids.environment")
    return PollerRuntimeSettings(
        app_env, database_url, database_host,
        TelegramIdentity(token, int(match.group(1)), username, runtime_admin_ids),
        app_public_url,
    )


def parse_runtime_settings(values: Mapping[str, str]) -> RuntimeSettings:
    poller = parse_poller_runtime_settings(values)
    origins = tuple(_origin(item, "allowed_origins.invalid") for item in _csv(values, "ALLOWED_ORIGINS"))
    if len(set(origins)) != len(origins):
        _error("allowed_origins.duplicate")
    if poller.app_env == "production" and any(urlparse(origin).scheme != "https" for origin in origins):
        _error("allowed_origins.https_required")
    api_public_url = _origin(_required(values, "API_PUBLIC_URL"), "api_public_url.invalid")
    if poller.app_env == "production" and urlparse(api_public_url).scheme != "https":
        _error("api_public_url.https_required")

    if poller.app_env == "staging":
        production_origin_hosts = _hosts(values, "PRODUCTION_ORIGIN_HOSTS")
        staging_origin_hosts = _hosts(values, "STAGING_ORIGIN_HOSTS")
        _require_disjoint(production_origin_hosts, staging_origin_hosts, "origin_hosts.overlap")
        if any(urlparse(origin).hostname not in staging_origin_hosts for origin in origins):
            _error("origin_host.environment")
        if urlparse(api_public_url).hostname not in staging_origin_hosts:
            _error("api_public_url.environment")
    return RuntimeSettings(
        poller.app_env, poller.database_url, poller.database_host, origins, api_public_url,
        poller.telegram,
        _readiness_timeout(values),
        _psp_webhook_secret(values),
        poller.app_public_url,
    )


def cors_headers(settings: RuntimeSettings, origin: str) -> dict[str, str]:
    try:
        canonical_origin = _origin(origin, "allowed_origins.invalid")
    except ConfigError:
        return {}
    if canonical_origin not in settings.allowed_origins:
        return {}
    return {"Access-Control-Allow-Origin": canonical_origin, "Vary": "Origin"}


def poller_settings(values: Mapping[str, str]) -> PollerSettings:
    enabled = values.get("POLLING_ENABLED", "").strip().lower()
    if enabled in {"", "false"}:
        return PollerSettings(False, None)
    if enabled != "true":
        _error("polling_enabled.invalid")
    worker_id = values.get("WORKER_ID", "").strip()
    if not worker_id:
        _error("worker_id.missing")
    if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]{2,63}", worker_id):
        _error("worker_id.invalid")
    return PollerSettings(True, worker_id)


@lru_cache(maxsize=1)
def get_runtime_settings() -> RuntimeSettings:
    return parse_runtime_settings(os.environ)


@lru_cache(maxsize=1)
def get_poller_runtime_settings() -> PollerRuntimeSettings:
    return parse_poller_runtime_settings(os.environ)
