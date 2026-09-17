"""Behavior tests: user-facing links are built from environment settings."""

import asyncio
import importlib

from test_runtime_config import settings


def test_start_button_opens_the_configured_staging_app_public_url(monkeypatch):
    for key, value in settings("staging").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_poller_runtime_settings.cache_clear()
    import bot_handlers

    assert bot_handlers._web_app_url() == "https://app.staging.example.test"


def test_combo_link_uses_the_configured_staging_bot_username(monkeypatch):
    for key, value in settings("staging").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_poller_runtime_settings.cache_clear()
    import admin_handlers

    assert admin_handlers._combo_link("promo") == "https://t.me/quartzplaystagingbot?start=combo_promo"


def test_agencia_message_uses_the_configured_staging_app_public_url(monkeypatch):
    for key, value in settings("staging").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_poller_runtime_settings.cache_clear()
    import admin_handlers

    assert admin_handlers._agencia_url_message() == "URL: https://app.staging.example.test/agencia"


def test_referral_link_web_uses_the_configured_staging_app_public_url(monkeypatch):
    for key, value in settings("staging").items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))

    result = asyncio.run(api.influencer_link("promo"))

    assert result["link_web"] == "https://app.staging.example.test?ref=promo"
