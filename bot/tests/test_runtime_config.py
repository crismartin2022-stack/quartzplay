import asyncio
import importlib

import pytest

from config import ConfigError, cors_headers, parse_runtime_settings


PRODUCTION = {
    "APP_ENV": "production",
    "DATABASE_URL": "postgresql://user:pass@prod-db.example.test:5432/quartzplay?sslmode=require",
    "ALLOWED_ORIGINS": "https://app.prod.example.test",
    "API_PUBLIC_URL": "https://api.prod.example.test",
    "TELEGRAM_TOKEN": "123456:production-token-value",
    "TELEGRAM_BOT_USER": "QuartzPlayBot",
    "ADMIN_IDS": "1001,1002",
    "PRODUCTION_DATABASE_HOSTS": "prod-db.example.test",
    "STAGING_DATABASE_HOSTS": "staging-db.example.test",
    "PRODUCTION_ORIGIN_HOSTS": "app.prod.example.test,api.prod.example.test",
    "STAGING_ORIGIN_HOSTS": "app.staging.example.test,api.staging.example.test",
    "PRODUCTION_TELEGRAM_BOT_IDS": "123456",
    "STAGING_TELEGRAM_BOT_IDS": "987654",
    "PRODUCTION_TELEGRAM_USERNAMES": "QuartzPlayBot",
    "STAGING_TELEGRAM_USERNAMES": "QuartzPlayStagingBot",
    "PRODUCTION_ADMIN_IDS": "1001,1002",
    "STAGING_ADMIN_IDS": "2001,2002",
}


def settings(environment="production", **changes):
    values = dict(PRODUCTION)
    if environment == "staging":
        values.update({
            "APP_ENV": "staging",
            "DATABASE_URL": "postgresql://user:pass@staging-db.example.test:5432/quartzplay?sslmode=require",
            "ALLOWED_ORIGINS": "https://app.staging.example.test",
            "API_PUBLIC_URL": "https://api.staging.example.test",
            "TELEGRAM_TOKEN": "987654:staging-token-value",
            "TELEGRAM_BOT_USER": "QuartzPlayStagingBot",
            "ADMIN_IDS": "2001,2002",
        })
    values.update(changes)
    return values


def legacy_production_settings(**changes):
    values = settings(**changes)
    for key in tuple(values):
        if key.startswith(("PRODUCTION_", "STAGING_")):
            del values[key]
    return values


@pytest.mark.parametrize("environment", ["production", "staging"])
def test_parses_safe_runtime_settings_for_each_environment(environment):
    result = parse_runtime_settings(settings(environment))

    assert result.app_env == environment
    assert result.database_url == settings(environment)["DATABASE_URL"]
    hostname = "prod" if environment == "production" else "staging"
    assert result.api_public_url == f"https://api.{hostname}.example.test"
    assert result.allowed_origins == (f"https://app.{hostname}.example.test",)


def test_preserves_tls_database_query_exactly():
    database_url = "postgresql://user:pass@prod-db.example.test/quartzplay?sslmode=verify-full&application_name=quartzplay"

    result = parse_runtime_settings(settings(DATABASE_URL=database_url))

    assert result.database_url == database_url


def test_production_starts_with_active_runtime_configuration_without_staging_isolation():
    result = parse_runtime_settings(legacy_production_settings())

    assert result.app_env == "production"
    assert result.database_url == PRODUCTION["DATABASE_URL"]
    assert result.api_public_url == PRODUCTION["API_PUBLIC_URL"]


