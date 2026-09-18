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


def forbid_db(api, monkeypatch):
    async def forbidden():
        raise AssertionError("dependency called")
    monkeypatch.setattr(api, "get_db", forbidden)


# ── In-memory fake pool/connection for /api/apuesta ───────────────

def _normalize(query):
    return " ".join(query.split())


class _Txn:
    async def __aenter__(self):
        return None

    async def __aexit__(self, exc_type, exc, tb):
        return False


class RecordingConnection:
    def __init__(self, users):
        self.users = [dict(u) for u in users]
        self.calls = []

    def transaction(self):
        return _Txn()

    def _by_tg_id(self, tg_id):
        for u in self.users:
            if str(u.get("telegram_id")) == tg_id or str(u["id"]) == tg_id:
                return u
        return None

    def _by_id(self, user_id):
        return next(u for u in self.users if u["id"] == user_id)

    async def fetchrow(self, query, *args):
        q = _normalize(query)
        self.calls.append(("fetchrow", q, args))
        if q.startswith(
            "SELECT id, balance, saldo_bono, moneda, creado_por, bloqueado FROM users"
        ):
            u = self._by_tg_id(args[0])
            return dict(u) if u else None
        if "FOR UPDATE" in q:
            col = "balance" if "balance AS disp" in q else "saldo_bono"
            u = self._by_id(args[0])
            return {"disp": u[col]}
        if q.startswith("SELECT balance, saldo_bono FROM users WHERE id=$1"):
            u = self._by_id(args[0])
            return {"balance": u["balance"], "saldo_bono": u["saldo_bono"]}
        raise AssertionError(f"unexpected fetchrow: {q}")

    async def execute(self, query, *args):
        q = _normalize(query)
        self.calls.append(("execute", q, args))
        if q.startswith("UPDATE users SET balance = balance - $2"):
            self._by_id(args[0])["balance"] -= args[1]
        elif q.startswith("UPDATE users SET saldo_bono = saldo_bono - $2"):
            self._by_id(args[0])["saldo_bono"] -= args[1]
        elif q.startswith("INSERT INTO betslips"):
            pass
        elif q.startswith("INSERT INTO sports_bets"):
            pass
        else:
            raise AssertionError(f"unexpected execute: {q}")

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


def stub_apuesta_side_effects(api, monkeypatch):
    """Stubs every business-logic helper the bet path touches that is
    unrelated to identity resolution, so these tests exercise only who
    the bet is placed for -- not limits, boost, risk or rollover, which
    keep their own coverage elsewhere and must stay untouched here."""

    async def no_problemas(_picks):
        return []

    async def limite_abierto(_conn, _agencia_code):
        return {"monto_min": None, "monto_max": None, "pago_max": None}

    async def boost_apagado(_conn):
        return {}

    async def nada_bloqueado(_conn, _picks, agencia_code=None, es_live=False):
        return []

    async def riesgo_ok(_conn, _picks, _potential_win, moneda=None):
        return True, ""

    async def rollover_noop(_conn, _user_id, _monto_apostado, cuota=None):
        return None

    async def exposicion_noop(_conn, _code, _picks, _potential_win):
        return None

    async def huella_noop(_conn, _code, _request, **_kwargs):
        return None

    monkeypatch.setattr(api, "validar_cuotas", no_problemas)
    monkeypatch.setattr(api, "_limite_efectivo", limite_abierto)
    monkeypatch.setattr(api, "_boost_config", boost_apagado)
    monkeypatch.setattr(api, "_picks_bloqueados", nada_bloqueado)
    monkeypatch.setattr(api, "_controlar_riesgo", riesgo_ok)
    monkeypatch.setattr(api, "_procesar_rollover", rollover_noop)
    monkeypatch.setattr(api, "_registrar_exposicion", exposicion_noop)
    monkeypatch.setattr(api, "_sellar_huella", huella_noop)


PICK = {"home": "Team A", "away": "Team B", "sel": "Team A",
        "sport": "Football", "odd": 1.5}

TELEGRAM_USER = {"id": 501, "telegram_id": 999111, "balance": 100000,
                  "saldo_bono": 0, "moneda": "ARS", "creado_por": None,
                  "bloqueado": False}
WEB_USER = {"id": 777, "telegram_id": None, "balance": 200000,
            "saldo_bono": 0, "moneda": "ARS", "creado_por": None,
            "bloqueado": False}


def telegram_identity(monkeypatch, api, valid_init_data="tg-init", tg_id=999111):
    def fake_validar_init_data(raw):
        return {"id": tg_id} if raw == valid_init_data else None
    monkeypatch.setattr(api, "validar_init_data", fake_validar_init_data)


def no_telegram_identity(monkeypatch, api):
    monkeypatch.setattr(api, "validar_init_data", lambda _raw: None)


def sessions(monkeypatch, api, table):
    async def fake_sesion_buscar(token):
        return table.get(token)
    monkeypatch.setattr(api, "sesion_buscar", fake_sesion_buscar)


# ── Unit tests: jugador_de_sesion never raises, resolves cliente: only ──

def test_jugador_de_sesion_returns_the_player_id_for_a_valid_client_token(api, monkeypatch):
    sessions(monkeypatch, api, {"web-token": "cliente:777"})

    result = asyncio.run(api.jugador_de_sesion("Bearer web-token"))

    assert result == 777


def test_jugador_de_sesion_returns_none_for_an_agency_session_token(api, monkeypatch):
    sessions(monkeypatch, api, {"agency-token": "AG1"})

    assert asyncio.run(api.jugador_de_sesion("Bearer agency-token")) is None


