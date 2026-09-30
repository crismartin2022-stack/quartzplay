"""Giros gratis de Atomic (`gameActions.do`).

El riesgo de fondo: `freespins_set` REEMPLAZA. Un `set` mal armado pisa los
giros vivos de un jugador, y un resultado desconocido reintentado a ciegas
también.
"""

import asyncio
import importlib
import json

import httpx
import pytest

import registro_proveedores as rp
from test_runtime_config import settings
from test_wallet_setbalance import use_fake_pool
from test_atomic_lanzamiento import proveedor, servidor_falso
from test_mensajeria_admin import admin_headers, req


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


class Conn:
    def __init__(self, jugador=True, marca="pragmaticplay"):
        self.jugador, self.marca = jugador, marca

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT id, moneda FROM users"):
            return {"id": args[0], "moneda": "ARS"} if self.jugador else None
        if q.startswith("SELECT marca FROM casino_juegos"):
            return {"marca": self.marca} if self.marca is not None else None
        raise AssertionError(q)


def llamar(api, monkeypatch, cuerpo, manejador, conn=None, admin=True):
    use_fake_pool(api, monkeypatch, conn or Conn())

    async def prov(codigo):
        return proveedor()
    monkeypatch.setattr(api, "_proveedor", prov)
    llamadas = servidor_falso(api, monkeypatch, manejador)
    headers = admin_headers(api, monkeypatch) if admin else {}
    r = req(api.app, "POST", "/api/admin/casino/atomic/giros-gratis",
            headers=headers, json_body=cuerpo)
    return r, llamadas


BASE = {"user_id": 42, "symbol": "vs20olympgate"}


def test_set_manda_el_monto_como_texto_decimal_y_el_id_interno(api, monkeypatch):
    """Riesgo: el monto por giro va en centavos internos; Atomic espera un
    decimal en texto. 50 centavos tienen que llegar como '0.50'."""
    r, llamadas = llamar(api, monkeypatch,
                         {**BASE, "accion": "set", "cantidad": 10,
                          "monto_centavos": 50},
                         lambda q: httpx.Response(200, json={"status": "ok"}))

    enviado = json.loads(llamadas[0].content)
    assert str(llamadas[0].url) == "https://atomic.example/api/gameActions.do"
    assert enviado == {"method": "freespins_set", "partner": "PARTNER-1",
                       "api_key": "CLAVE-SECRETA", "provider": "pragmaticplay",
                       "symbol": "vs20olympgate", "currency": "ARS",
                       "player_id": "42", "count": 10, "amount": "0.50"}
    assert r.json()["ok"] is True


@pytest.mark.parametrize("accion,metodo", [("get", "freespins_get"),
                                           ("delete", "freespins_delete")])
def test_get_y_delete_no_mandan_cantidad_ni_monto(api, monkeypatch, accion, metodo):
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": accion},
                         lambda q: httpx.Response(200, json={"status": "ok"}))

    enviado = json.loads(llamadas[0].content)
    assert enviado["method"] == metodo
    assert "count" not in enviado and "amount" not in enviado


@pytest.mark.parametrize("extra", [
    {"cantidad": 0, "monto_centavos": 50},
    {"cantidad": 5, "monto_centavos": 0},
    {"cantidad": -1, "monto_centavos": 50},
    {"cantidad": "x", "monto_centavos": 50},
    {"monto_centavos": 50},
])
def test_un_set_ambiguo_no_llega_a_atomic(api, monkeypatch, extra):
    """Riesgo: un `set` en cero borra sin decirlo. Para quitar está delete."""
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": "set", **extra},
                         lambda q: httpx.Response(200, json={"status": "ok"}))

    assert r.status_code == 400 and llamadas == []


def test_una_accion_desconocida_se_rechaza(api, monkeypatch):
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": "add"},
                         lambda q: httpx.Response(200, json={"status": "ok"}))

    assert r.status_code == 400 and llamadas == []


def test_un_resultado_desconocido_se_avisa_para_no_reintentar_a_ciegas(api, monkeypatch):
    """Riesgo: un 503 pudo haber aplicado el reemplazo igual."""
    r, _ = llamar(api, monkeypatch, {**BASE, "accion": "set", "cantidad": 3,
                                     "monto_centavos": 10},
                  lambda q: httpx.Response(503, text="caído"))

    assert r.status_code == 200
    assert r.json()["ok"] is False and r.json()["desconocido"] is True


def test_un_rechazo_definitivo_no_es_desconocido(api, monkeypatch):
    r, _ = llamar(api, monkeypatch, {**BASE, "accion": "get"},
                  lambda q: httpx.Response(
                      200, json={"status": "error", "message": "PLAYER_NOT_FOUND"}))

    assert r.json() == {"ok": False, "desconocido": False,
                        "mensaje": "PLAYER_NOT_FOUND",
                        "datos": {"status": "error", "message": "PLAYER_NOT_FOUND"}}


def test_un_juego_fuera_del_catalogo_no_se_adivina(api, monkeypatch):
    """Riesgo: el panel mandaba 'pragmatic' fijo para cualquier juego."""
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": "get"},
                         lambda q: httpx.Response(200, json={"status": "ok"}),
                         conn=Conn(marca=None))

    assert r.status_code == 404 and llamadas == []


def test_un_jugador_inexistente_es_404(api, monkeypatch):
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": "get"},
                         lambda q: httpx.Response(200, json={"status": "ok"}),
                         conn=Conn(jugador=False))

    assert r.status_code == 404 and llamadas == []


def test_solo_el_admin_puede_regalar_giros(api, monkeypatch):
    r, llamadas = llamar(api, monkeypatch, {**BASE, "accion": "get"},
                         lambda q: httpx.Response(200, json={"status": "ok"}),
                         admin=False)

    assert r.status_code in (401, 503) and llamadas == []


def test_la_clave_nunca_llega_al_log(api, monkeypatch, caplog):
    with caplog.at_level("DEBUG"):
        llamar(api, monkeypatch, {**BASE, "accion": "get"},
               lambda q: httpx.Response(500, text="boom"))

    assert "CLAVE-SECRETA" not in caplog.text
