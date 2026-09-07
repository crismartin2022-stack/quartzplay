import asyncio
from dataclasses import replace
import importlib
import json
import time

import httpx
import pytest

from test_staging_config import settings


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_staging_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def response_body(response):
    return json.loads(response.body)


async def request(app, path):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.get(path)


def test_livez_route_is_process_only_and_repeatable_over_asgi(api, monkeypatch):
    async def forbidden():
        raise AssertionError("dependency called")

    monkeypatch.setattr(api, "get_db", forbidden)

    first = asyncio.run(request(api.app, "/livez"))
    second = asyncio.run(request(api.app, "/livez"))

    assert first.status_code == 200
    assert first.json() == {"status": "live"}
    assert second.status_code == 200
    assert second.json() == {"status": "live"}


def test_readyz_route_uses_api_pool_probe_over_asgi(api, monkeypatch):
    used = []

    async def pool():
        return "api-pool"

    async def probe(value):
        used.append(value)

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)

    response = asyncio.run(request(api.app, "/readyz"))

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}
    assert used == ["api-pool"]


def test_readyz_route_times_out_at_minimum_budget_over_asgi(api, monkeypatch):
    async def pool():
        return object()

    async def probe(_pool):
        await asyncio.sleep(1)

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)
    monkeypatch.setattr(api, "SETTINGS", replace(api.SETTINGS, readiness_timeout_ms=100))

    started = time.monotonic()
    response = asyncio.run(request(api.app, "/readyz"))
    elapsed = time.monotonic() - started

    assert response.status_code == 503
    assert response.json() == {"status": "not_ready", "reason": "timeout"}
    assert 0.09 <= elapsed <= 0.5


@pytest.mark.parametrize("poller_state", ["disabled", "unavailable"])
def test_readyz_route_ignores_poller_state_over_asgi(api, monkeypatch, poller_state):
    async def pool():
        return object()

    async def probe(_pool):
        return None

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)
    monkeypatch.setattr(api, "poller_state", poller_state, raising=False)

    response = asyncio.run(request(api.app, "/readyz"))

    assert response.status_code == 200
    assert response.json() == {"status": "ready"}


def test_livez_is_process_only_and_repeatable(api, monkeypatch):
    async def forbidden():
        raise AssertionError("dependency called")

    monkeypatch.setattr(api, "get_db", forbidden)

    assert asyncio.run(api.livez()) == {"status": "live"}
    assert asyncio.run(api.livez()) == {"status": "live"}


@pytest.mark.parametrize("failure,reason", [
    ("database", "database_unavailable"),
    ("schema", "schema_unavailable"),
])
def test_readyz_maps_typed_probe_failures_without_leaking_details(api, monkeypatch, failure, reason):
    async def pool():
        return object()

    async def probe(_pool):
        error = api.DatabaseUnavailable if failure == "database" else api.SchemaUnavailable
        raise error("postgresql://user:secret@db.example.test/private")

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)

    response = asyncio.run(api.readyz())

    assert response.status_code == 503
    assert response_body(response) == {"status": "not_ready", "reason": reason}


def test_readyz_succeeds_after_api_pool_read_only_probe(api, monkeypatch):
    used = []

    async def pool():
        return "api-pool"

    async def probe(value):
        used.append(value)

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)

    assert asyncio.run(api.readyz()) == {"status": "ready"}
    assert used == ["api-pool"]


def test_readyz_uses_one_deadline_and_hides_timeout_details(api, monkeypatch):
    async def pool():
        return object()

    async def probe(_pool):
        await asyncio.sleep(0.05)

    monkeypatch.setattr(api, "get_db", pool)
    monkeypatch.setattr(api, "probe_readiness", probe)
    monkeypatch.setattr(api, "SETTINGS", replace(api.SETTINGS, readiness_timeout_ms=1))

    response = asyncio.run(api.readyz())

    assert response.status_code == 503
    assert response_body(response) == {"status": "not_ready", "reason": "timeout"}


def test_probe_checks_only_connectivity_and_required_columns():
    from db import probe_readiness

    statements = []

    class Connection:
        async def fetchval(self, statement):
            statements.append(statement)
            return 1

        async def fetch(self, statement, tables):
            statements.append(statement)
            assert tables == ["users", "agencias"]
            return [
                {"table_name": "users", "column_name": "id"},
                {"table_name": "users", "column_name": "balance"},
                {"table_name": "agencias", "column_name": "code"},
                {"table_name": "agencias", "column_name": "status"},
            ]

    class Acquire:
        async def __aenter__(self):
            return Connection()

        async def __aexit__(self, *_args):
            return False

    class Pool:
        def acquire(self):
            return Acquire()

    asyncio.run(probe_readiness(Pool()))

    assert len(statements) == 2
    assert all(statement.lstrip().upper().startswith("SELECT") for statement in statements)


def test_probe_classifies_missing_schema_separately_from_connection_failure():
    from db import DatabaseUnavailable, SchemaUnavailable, probe_readiness

    class Connection:
        async def fetchval(self, _statement):
            return 1

        async def fetch(self, _statement, _tables):
            return []

    class Acquire:
        async def __aenter__(self):
            return Connection()

        async def __aexit__(self, *_args):
            return False

    class Pool:
        def acquire(self):
            return Acquire()

    with pytest.raises(SchemaUnavailable):
        asyncio.run(probe_readiness(Pool()))

    with pytest.raises(DatabaseUnavailable):
        asyncio.run(probe_readiness(object()))