def test_jugador_de_sesion_returns_none_for_an_unknown_token(api, monkeypatch):
    sessions(monkeypatch, api, {})

    assert asyncio.run(api.jugador_de_sesion("Bearer unknown")) is None


def test_jugador_de_sesion_never_raises_for_a_missing_or_malformed_header(api, monkeypatch):
    async def unreachable(_token):
        raise AssertionError("sesion_buscar should not be called")
    monkeypatch.setattr(api, "sesion_buscar", unreachable)

    assert asyncio.run(api.jugador_de_sesion(None)) is None
    assert asyncio.run(api.jugador_de_sesion("")) is None
    assert asyncio.run(api.jugador_de_sesion("Basic abc")) is None
    assert asyncio.run(api.jugador_de_sesion("Bearer")) is None
    assert asyncio.run(api.jugador_de_sesion("Bearer ")) is None


# ── Identity resolution table at the /api/apuesta endpoint ────────────

def test_bet_with_telegram_identity_only_is_placed_for_that_player(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {})
    conn = RecordingConnection([TELEGRAM_USER])
    use_fake_pool(api, monkeypatch, conn)

    response = post(api.app, "/api/apuesta",
                     json_body={"init_data": "tg-init", "modo": "reservada",
                                "picks": [PICK]})

    assert response.status_code == 200
    inserted = conn.calls_matching("INSERT INTO betslips")
    assert len(inserted) == 1
    assert inserted[0][2][1] == TELEGRAM_USER["id"]


def test_bet_with_web_session_only_is_placed_for_the_session_player(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {"web-token": "cliente:777"})
    conn = RecordingConnection([WEB_USER])
    use_fake_pool(api, monkeypatch, conn)

    response = post(api.app, "/api/apuesta",
                     headers={"Authorization": "Bearer web-token"},
                     json_body={"modo": "reservada", "picks": [PICK]})

    assert response.status_code == 200
    inserted = conn.calls_matching("INSERT INTO betslips")
    assert len(inserted) == 1
    assert inserted[0][2][1] == WEB_USER["id"]


def test_bet_with_both_identities_present_prefers_telegram(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {"web-token": "cliente:777"})
    conn = RecordingConnection([TELEGRAM_USER, WEB_USER])
    use_fake_pool(api, monkeypatch, conn)

    response = post(api.app, "/api/apuesta",
                     headers={"Authorization": "Bearer web-token"},
                     json_body={"init_data": "tg-init", "modo": "reservada",
                                "picks": [PICK]})

    assert response.status_code == 200
    inserted = conn.calls_matching("INSERT INTO betslips")
    assert len(inserted) == 1
    assert inserted[0][2][1] == TELEGRAM_USER["id"]


def test_agency_session_token_is_refused_without_touching_the_db(api, monkeypatch):
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {"agency-token": "AG1"})
    forbid_db(api, monkeypatch)

    response = post(api.app, "/api/apuesta",
                     headers={"Authorization": "Bearer agency-token"},
                     json_body={"modo": "reservada", "picks": [PICK]})

    assert response.status_code == 401


def test_unknown_token_is_refused_without_touching_the_db(api, monkeypatch):
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {})
    forbid_db(api, monkeypatch)

    response = post(api.app, "/api/apuesta",
                     headers={"Authorization": "Bearer unknown"},
                     json_body={"modo": "reservada", "picks": [PICK]})

    assert response.status_code == 401


def test_missing_authorization_header_is_refused_without_touching_the_db(api, monkeypatch):
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {})
    forbid_db(api, monkeypatch)

    response = post(api.app, "/api/apuesta",
                     json_body={"modo": "reservada", "picks": [PICK]})

    assert response.status_code == 401


# ── 401 reason contract: stable, machine-readable, no player leakage ──

def test_401_answers_carry_the_login_required_reason_and_no_player_information(api, monkeypatch):
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {"agency-token": "AG1"})
    forbid_db(api, monkeypatch)

    missing_header = post(api.app, "/api/apuesta",
                           json_body={"modo": "reservada", "picks": [PICK]})
    unknown_token = post(api.app, "/api/apuesta",
                          headers={"Authorization": "Bearer unknown"},
                          json_body={"modo": "reservada", "picks": [PICK]})
    agency_token = post(api.app, "/api/apuesta",
                         headers={"Authorization": "Bearer agency-token"},
                         json_body={"modo": "reservada", "picks": [PICK]})

    for response in (missing_header, unknown_token, agency_token):
        assert response.status_code == 401
        detail = response.json()["detail"]
        assert detail == {"reason": "login_required",
                           "message": "Iniciá sesión para apostar"}


# ── Same rules for both channels: a web session debits its own balance ──

def test_web_session_bet_debits_only_that_sessions_player_balance(api, monkeypatch):
    stub_apuesta_side_effects(api, monkeypatch)
    no_telegram_identity(monkeypatch, api)
    sessions(monkeypatch, api, {"web-token": "cliente:777"})
    bystander = {**WEB_USER, "id": 888, "balance": 20000}
    conn = RecordingConnection([WEB_USER, bystander])
    use_fake_pool(api, monkeypatch, conn)

    response = post(api.app, "/api/apuesta",
                     headers={"Authorization": "Bearer web-token"},
                     json_body={"modo": "saldo", "stake": 1000, "picks": [PICK]})

    assert response.status_code == 200
    assert conn._by_id(WEB_USER["id"])["balance"] == WEB_USER["balance"] - 1000 * 100
    assert conn._by_id(bystander["id"])["balance"] == bystander["balance"]
