import ast
import asyncio
import importlib

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


async def _post(app, path, headers=None, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport, base_url="http://testserver") as client:
        return await client.post(path, headers=headers or {}, json=json_body or {})


def post(app, path, headers=None, json_body=None):
    return asyncio.run(_post(app, path, headers=headers, json_body=json_body))


# ── Fake DB plumbing, just enough to reach each INSERT and capture it ──

class _Txn:
    async def __aenter__(self):
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return False


class RecordingConnection:
    def __init__(self, users=None):
        self.users = [dict(u) for u in (users or [])]
        self.calls = []

    def transaction(self):
        return _Txn()

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        self.calls.append(("fetchrow", q, args))
        if q.startswith(
            "SELECT id, balance, saldo_bono, moneda, creado_por, bloqueado FROM users"
        ):
            for u in self.users:
                if str(u.get("telegram_id")) == args[0] or str(u["id"]) == args[0]:
                    return dict(u)
            return None
        return None

    async def fetchval(self, query, *args):
        self.calls.append(("fetchval", " ".join(query.split()), args))
        return None

    async def execute(self, query, *args):
        q = " ".join(query.split())
        self.calls.append(("execute", q, args))

    def calls_matching(self, prefix):
        return [c for c in self.calls if c[0] == "execute" and c[1].startswith(prefix)]


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


def use_fake_pool(api, monkeypatch, conn):
    async def fake_get_db():
        return FakePool(conn)
    monkeypatch.setattr(api, "get_db", fake_get_db)


def stub_betslip_side_effects(api, monkeypatch):
    """/api/betslip: stub every helper the handler runs before its INSERT,
    so the test exercises only what ends up stored."""

    async def no_problemas(_picks):
        return []

    async def sin_firma(_conn, _codigo=None, _combo_id=None, _agencia_juego=None):
        return None

    async def nada_bloqueado(_conn, _picks, agencia_code=None, es_live=False):
        return []

    async def huella_noop(_conn, _code, _request, **_kwargs):
        return None

    monkeypatch.setattr(api, "validar_cuotas", no_problemas)
    monkeypatch.setattr(api, "_resolver_influencer", sin_firma)
    monkeypatch.setattr(api, "_picks_bloqueados", nada_bloqueado)
    monkeypatch.setattr(api, "_sellar_huella", huella_noop)


def stub_apuesta_side_effects(api, monkeypatch):
    """/api/apuesta, modo=reservada: same idea, minimal helpers needed
    for that branch (no balance debit, no boost, no risk check)."""

    async def no_problemas(_picks):
        return []

    async def sin_firma(_conn, _codigo=None, _combo_id=None, _agencia_juego=None):
        return None

    async def huella_noop(_conn, _code, _request, **_kwargs):
        return None

    monkeypatch.setattr(api, "validar_cuotas", no_problemas)
    monkeypatch.setattr(api, "_resolver_influencer", sin_firma)
    monkeypatch.setattr(api, "_sellar_huella", huella_noop)


TELEGRAM_USER = {"id": 501, "telegram_id": 999111, "balance": 100000,
                  "saldo_bono": 0, "moneda": "ARS", "creado_por": None,
                  "bloqueado": False}


def telegram_identity(monkeypatch, api, valid_init_data="tg-init", tg_id=999111):
    def fake_validar_init_data(raw):
        return {"id": tg_id} if raw == valid_init_data else None
    monkeypatch.setattr(api, "validar_init_data", fake_validar_init_data)


def _stored_pick(conn, insert_prefix, picks_arg_index):
    inserted = conn.calls_matching(insert_prefix)
    assert len(inserted) == 1
    picks = ast.literal_eval(inserted[0][2][picks_arg_index])
    return picks[0]


# ── /api/betslip stores the market that came in the request ───────────

def test_betslip_stores_the_market_that_came_in_the_request(api, monkeypatch):
    stub_betslip_side_effects(api, monkeypatch)
    conn = RecordingConnection()
    use_fake_pool(api, monkeypatch, conn)

    pick = {"home": "Team A", "away": "Team B", "sel": "Team A",
            "sport": "Football", "odd": 1.5, "market": "BTTS"}
    response = post(api.app, "/api/betslip", json_body={"picks": [pick]})

    assert response.status_code == 200
    stored = _stored_pick(conn, "INSERT INTO betslips", 1)
    assert stored["market"] == "BTTS"


def test_betslip_pick_without_a_market_stores_none(api, monkeypatch):
    stub_betslip_side_effects(api, monkeypatch)
    conn = RecordingConnection()
    use_fake_pool(api, monkeypatch, conn)

    pick = {"home": "Team A", "away": "Team B", "sel": "Team A",
            "sport": "Football", "odd": 1.5}
    response = post(api.app, "/api/betslip", json_body={"picks": [pick]})

    assert response.status_code == 200
    stored = _stored_pick(conn, "INSERT INTO betslips", 1)
    assert stored["market"] is None


# ── /api/apuesta (modo=reservada) stores the market that came in ──────

def test_apuesta_stores_the_market_that_came_in_the_request(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    telegram_identity(monkeypatch, api)
    conn = RecordingConnection([TELEGRAM_USER])
    use_fake_pool(api, monkeypatch, conn)

    pick = {"home": "Team A", "away": "Team B", "sel": "Team A",
            "sport": "Football", "odd": 1.5, "market": "Over/Under"}
    response = post(api.app, "/api/apuesta",
                     json_body={"init_data": "tg-init", "modo": "reservada",
                                "picks": [pick]})

    assert response.status_code == 200
    stored = _stored_pick(conn, "INSERT INTO betslips", 2)
    assert stored["market"] == "Over/Under"


def test_apuesta_pick_without_a_market_stores_none(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    telegram_identity(monkeypatch, api)
    conn = RecordingConnection([TELEGRAM_USER])
    use_fake_pool(api, monkeypatch, conn)

    pick = {"home": "Team A", "away": "Team B", "sel": "Team A",
            "sport": "Football", "odd": 1.5}
    response = post(api.app, "/api/apuesta",
                     json_body={"init_data": "tg-init", "modo": "reservada",
                                "picks": [pick]})

    assert response.status_code == 200
    stored = _stored_pick(conn, "INSERT INTO betslips", 2)
    assert stored["market"] is None


# ── The reader that motivated this fix: a stored market is honored ────
#
# _registrar_exposicion reads market straight off the stored pick
# ("h2h" is only the fallback for a pick that truly has none). Before
# this fix no write path stored the field, so every exposure row fell
# back to "h2h" regardless of what was actually picked.

def test_registrar_exposicion_reads_the_stored_market_instead_of_the_fallback(api, monkeypatch):
    conn = RecordingConnection()

    pick = {"event_id": "ev1", "sport_key": "soccer_epl", "sel": "Team A",
            "market": "BTTS"}
    asyncio.run(api._registrar_exposicion(conn, "QP-12345", [pick], 1000))

    inserted = conn.calls_matching("INSERT INTO exposicion")
    assert len(inserted) == 1
    _code, _event_id, _sport_key, _seleccion, mercado, _monto = inserted[0][2]
    assert mercado == "BTTS"
