"""Atomic, lo que hacemos nosotros: abrir un juego (`playGame.do`) y traer el
catálogo (`allgamelist`).

Los dos van contra un `httpx.MockTransport`: se verifica lo que MANDAMOS y
cómo se comporta el bot con lo que vuelve. No se habló con un Atomic real.
"""

import asyncio
import importlib
import json

import httpx
import pytest
from fastapi import HTTPException

import registro_proveedores as rp
from test_runtime_config import settings
from test_wallet_setbalance import FakePool, use_fake_pool

CLIENTE_REAL = httpx.AsyncClient  # antes de que un test lo reemplace


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def proveedor(**cambios):
    datos = dict(codigo="atomic", adaptador="atomic", activa=True,
                 url="https://atomic.example/api", api_code="PARTNER-1",
                 api_secret="CLAVE-SECRETA", monedas=("ARS",),
                 ips_permitidas=("203.0.113.0/24",), origen="base")
    datos.update(cambios)
    return rp.Proveedor(**datos)


def servidor_falso(api, monkeypatch, manejador):
    """Todo `httpx.AsyncClient(...)` que cree casino_api habla con `manejador`."""
    llamadas = []

    def atender(request):
        llamadas.append(request)
        return manejador(request)

    def fabrica(*args, **kwargs):
        kwargs["transport"] = httpx.MockTransport(atender)
        return CLIENTE_REAL(*args, **kwargs)

    monkeypatch.setattr(api.httpx, "AsyncClient", fabrica)
    return llamadas


# ── A1: lanzar un juego ────────────────────────────────────────

class ConexionLanzamiento:
    def __init__(self, juego, moneda="ARS", romper_sesion=False):
        self.juego = juego
        self.moneda = moneda
        self.romper_sesion = romper_sesion
        self.sesiones = []
        self.pedidos_de_juego = []

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT id, username, moneda, bloqueado, creado_por"):
            return {"id": 42, "username": "juanito", "moneda": self.moneda,
                    "bloqueado": False, "creado_por": "AG-01"}
        if q.startswith("SELECT j.*, i.url"):
            self.pedidos_de_juego.append(args)
            return self.juego
        if q.startswith("SELECT motivo FROM casino_proveedores"):
            return None
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def execute(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("INSERT INTO casino_sesiones"):
            if self.romper_sesion:
                raise RuntimeError("la base no responde")
            self.sesiones.append(args)
            return
        raise AssertionError(f"execute inesperado: {q}")


def juego_atomic(**cambios):
    fila = {"game_id": "vs20olympgate", "titulo": "Gates of Olympus",
            "marca": "pragmaticplay", "es_vivo": False, "integracion": "atomic",
            "url": "https://atomic.example/api", "api_code": "PARTNER-1",
            "api_secret": "CLAVE-SECRETA", "api_secret_cifrado": None,
            "monedas": "ARS", "adaptador": "atomic"}
    fila.update(cambios)
    return fila


def lanzar(api, monkeypatch, conn, respuesta, **cuerpo):
    use_fake_pool(api, monkeypatch, conn)

    async def productos(*_):
        return {"casino", "casino_vivo"}

    async def prov(codigo):
        return proveedor()

    monkeypatch.setattr(api, "_productos_de", productos)
    monkeypatch.setattr(api, "_proveedor", prov)
    llamadas = servidor_falso(api, monkeypatch, respuesta)

    class Req:
        async def json(self):
            return {"user_id": 42, "game_id": "vs20olympgate", **cuerpo}

    return llamadas, Req()


def ok_atomic(_):
    return httpx.Response(200, json={
        "status": "ok", "link": "https://juego.example/abrir?t=1",
        "meta": {"session_id": "SES-ATOMIC-9"}})


def test_lanzar_manda_el_id_interno_el_idioma_y_la_clave_en_el_cuerpo(api, monkeypatch):
    """Riesgos: el username en `player_id` (puede cambiar y deja rondas
    huérfanas), la falta de `lang` (el juego abre en ruso) y firmar un
    pedido que Atomic no firma."""
    conn = ConexionLanzamiento(juego_atomic())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_atomic)

    resultado = asyncio.run(api.casino_sesion(req))

    enviado = json.loads(llamadas[0].content)
    assert str(llamadas[0].url) == "https://atomic.example/api/playGame.do"
    assert enviado["player_id"] == "42", "es el id interno, no 'juanito'"
    assert enviado["lang"] == "es"
    assert enviado["symbol"] == "vs20olympgate"
    assert enviado["provider"] == "pragmaticplay"
    assert enviado["partner"] == "PARTNER-1" and enviado["api_key"] == "CLAVE-SECRETA"
    assert enviado["currency"] == "ARS" and enviado["gametype"] == "real"
    assert "x-sign" not in llamadas[0].headers
    assert resultado["url"] == "https://juego.example/abrir?t=1"


