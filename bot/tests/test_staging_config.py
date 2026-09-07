import asyncio
import importlib

import pytest

from config import ConfigError, cors_headers, parse_staging_settings


VALID = {
    "APP_ENV": "staging",
    "DATABASE_URL": "postgresql://user:pass@staging-db.example.test:5432/quartzplay",
    "ALLOWED_ORIGINS": "https://staging.example.test,http://localhost:3000",
    "TELEGRAM_TOKEN": "123456:staging-token-value",
    "TELEGRAM_BOT_USER": "QuartzPlayStagingBot",
    "ADMIN_IDS": "1001,1002",
    "PRODUCTION_DATABASE_HOSTS": "prod-db.example.test",
    "PRODUCTION_ORIGIN_HOSTS": "www.quartzplay.example",
    "PRODUCTION_TELEGRAM_BOT_IDS": "987654",
    "PRODUCTION_TELEGRAM_USERNAMES": "QuartzPlayBot",
    "PRODUCTION_ADMIN_IDS": "42",
}


def settings(**changes):
    return {**VALID, **changes}


def test_parses_canonical_disjoint_staging_settings():
    result = parse_staging_settings(settings(
        DATABASE_URL="postgres://user:pass@STAGING-DB.EXAMPLE.TEST./quartzplay",
        ALLOWED_ORIGINS="https://STAGING.EXAMPLE.TEST:443,http://localhost:3000",
        TELEGRAM_BOT_USER="@quartzplaystagingbot",
    ))

    assert result.database_host == "staging-db.example.test"
    assert result.allowed_origins == ("https://staging.example.test", "http://localhost:3000")
    assert result.telegram.username == "quartzplaystagingbot"
    assert result.telegram.admin_ids == (1001, 1002)


@pytest.mark.parametrize("field,value,code", [
    ("APP_ENV", "production", "app_env.invalid"),
    ("DATABASE_URL", "https://staging.example.test", "database_url.invalid"),
    ("DATABASE_URL", "postgresql://user:pass@prod-db.example.test@staging-db.example.test/quartzplay", "database_url.invalid"),
    ("ALLOWED_ORIGINS", "https://staging.example.test/path", "allowed_origins.invalid"),
    ("TELEGRAM_TOKEN", "invalid", "telegram_token.invalid"),
    ("TELEGRAM_BOT_USER", "QuartzPlay", "telegram_username.invalid"),
    ("ADMIN_IDS", "1001,1001", "admin_ids.duplicate"),
])
def test_rejects_malformed_staging_values(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_staging_settings(settings(**{field: value}))


@pytest.mark.parametrize("field,value,code", [
    ("DATABASE_URL", "postgresql://user:pass@PROD-DB.EXAMPLE.TEST./quartzplay", "database_host.production"),
    ("ALLOWED_ORIGINS", "https://www.quartzplay.example", "origin_host.production"),
    ("TELEGRAM_TOKEN", "987654:staging-token-value", "telegram_bot_id.production"),
    ("TELEGRAM_BOT_USER", "QuartzPlayBot", "telegram_username.production"),
    ("ADMIN_IDS", "42", "admin_ids.production"),
])
def test_rejects_production_identity_or_destination(field, value, code):
    with pytest.raises(ConfigError, match=code):
        parse_staging_settings(settings(**{field: value}))


@pytest.mark.parametrize("origin", [
    "https://*.staging.example.test",
    "https://iaqp.lat",
    "https://api.iaqp.lat",
    "https://api-casino.iaqp.lat",
    "https://www.iaqp.lat",
    "https://juego.iaqp.lat",
    "https://valiant-gentleness-production-a779.up.railway.app",
    "https://amusing-vision-production.up.railway.app",
])
def test_rejects_wildcard_and_repository_known_production_origins(origin):
    with pytest.raises(ConfigError, match="allowed_origins.invalid|origin_host.production"):
        parse_staging_settings(settings(ALLOWED_ORIGINS=origin))


def test_errors_never_disclose_secret_values():
    sentinel = "token-secret-must-not-leak"

    with pytest.raises(ConfigError) as error:
        parse_staging_settings(settings(TELEGRAM_TOKEN=f"123456:{sentinel}!"))

    assert sentinel not in str(error.value)
    assert "telegram_token.invalid" == str(error.value)


def test_cors_headers_only_allow_canonical_configured_origins():
    result = parse_staging_settings(settings())

    assert cors_headers(result, "https://STAGING.EXAMPLE.TEST:443") == {
        "Access-Control-Allow-Origin": "https://staging.example.test",
        "Vary": "Origin",
    }
    assert cors_headers(result, "https://untrusted.example.test") == {}


def test_api_middleware_and_manual_handlers_share_canonical_cors_policy(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_staging_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))

    middleware = next(item for item in api.app.user_middleware
                      if item.cls.__name__ == "CORSMiddleware")
    assert middleware.kwargs["allow_origins"] == api.SETTINGS.allowed_origins

    allowed = {"origin": "https://STAGING.EXAMPLE.TEST:443"}
    blocked = {"origin": "https://untrusted.example.test"}
    allowed_response = asyncio.run(api.error_http(_request(allowed), api.HTTPException(403, "blocked")))
    blocked_response = asyncio.run(api.error_http(_request(blocked), api.HTTPException(403, "blocked")))

    assert allowed_response.headers["access-control-allow-origin"] == "https://staging.example.test"
    assert "access-control-allow-origin" not in blocked_response.headers


def test_invalid_cors_config_blocks_api_construction(monkeypatch):
    for key, value in settings(ALLOWED_ORIGINS="https://*.staging.example.test").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_staging_settings.cache_clear()

    with pytest.raises(ConfigError, match="allowed_origins.invalid"):
        importlib.reload(importlib.import_module("casino_api"))


def test_manual_logo_response_does_not_bypass_cors_middleware(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_staging_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))

    assert "access-control-allow-origin" not in api._resp_generico().headers


def _request(headers):
    from starlette.requests import Request

    return Request({"type": "http", "method": "GET", "path": "/",
                    "headers": [(key.encode(), value.encode()) for key, value in headers.items()]})
