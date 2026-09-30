"""Content360, abrir un juego (`GET /game`).

Va contra un `httpx.MockTransport`: se verifica lo que MANDAMOS (en particular
que el lanzamiento va firmado como consulta) y cómo se comporta el bot con lo
que vuelve. No se habló con un Content360 real: que su servidor acepte esta
firma de lanzamiento es lo que confirmó su soporte, no algo que se haya visto.
"""

import asyncio
import hashlib
import hmac
import importlib
from urllib.parse import parse_qsl

import httpx
import pytest
from fastapi import HTTPException

import registro_proveedores as rp
from test_atomic_lanzamiento import servidor_falso
from test_runtime_config import settings
from test_wallet_setbalance import use_fake_pool

CLAVE = "CLAVE-SECRETA-C360"


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def proveedor(**cambios):
    datos = dict(codigo="content360", adaptador="content360", activa=True,
                 url="https://c360.example", api_code="69", api_secret=CLAVE,
                 monedas=("ARS",), ips_permitidas=(), origen="base")
    datos.update(cambios)
    return rp.Proveedor(**datos)


# ── Lanzar un juego ────────────────────────────────────────────

class ConexionLanzamiento:
    def __init__(self, juego, moneda="ARS", romper_sesion=False):
        self.juego = juego
        self.moneda = moneda
        self.romper_sesion = romper_sesion
        self.sesiones = []
        self.borradas = []

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT id, username, moneda, bloqueado, creado_por"):
            return {"id": 42, "username": "juanito", "moneda": self.moneda,
                    "bloqueado": False, "creado_por": "AG-01"}
        if q.startswith("SELECT j.*, i.url"):
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
        if q.startswith("DELETE FROM casino_sesiones"):
            self.borradas.append(args[0])
            self.sesiones = [s for s in self.sesiones if s[0] != args[0]]
            return
        raise AssertionError(f"execute inesperado: {q}")


def juego_c360(**cambios):
    fila = {"game_id": "1234", "titulo": "Ruleta en vivo", "marca": "evolution",
            "es_vivo": True, "integracion": "content360",
            "url": "https://c360.example", "api_code": "69",
            "api_secret": CLAVE, "api_secret_cifrado": None,
            "monedas": "ARS", "adaptador": "content360"}
    fila.update(cambios)
    return fila


def lanzar(api, monkeypatch, conn, respuesta, productos=("casino", "casino_vivo"),
           **cuerpo):
    use_fake_pool(api, monkeypatch, conn)

    async def prods(*_):
        return set(productos)

    async def prov(codigo):
        return proveedor()

    monkeypatch.setattr(api, "_productos_de", prods)
    monkeypatch.setattr(api, "_proveedor", prov)
    llamadas = servidor_falso(api, monkeypatch, respuesta)

    class Req:
        async def json(self):
            return {"user_id": 42, "game_id": "1234", **cuerpo}

    return llamadas, Req()


def ok_c360(_):
    return httpx.Response(200, json={
        "status": "OK", "data": {"url": "https://juego.example/abrir?t=1"}})


def test_el_lanzamiento_va_firmado_como_consulta_y_firma_lo_que_envia(api, monkeypatch):
    """Riesgo: firmar un JSON o un texto distinto del que viaja. Su soporte
    dijo que el lanzamiento se firma como `http_build_query`; si lo firmado y
    lo enviado difieren, responden "Client authentication failed"."""
    conn = ConexionLanzamiento(juego_c360())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360)

    resultado = asyncio.run(api.casino_sesion(req))

    pedido = llamadas[0]
    assert pedido.method == "GET"
    assert pedido.url.path == "/game" and pedido.url.host == "c360.example"
    consulta = pedido.url.query.decode()
    esperada = hmac.new(CLAVE.encode(), consulta.encode(),
                        hashlib.sha256).hexdigest()
    assert pedido.headers["x-content-key"] == esperada
    # La consulta viaja ordenada, que es como se firmó.
    claves = [k for k, _ in parse_qsl(consulta)]
    assert claves == sorted(claves)
    assert resultado["url"] == "https://juego.example/abrir?t=1"


def test_el_lanzamiento_manda_el_id_interno_el_idioma_y_la_moneda(api, monkeypatch):
    conn = ConexionLanzamiento(juego_c360())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360)

    resultado = asyncio.run(api.casino_sesion(req))

    q = dict(parse_qsl(llamadas[0].url.query.decode()))
    assert q["user"] == "42", "es el id interno, no 'juanito'"
    assert q["username"] == "juanito" and q["client_id"] == "69"
    assert q["game"] == "1234" and q["currency"] == "ARS"
    assert q["language"] == "es_ES" and q["demo"] == "0"
    assert q["session_token"] == resultado["sesion"]
    assert CLAVE not in llamadas[0].url.query.decode()


