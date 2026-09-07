"""Fail-closed configuration boundary for staging runtime entry points."""

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
class StagingSettings:
    database_url: str
    database_host: str
    allowed_origins: tuple[str, ...]
    telegram: TelegramIdentity


KNOWN_PRODUCTION_HOSTS = frozenset({
    "iaqp.lat", "www.iaqp.lat", "api.iaqp.lat", "api-casino.iaqp.lat",
    "juego.iaqp.lat", "valiant-gentleness-production-a779.up.railway.app",
    "amusing-vision-production.up.railway.app",
})
KNOWN_PRODUCTION_USERNAMES = frozenset({"quartzplay_bot"})
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
        if parsed.netloc.count("@") != 1 or parsed.scheme not in {"postgres", "postgresql"} or not parsed.username or not parsed.password or not parsed.hostname or not parsed.path or parsed.path == "/" or parsed.query or parsed.fragment:
            _error("database_url.invalid")
        if parsed.port is not None and not 1 <= parsed.port <= 65535:
            _error("database_url.invalid")
    except (ValueError, AttributeError):
        _error("database_url.invalid")
    return value, _host(parsed.hostname, "database_url.invalid")


def _origin(value: str) -> str:
    try:
        parsed = urlparse(value)
        if parsed.scheme not in {"http", "https"} or not parsed.hostname or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
            _error("allowed_origins.invalid")
        host = _host(parsed.hostname, "allowed_origins.invalid")
        port = parsed.port
    except (ValueError, AttributeError):
        _error("allowed_origins.invalid")
    if port in {80, 443} and ((parsed.scheme == "http" and port == 80) or (parsed.scheme == "https" and port == 443)):
        port = None
    return f"{parsed.scheme.lower()}://{host}{f':{port}' if port else ''}"


def _ids(values: Mapping[str, str], key: str) -> tuple[int, ...]:
    try:
        result = tuple(int(item) for item in _csv(values, key))
    except ValueError:
        _error(f"{key.lower()}.invalid")
    if any(item <= 0 for item in result):
        _error(f"{key.lower()}.invalid")
    if len(set(result)) != len(result):
        _error(f"{key.lower()}.duplicate")
    return result


def parse_staging_settings(values: Mapping[str, str]) -> StagingSettings:
    if _required(values, "APP_ENV").lower() != "staging":
        _error("app_env.invalid")
    database_url, database_host = _database(_required(values, "DATABASE_URL"))
    origins = tuple(_origin(item) for item in _csv(values, "ALLOWED_ORIGINS"))
    if len(set(origins)) != len(origins):
        _error("allowed_origins.duplicate")
    production_hosts = KNOWN_PRODUCTION_HOSTS | _hosts(values, "PRODUCTION_DATABASE_HOSTS") | _hosts(values, "PRODUCTION_ORIGIN_HOSTS")
    if database_host in production_hosts:
        _error("database_host.production")
    if any(urlparse(origin).hostname in production_hosts for origin in origins):
        _error("origin_host.production")
    token = _required(values, "TELEGRAM_TOKEN")
    match = TOKEN.fullmatch(token)
    if not match:
        _error("telegram_token.invalid")
    username = _required(values, "TELEGRAM_BOT_USER").removeprefix("@").lower()
    if not USERNAME.fullmatch(username):
        _error("telegram_username.invalid")
    admin_ids = _ids(values, "ADMIN_IDS")
    production_bot_ids = _ids(values, "PRODUCTION_TELEGRAM_BOT_IDS")
    production_usernames = frozenset(item.removeprefix("@").lower() for item in _csv(values, "PRODUCTION_TELEGRAM_USERNAMES")) | KNOWN_PRODUCTION_USERNAMES
    production_admin_ids = _ids(values, "PRODUCTION_ADMIN_IDS")
    if int(match.group(1)) in production_bot_ids:
        _error("telegram_bot_id.production")
    if username in production_usernames:
        _error("telegram_username.production")
    if set(admin_ids) & set(production_admin_ids):
        _error("admin_ids.production")
    return StagingSettings(database_url, database_host, origins, TelegramIdentity(token, int(match.group(1)), username, admin_ids))


def cors_headers(settings: StagingSettings, origin: str) -> dict[str, str]:
    try:
        canonical_origin = _origin(origin)
    except ConfigError:
        return {}
    if canonical_origin not in settings.allowed_origins:
        return {}
    return {"Access-Control-Allow-Origin": canonical_origin, "Vary": "Origin"}


@lru_cache(maxsize=1)
def get_staging_settings() -> StagingSettings:
    return parse_staging_settings(os.environ)
