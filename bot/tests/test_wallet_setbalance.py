"""El giro de slots descuenta el saldo con un UPDATE atómico, a propósito:
la transacción medía 82ms por giro contra 10ms de una consulta suelta. Esa
decisión tiene un costo, y es lo que cubren estas pruebas: lo que pasa
DESPUÉS del descuento no puede quedar a medias, porque el saldo ya se fue.
"""

import asyncio
import hashlib
import hmac
import importlib
import json
import time

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


def _normalize(query):
    return " ".join(query.split())


class RecordingConnection:
    """Base falsa mínima para el camino del giro."""

    def __init__(self, saldo=50000, romper_insert=False):
        self.saldo = saldo
        self.romper_insert = romper_insert
        self.calls = []

    async def fetchval(self, query, *args):
        self.calls.append(("fetchval", _normalize(query), args))
        return None  # la transacción no está repetida

    async def fetchrow(self, query, *args):
        q = _normalize(query)
        self.calls.append(("fetchrow", q, args))
        if q.startswith("UPDATE users SET balance = balance + $2"):
            if self.saldo < args[2]:
                return None
            self.saldo += args[1]
            return {"id": 7, "balance": self.saldo,
                    "moneda": "ARS", "creado_por": "AG-01"}
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def execute(self, query, *args):
        q = _normalize(query)
        self.calls.append(("execute", q, args))
        if q.startswith("INSERT INTO casino_rounds"):
            if self.romper_insert:
                raise RuntimeError("la base cortó la conexión")
            return
        if q.startswith("UPDATE users SET balance = balance - $2"):
            self.saldo -= args[1]
            return
        raise AssertionError(f"execute inesperado: {q}")

    def ejecutadas(self, prefijo):
        return [c for c in self.calls
                if c[0] == "execute" and c[1].startswith(prefijo)]


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


async def _post_firmado(api, cuerpo):
    body = json.dumps(cuerpo)
    x_code, x_time = "casino", str(int(time.time()))
    firma = hmac.new(
        api.SECRET_KEY.encode(),
        f"{body}X-Code={x_code}&X-Time={x_time}".encode(),
        hashlib.sha1).hexdigest()
    transport = httpx.ASGITransport(app=api.app, raise_app_exceptions=False)
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        return await client.post(
            "/api/wallet/setBalance",
            headers={"X-Code": x_code, "X-Time": x_time, "X-Sign": firma,
                     "Content-Type": "application/json"},
            content=body)


def post_giro(api, **extra):
    cuerpo = {"method": "setBalance", "player": "juan", "amount": "-100",
              "bet": "100", "win": "0", "transaction": "tx-1",
              "currency": "ARS"}
    cuerpo.update(extra)
    return asyncio.run(_post_firmado(api, cuerpo))


def test_un_giro_sin_sesion_conocida_se_acredita_igual(api, monkeypatch):
    """Sin sid, la agencia se toma de la fila del jugador. Antes se leía una
    variable que en esta rama no existe, y el giro moría con el saldo ya
    descontado."""
    conn = RecordingConnection(saldo=50000)
    use_fake_pool(api, monkeypatch, conn)

    respuesta = post_giro(api)

    assert respuesta.status_code == 200
    assert json.loads(respuesta.content)["status"] is True
    assert conn.saldo == 40000
    insertado = conn.ejecutadas("INSERT INTO casino_rounds")
    assert len(insertado) == 1
    assert insertado[0][2][8] == "AG-01"  # agencia_code del jugador


def test_si_falla_el_registro_de_la_jugada_se_devuelve_el_saldo(api, monkeypatch):
    """El descuento no está en una transacción, así que nadie lo revierte
    solo: si lo que viene después falla, hay que devolverlo a mano."""
    conn = RecordingConnection(saldo=50000, romper_insert=True)
    use_fake_pool(api, monkeypatch, conn)

    respuesta = post_giro(api)

    assert json.loads(respuesta.content)["status"] is False
    assert conn.saldo == 50000, "el jugador se quedó sin la apuesta"