def test_la_sesion_queda_guardada_con_el_token_que_despues_llega_en_los_callbacks(api, monkeypatch):
    """Riesgo: los callbacks llegan con el `session_token` que pusimos
    nosotros y no encuentran la sesión, o la encuentran de otro jugador."""
    conn = ConexionLanzamiento(juego_c360())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360)

    resultado = asyncio.run(api.casino_sesion(req))

    assert len(conn.sesiones) == 1
    sesion, sesion_ext, user_id, agencia, game_id, titulo, moneda, integ = \
        conn.sesiones[0]
    assert sesion == sesion_ext == resultado["sesion"]
    assert (user_id, agencia, game_id, moneda, integ) == (
        42, "AG-01", "1234", "ARS", "content360")
    assert dict(parse_qsl(llamadas[0].url.query.decode()))["session_token"] == sesion


def test_la_sesion_se_guarda_antes_de_llamar_a_su_servidor(api, monkeypatch):
    """Un callback puede llegar mientras el lanzamiento todavía responde."""
    conn = ConexionLanzamiento(juego_c360())
    vistas = []

    def responder(r):
        vistas.append(len(conn.sesiones))
        return ok_c360(r)

    _, req = lanzar(api, monkeypatch, conn, responder)
    asyncio.run(api.casino_sesion(req))

    assert vistas == [1]


@pytest.mark.parametrize("respuesta", [
    lambda r: httpx.Response(500, text="boom"),
    lambda r: httpx.Response(200, text="<html>"),
    lambda r: httpx.Response(200, json={"status": "OK"}),              # sin enlace
    lambda r: httpx.Response(200, json={"status": "OK",
                                        "data": {"url": "javascript:alert(1)"}}),
    lambda r: httpx.Response(401, json={"status": "ERROR",
                                        "message": "Client authentication failed"}),
])
def test_un_lanzamiento_fallido_es_502_y_no_deja_sesion_colgando(api, monkeypatch, respuesta):
    """Riesgo: un enlace que no es http(s) termina en el `src` de un iframe y
    ejecutaría código en nuestro dominio."""
    conn = ConexionLanzamiento(juego_c360())
    _, req = lanzar(api, monkeypatch, conn, respuesta)

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 502
    assert conn.sesiones == [] and len(conn.borradas) == 1


def test_el_mensaje_de_error_de_ellos_queda_en_el_log_y_la_clave_no(api, monkeypatch, caplog):
    conn = ConexionLanzamiento(juego_c360())
    _, req = lanzar(api, monkeypatch, conn, lambda r: httpx.Response(
        200, json={"status": "ERROR", "message": ["Game not found"]}))

    with caplog.at_level("DEBUG"):
        with pytest.raises(HTTPException):
            asyncio.run(api.casino_sesion(req))

    assert "Game not found" in caplog.text
    assert CLAVE not in caplog.text


def test_un_juego_cuyo_id_no_es_entero_no_se_lanza(api, monkeypatch):
    """`game` es un entero en su API; mandar otra cosa da un 422 mudo."""
    conn = ConexionLanzamiento(juego_c360(game_id="slot-abc"))
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360, game_id="slot-abc")

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 503 and llamadas == []


def test_si_no_se_puede_guardar_la_sesion_el_jugador_igual_juega(api, monkeypatch, caplog):
    """Perder la sesión pierde el desglose por juego, no plata."""
    conn = ConexionLanzamiento(juego_c360(), romper_sesion=True)
    _, req = lanzar(api, monkeypatch, conn, ok_c360)

    with caplog.at_level("ERROR"):
        resultado = asyncio.run(api.casino_sesion(req))

    assert resultado["url"].startswith("https://juego.example")
    assert "no se pudo guardar la sesión" in caplog.text


def test_el_casino_en_vivo_exige_el_producto_de_la_agencia(api, monkeypatch):
    """Lo en vivo es un producto aparte: el flag que sincroniza Content360
    decide cuál se le pide a la agencia."""
    conn = ConexionLanzamiento(juego_c360(es_vivo=True))
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360, productos=("casino",))

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 403 and llamadas == []


def test_una_moneda_que_la_integracion_no_acepta_se_corta_antes_de_llamar(api, monkeypatch):
    conn = ConexionLanzamiento(juego_c360(monedas="ARS"), moneda="COP")
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360)

    with pytest.raises(HTTPException) as e:
        asyncio.run(api.casino_sesion(req))

    assert e.value.status_code == 400 and llamadas == []


def test_la_url_de_retorno_solo_viaja_si_es_http(api, monkeypatch):
    conn = ConexionLanzamiento(juego_c360())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360,
                           return_url="javascript:alert(1)")
    asyncio.run(api.casino_sesion(req))
    assert "return_url" not in dict(parse_qsl(llamadas[0].url.query.decode()))

    conn = ConexionLanzamiento(juego_c360())
    llamadas, req = lanzar(api, monkeypatch, conn, ok_c360,
                           return_url="https://app.example/casino")
    asyncio.run(api.casino_sesion(req))
    assert dict(parse_qsl(llamadas[0].url.query.decode()))["return_url"] == \
        "https://app.example/casino"
