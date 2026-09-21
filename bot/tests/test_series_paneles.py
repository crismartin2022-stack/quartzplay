import asyncio
import importlib
from datetime import date

import httpx
import pytest

from test_runtime_config import settings


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


async def _get(app, path, headers=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.get(path, headers=headers or {})


def get(app, path, headers=None):
    return asyncio.run(_get(app, path, headers=headers))


# ── Fake DB, just enough to answer the queries /serie issues ──────────

class _Acquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *args):
        return False


class FakePool:
    def __init__(self, conn):
        self.conn = conn

    def acquire(self):
        return _Acquire(self.conn)


class FakeConn:
    """Routes each query by its shape, the same way the endpoint issues
    them: one lookup for the agency, one for its 'rama' (or the global
    non-influencer list), one grouped-by-day aggregate per metric."""

    def __init__(self, agencias_por_code=None, rama_por_code=None,
                 codes_global=None, filas_por_metrica=None):
        self.agencias_por_code = agencias_por_code or {}
        self.rama_por_code = rama_por_code or {}
        self.codes_global = codes_global if codes_global is not None else []
        self.filas_por_metrica = filas_por_metrica or {}
        self.fetch_calls = []

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT * FROM agencias WHERE code=$1"):
            row = self.agencias_por_code.get(args[0])
            return dict(row) if row else None
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def fetch(self, query, *args):
        q = " ".join(query.split())
        self.fetch_calls.append((q, args))
        if "COALESCE(tipo,'agencia') <> 'influencer'" in q and "ruta LIKE" not in q:
            return [{"code": c} for c in self.codes_global]
        if "WHERE (code=$1 OR ruta LIKE $2)" in q:
            return [{"code": c} for c in self.rama_por_code.get(args[0], [])]
        if "FROM betslips b" in q and "COUNT(*)" in q:
            return self.filas_por_metrica.get("tickets", [])
        if "FROM betslips b" in q:
            return self.filas_por_metrica.get("apostado", [])
        if "pago_premio" in q:
            return self.filas_por_metrica.get("premios", [])
        if "FROM agencia_movimientos" in q:
            return self.filas_por_metrica.get("neto_caja", [])
        raise AssertionError(f"fetch inesperado: {q}")


def use_fake_pool(api, monkeypatch, conn):
    async def fake_get_db():
        return FakePool(conn)
    monkeypatch.setattr(api, "get_db", fake_get_db)


def admin_headers(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    return {"X-Admin-Key": "test-admin-key"}


def agencia_headers(api, code="AG1"):
    token = api.auth.create_session(code)
    return {"Authorization": f"Bearer {token}"}


# ── requirement 1: every day appears, zeros included ───────────────────

def test_admin_serie_fills_missing_days_with_zero(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(
        codes_global=["AG1", "AG2"],
        filas_por_metrica={"apostado": [{"dia": date(2026, 9, 2), "valor": 500.0}]},
    )
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/admin/serie?metrica=apostado&desde=2026-09-01&hasta=2026-09-03",
            headers=headers)

    assert r.status_code == 200
    puntos = r.json()["puntos"]
    assert [p["fecha"] for p in puntos] == ["2026-09-01", "2026-09-02", "2026-09-03"]
    assert [p["valor"] for p in puntos] == [0.0, 500.0, 0.0]


def test_a_series_with_no_rows_at_all_is_still_a_zero_line(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(codes_global=["AG1"], filas_por_metrica={})
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/admin/serie?metrica=tickets&desde=2026-09-01&hasta=2026-09-02",
            headers=headers)

    assert r.status_code == 200
    assert [p["valor"] for p in r.json()["puntos"]] == [0.0, 0.0]


# ── requirement 3: the range is bounded ────────────────────────────────

def test_a_range_longer_than_400_days_is_rejected(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(codes_global=["AG1"])
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/admin/serie?metrica=tickets&desde=2025-01-01&hasta=2026-06-01",
            headers=headers)

    assert r.status_code == 400
    assert "400" in r.json()["detail"] or "ximo" in r.json()["detail"]


# ── invalid metrica is a clear 4xx, not a 500 ──────────────────────────

def test_an_unknown_metrica_is_rejected_with_400(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(codes_global=["AG1"])
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/admin/serie?metrica=ganancia_neta&desde=2026-09-01&hasta=2026-09-02",
            headers=headers)

    assert r.status_code == 400


def test_missing_dates_are_rejected_with_400(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(codes_global=["AG1"])
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/admin/serie?metrica=tickets", headers=headers)

    assert r.status_code == 400


# ── auth: each endpoint uses its own dependency ────────────────────────

def test_admin_serie_requires_the_admin_key(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    r = get(api.app, "/api/admin/serie?metrica=tickets&desde=2026-09-01&hasta=2026-09-02")
    assert r.status_code == 401


def test_agencia_serie_requires_a_session(api):
    r = get(api.app, "/api/agencias/me/serie?metrica=tickets&desde=2026-09-01&hasta=2026-09-02")
    assert r.status_code == 401


# ── requirement 4: the agency endpoint is scoped to its own branch ─────

def test_agencia_serie_scopes_by_the_caller_branch_only(api, monkeypatch):
    headers = agencia_headers(api, code="AG1")
    conn = FakeConn(
        agencias_por_code={"AG1": {"code": "AG1", "ruta": "AG1"}},
        rama_por_code={"AG1": ["AG1", "AG1-SUB"]},
        filas_por_metrica={"neto_caja": [{"dia": date(2026, 9, 1), "valor": 100.0}]},
    )
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/agencias/me/serie?metrica=neto_caja&desde=2026-09-01&hasta=2026-09-01",
            headers=headers)

    assert r.status_code == 200
    # It asked the branch of the AUTHENTICATED code, never a code the
    # caller could have passed in the querystring — there is no such
    # parameter on this route, and the rama lookup was keyed off AG1.
    rama_calls = [c for c in conn.fetch_calls if "ruta LIKE" in c[0]]
    assert len(rama_calls) == 1
    assert rama_calls[0][1] == ("AG1", "AG1/%")

    # And the per-day aggregate was scoped to that branch's codes.
    agg_calls = [c for c in conn.fetch_calls if "agencia_movimientos" in c[0]]
    assert agg_calls[0][1][0] == ["AG1", "AG1-SUB"]


def test_agencia_serie_404s_when_the_authenticated_code_has_no_agencia_row(api, monkeypatch):
    headers = agencia_headers(api, code="GHOST")
    conn = FakeConn(agencias_por_code={})
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app, "/api/agencias/me/serie?metrica=tickets&desde=2026-09-01&hasta=2026-09-01",
            headers=headers)

    assert r.status_code == 404


# ── admin 'agencia' filter reuses the same branch rule ─────────────────

def test_admin_serie_with_agencia_filter_scopes_to_that_branch(api, monkeypatch):
    headers = admin_headers(api, monkeypatch)
    conn = FakeConn(
        agencias_por_code={"AG1": {"code": "AG1", "ruta": "AG1"}},
        rama_por_code={"AG1": ["AG1", "AG1-SUB"]},
        filas_por_metrica={"premios": []},
    )
    use_fake_pool(api, monkeypatch, conn)

    r = get(api.app,
            "/api/admin/serie?metrica=premios&desde=2026-09-01&hasta=2026-09-01&agencia=ag1",
            headers=headers)

    assert r.status_code == 200
    agg_calls = [c for c in conn.fetch_calls if "pago_premio" in c[0]]
    assert agg_calls[0][1][0] == ["AG1", "AG1-SUB"]