@pytest.mark.parametrize("field,value,code", [
    ("APP_ENV", "Production", "app_env.invalid"),
    ("APP_ENV", " staging", "app_env.invalid"),
])
def test_requires_exact_runtime_environment(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_runtime_settings(settings(**{field: value}))


@pytest.mark.parametrize("field,value,code", [
    ("PRODUCTION_DATABASE_HOSTS", "staging-db.example.test", "database_hosts.overlap"),
    ("PRODUCTION_ORIGIN_HOSTS", "app.staging.example.test", "origin_hosts.overlap"),
    ("PRODUCTION_TELEGRAM_BOT_IDS", "987654", "telegram_bot_ids.overlap"),
    ("PRODUCTION_TELEGRAM_USERNAMES", "QuartzPlayStagingBot", "telegram_usernames.overlap"),
    ("PRODUCTION_ADMIN_IDS", "2001", "admin_ids.overlap"),
])
def test_rejects_overlapping_cross_environment_allowlists(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_runtime_settings(settings("staging", **{field: value}))


@pytest.mark.parametrize("field,value,code", [
    ("API_PUBLIC_URL", "", "api_public_url.missing"),
    ("API_PUBLIC_URL", "https://api.prod.example.test/path", "api_public_url.invalid"),
    ("TELEGRAM_TOKEN", "invalid", "telegram_token.invalid"),
    ("ADMIN_IDS", "1001,1001", "admin_ids.duplicate"),
])
def test_fails_closed_for_invalid_runtime_values(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_runtime_settings(settings(**{field: value}))


def test_cors_uses_canonical_configured_origin():
    result = parse_runtime_settings(settings(ALLOWED_ORIGINS="https://APP.PROD.EXAMPLE.TEST:443"))

    assert cors_headers(result, "https://app.prod.example.test") == {
        "Access-Control-Allow-Origin": "https://app.prod.example.test",
        "Vary": "Origin",
    }


def test_cors_rejects_an_unconfigured_host():
    result = parse_runtime_settings(settings())

    assert cors_headers(result, "https://untrusted.prod.example.test") == {}


@pytest.mark.parametrize("field,value,code", [
    ("ALLOWED_ORIGINS", "http://app.prod.example.test", "allowed_origins.https_required"),
    ("API_PUBLIC_URL", "http://api.prod.example.test", "api_public_url.https_required"),
])
def test_production_rejects_http_api_origins_and_callbacks(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_runtime_settings(settings(**{field: value}))


def test_staging_keeps_explicit_local_http_origin_support():
    result = parse_runtime_settings(settings(
        "staging",
        ALLOWED_ORIGINS="http://localhost:3000",
        STAGING_ORIGIN_HOSTS="app.staging.example.test,api.staging.example.test,localhost",
    ))

    assert result.allowed_origins == ("http://localhost:3000",)


@pytest.mark.parametrize("field,code", [
    ("PRODUCTION_DATABASE_HOSTS", "production_database_hosts.missing"),
    ("STAGING_DATABASE_HOSTS", "staging_database_hosts.missing"),
    ("PRODUCTION_TELEGRAM_BOT_IDS", "production_telegram_bot_ids.missing"),
    ("STAGING_TELEGRAM_BOT_IDS", "staging_telegram_bot_ids.missing"),
    ("PRODUCTION_TELEGRAM_USERNAMES", "production_telegram_usernames.missing"),
    ("STAGING_TELEGRAM_USERNAMES", "staging_telegram_usernames.missing"),
    ("PRODUCTION_ADMIN_IDS", "production_admin_ids.missing"),
    ("STAGING_ADMIN_IDS", "staging_admin_ids.missing"),
    ("PRODUCTION_ORIGIN_HOSTS", "production_origin_hosts.missing"),
    ("STAGING_ORIGIN_HOSTS", "staging_origin_hosts.missing"),
])
def test_staging_requires_explicit_isolation_configuration(field, code):
    values = settings("staging")
    del values[field]

    with pytest.raises(ConfigError, match=code):
        parse_runtime_settings(values)


def test_api_import_fails_when_runtime_configuration_is_invalid(monkeypatch):
    for key, value in settings(API_PUBLIC_URL="").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()

    with pytest.raises(ConfigError, match="api_public_url.missing"):
        importlib.reload(importlib.import_module("casino_api"))


def test_api_uses_runtime_settings_for_cors_and_public_url(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))

    middleware = next(item for item in api.app.user_middleware if item.cls.__name__ == "CORSMiddleware")
    assert middleware.kwargs["allow_origins"] == api.SETTINGS.allowed_origins
    assert api.API_PUBLIC_URL == api.SETTINGS.api_public_url

    response = asyncio.run(api.error_http(
        _request({"origin": "https://APP.PROD.EXAMPLE.TEST:443"}),
        api.HTTPException(403, "blocked"),
    ))
    assert response.headers["access-control-allow-origin"] == "https://app.prod.example.test"


def _request(headers):
    from starlette.requests import Request

    return Request({"type": "http", "method": "GET", "path": "/",
                    "headers": [(key.encode(), value.encode()) for key, value in headers.items()]})