def test_la_sesion_de_atomic_queda_guardada_antes_de_devolver_el_enlace(api, monkeypatch):
    """Riesgo: los callbacks llegan antes de que el jugador vea la pantalla y
    no encuentran la sesión."""
    conn = ConexionLanzamiento(juego_atomic())
    _, req = lanzar(api, monkeypatch, conn, ok_atomic)

    resultado = asyncio.run(api.casino_sesion(req))

    assert len(conn.sesiones) == 1
    sesion, sesion_ext, user_id, agencia, game_id, _, moneda, integracion = conn.sesiones[0]
    assert sesion_ext == "SES-ATOMIC-9"
    assert (user_id, agencia, game_id, moneda, integracion) == (
        42, "AG-01", "vs20olympgate", "ARS", "atomic")
    assert resultado["sesion"] == "SES-ATOMIC-9"


def test_si_no_se_puede_guardar_la_sesion_el_jugador_igual_juega(api, monkeypatch, caplog):
    """Perder la sesión pierde el desglose por juego, no plata."""
    conn = ConexionLanzamiento(juego_atomic(), romper_sesion=True)
    _, req = lanzar(api, monkeypatch, conn, ok_atomic)

    with caplog.at_level("ERROR"):
        resultado = asyncio.run(api.casino_sesion(req))

    assert resultado["url"].startswith("https://juego.example")
    assert "no se pudo guardar la sesión" in caplog.text


def test_el_pedido_con_la_clave_nunca_llega_al_log(api, monkeypatch, caplog):
    """Riesgo: el cuerpo de playGame.do lleva el api_key; loguearlo lo deja
    en texto plano en los registros de la plataforma."""
    conn = ConexionLanzamiento(juego_atomic())
    _, req = lanzar(api, monkeypatch, conn, lambda r: httpx.Response(
        200, json={"status": "error", "message": "GAME_NOT_FOUND"}))

    with caplog.at_level("DEBUG"):
        with pytest.raises(HTTPException) as e:
            asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 502
    assert "CLAVE-SECRETA" not in caplog.text
    assert "GAME_NOT_FOUND" in caplog.text


@pytest.mark.parametrize("respuesta", [
    lambda r: httpx.Response(500, text="boom"),
    lambda r: httpx.Response(200, text="<html>"),
    lambda r: httpx.Response(200, json={"status": "ok"}),  # sin enlace
])
def test_un_lanzamiento_fallido_es_502_y_no_deja_sesion(api, monkeypatch, respuesta):
    conn = ConexionLanzamiento(juego_atomic())
    _, req = lanzar(api, monkeypatch, conn, respuesta)

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 502
    assert conn.sesiones == []


def test_un_juego_sin_estudio_no_se_lanza_a_ciegas(api, monkeypatch):
    conn = ConexionLanzamiento(juego_atomic(marca=None))
    llamadas, req = lanzar(api, monkeypatch, conn, ok_atomic)

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 503 and llamadas == []


def test_una_moneda_que_la_integracion_no_acepta_se_corta_antes_de_llamar(api, monkeypatch):
    """Riesgo: abrir el juego y que el jugador toque un botón que no
    responde."""
    conn = ConexionLanzamiento(juego_atomic(monedas="ARS"), moneda="COP")
    llamadas, req = lanzar(api, monkeypatch, conn, ok_atomic)

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 400 and llamadas == []


def test_el_juego_de_otro_adaptador_sigue_el_camino_de_siempre(api, monkeypatch):
    """Riesgo: el desvío a Atomic rompe 44neoluck. Con adaptador 'neoluck'
    no se debe llamar a playGame.do."""
    conn = ConexionLanzamiento(juego_atomic(adaptador="neoluck", integracion="44neoluck"))
    llamadas, req = lanzar(api, monkeypatch, conn, lambda r: httpx.Response(
        200, json={"session": {"game_url": "https://viejo.example/x", "sid_ext": "S"}}))

    resultado = asyncio.run(api.casino_sesion(req))

    assert resultado["url"] == "https://viejo.example/x"
    assert "playGame.do" not in str(llamadas[0].url)
    assert "x-sign" in llamadas[0].headers


def test_se_puede_pedir_la_integracion_para_desempatar(api, monkeypatch):
    conn = ConexionLanzamiento(juego_atomic())
    _, req = lanzar(api, monkeypatch, conn, ok_atomic, integracion="Atomic")

    asyncio.run(api.casino_sesion(req))

    assert conn.pedidos_de_juego[0] == ("vs20olympgate", "atomic")


# ── A2: el catálogo ────────────────────────────────────────────

class ConexionCatalogo:
    def __init__(self):
        self.ejecutadas = []

    async def execute(self, query, *args):
        self.ejecutadas.append((" ".join(query.split()), args))


def integracion(**cambios):
    fila = {"codigo": "atomic", "adaptador": "atomic",
            "url": "https://atomic.example/api", "api_code": "PARTNER-1",
            "api_secret": "CLAVE-SECRETA"}
    fila.update(cambios)
    return fila


CATALOGO = {"slots": [
    {"symbol": "vs20olympgate", "name": "Gates of Olympus", "rtp": "96.5",
     "provider_code": {"provider_code": "Pragmatic Play"},
     "imageurl": "https://i/1.png", "status": 1},
    {"symbol": "hk1", "name": "Hack Game",
     "provider_code": {"provider_name": "Hacksaw"}},
]}


def sincronizar(api, monkeypatch, manejador, integ=None):
    conn = ConexionCatalogo()
    llamadas = servidor_falso(api, monkeypatch, manejador)
    try:
        n = asyncio.run(api._sincronizar_integracion(conn, integ or integracion()))
    except HTTPException as e:
        return conn, llamadas, e
    return conn, llamadas, n


def test_el_catalogo_se_pide_con_partner_y_clave_y_se_guarda_bajo_atomic(api, monkeypatch):
    conn, llamadas, n = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO))

    assert n == 2
    assert str(llamadas[0].url) == "https://atomic.example/api/allgamelist"
    assert json.loads(llamadas[0].content) == {
        "partner": "PARTNER-1", "api_key": "CLAVE-SECRETA"}
    inserts = [a for q, a in conn.ejecutadas if q.startswith("INSERT INTO casino_juegos")]
    assert [a[:2] for a in inserts] == [("atomic", "vs20olympgate"), ("atomic", "hk1")]
    assert inserts[0][3] == "pragmaticplay", "la marca es el estudio que pide playGame.do"


def test_sincronizar_atomic_no_toca_las_filas_de_44neoluck(api, monkeypatch):
    """Riesgo: el dueño quiere a Atomic probado ANTES de retirar los 2.140
    juegos de 44neoluck. Toda sentencia va acotada a la integración."""
    conn, _, _ = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO))

    assert conn.ejecutadas
    for query, args in conn.ejecutadas:
        assert args[0] == "atomic", f"sentencia sin acotar a la integración: {query}"
        assert "44neoluck" not in args
    apagado = [q for q, _ in conn.ejecutadas if q.startswith("UPDATE casino_juegos SET activo=false")]
    assert apagado and "WHERE integracion=$1" in apagado[0]


def test_un_catalogo_irreconocible_no_apaga_el_existente(api, monkeypatch):
    """Riesgo: un cambio de formato del lado de Atomic se lee como 'ya no hay
    juegos' y apaga todo el catálogo."""
    conn, _, error = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json={"games": []}))

    assert isinstance(error, HTTPException) and error.status_code == 502
    assert conn.ejecutadas == []


def test_si_atomic_no_responde_el_catalogo_no_se_toca(api, monkeypatch):
    conn, _, error = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(503, text="caído"))

    assert error.status_code == 502 and conn.ejecutadas == []


def test_una_integracion_neoluck_sigue_pidiendo_su_catalogo_firmado(api, monkeypatch):
    conn, llamadas, _ = sincronizar(
        api, monkeypatch,
        lambda r: httpx.Response(200, json={"games": [], "brands": [], "groups": []}),
        integ=integracion(codigo="44neoluck", adaptador="neoluck",
                          url="https://44neoluck.xyz"))

    assert llamadas[0].method == "GET"
    assert str(llamadas[0].url).endswith("/api/v1/games")
    assert "x-sign" in llamadas[0].headers
