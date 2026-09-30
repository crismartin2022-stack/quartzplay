"""Content360, traer el catálogo (`GET /games/get`).

Va contra un `httpx.MockTransport`: se verifica lo que MANDAMOS y cómo se
comporta el bot con lo que vuelve, en particular qué queda marcado como en
vivo. No se habló con un Content360 real: las categorías que usan de verdad
están sin verificar, y por eso la lista es configurable.
"""

import asyncio
import hashlib
import hmac
import importlib

import httpx
import pytest
from fastapi import HTTPException

from test_atomic_lanzamiento import servidor_falso
from test_runtime_config import settings

CLAVE = "CLAVE-SECRETA-C360"


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


# ── El catálogo ────────────────────────────────────────────────

class Transaccion:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class ConexionCatalogo:
    def __init__(self):
        self.ejecutadas = []

    def transaction(self):
        return Transaccion()

    async def execute(self, query, *args):
        self.ejecutadas.append((" ".join(query.split()), args))

    def juegos(self):
        return {a[1]: a for q, a in self.ejecutadas
                if q.startswith("INSERT INTO casino_juegos")}


def integracion(**cambios):
    fila = {"codigo": "content360", "adaptador": "content360",
            "url": "https://c360.example", "api_code": "69",
            "api_secret": CLAVE}
    fila.update(cambios)
    return fila


CATALOGO = {"status": "OK", "data": {"brands": [
    {"brand_name": "Evolution Gaming", "brand_type": "live", "brand_games": [
        {"id": 101, "name": "Ruleta", "image": "http://i/1.png"},
        {"id": 102, "name": "Blackjack", "categories": ["Live Casino"]}]},
    {"brand_name": "Pragmatic Play", "brand_type": "slots", "brand_games": [
        {"id": 201, "name": "Gates", "categories": ["slots"]}]},
]}}


def sincronizar(api, monkeypatch, manejador, integ=None):
    conn = ConexionCatalogo()
    llamadas = servidor_falso(api, monkeypatch, manejador)
    try:
        n = asyncio.run(api._sincronizar_integracion(conn, integ or integracion()))
    except HTTPException as e:
        return conn, llamadas, e
    return conn, llamadas, n


def test_el_catalogo_se_pide_firmado_como_consulta_con_el_client_id(api, monkeypatch):
    conn, llamadas, n = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO))

    pedido = llamadas[0]
    assert n == 3
    assert pedido.method == "GET" and pedido.url.path == "/games/get"
    assert pedido.url.query.decode() == "client_id=69"
    assert pedido.headers["x-content-key"] == hmac.new(
        CLAVE.encode(), b"client_id=69", hashlib.sha256).hexdigest()


def test_las_mesas_en_vivo_se_marcan_por_categoria_y_no_por_adivinar(api, monkeypatch):
    """Riesgo: es el proveedor que va a traer el casino en vivo; una mesa
    marcada como slot no aparece en la pestaña en vivo."""
    conn, _, _ = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO))

    juegos = conn.juegos()
    # (integracion, game_id, titulo, marca, imagen, es_vivo, clave, activo, sabe)
    assert juegos["101"][5] is True, "la marca es de tipo live"
    assert juegos["102"][5] is True, "la categoría es Live Casino"
    assert juegos["201"][5] is False
    assert juegos["101"][3] == "evolutiongaming"
    assert all(a[8] is True for a in juegos.values()), \
        "el catálogo completo es autoridad sobre qué es en vivo"


def test_si_ninguna_categoria_coincide_se_avisa_en_rojo(api, monkeypatch, caplog):
    """Riesgo: no sabemos qué palabra usa Content360. La pestaña en vivo
    quedaría vacía en silencio; el log dice qué categorías vio."""
    sin_vivo = {"data": {"brands": [{"brand_name": "X", "brand_games": [
        {"id": 1, "name": "Mesa", "categories": ["Mesas Premium"]}]}]}}

    with caplog.at_level("WARNING"):
        sincronizar(api, monkeypatch, lambda r: httpx.Response(200, json=sin_vivo))

    assert any("NINGÚN juego quedó como en vivo" in m for m in caplog.messages)
    assert any("mesas premium" in m for m in caplog.messages)


def test_las_categorias_en_vivo_se_pueden_corregir_desde_el_entorno(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    monkeypatch.setenv("C360_CATEGORIAS_VIVO", "Mesas Premium, crupier")
    import config
    config.get_runtime_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))

    assert api._C360_VIVAS == frozenset({"mesas premium", "crupier"})
    sin_vivo = {"data": {"brands": [{"brand_name": "X", "brand_games": [
        {"id": 1, "name": "Mesa", "categories": ["Mesas Premium"]}]}]}}
    conn, _, _ = sincronizar(api, monkeypatch,
                             lambda r: httpx.Response(200, json=sin_vivo))
    assert conn.juegos()["1"][5] is True


def test_sincronizar_content360_no_toca_las_filas_de_otros_proveedores(api, monkeypatch):
    """Riesgo: apagar juegos de Atomic o de 44neoluck al apagar "los que ya no
    vienen". Toda sentencia va acotada a la integración."""
    conn, _, _ = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO))

    assert conn.ejecutadas
    for query, args in conn.ejecutadas:
        assert args[0] == "content360", f"sentencia sin acotar: {query}"
    apagado = [q for q, _ in conn.ejecutadas
               if q.startswith("UPDATE casino_juegos SET activo=false")]
    assert apagado and "WHERE integracion=$1" in apagado[0]


def test_un_catalogo_irreconocible_no_apaga_el_existente(api, monkeypatch):
    conn, _, error = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json={"data": {"brands": []}}))

    assert isinstance(error, HTTPException) and error.status_code == 502
    assert conn.ejecutadas == []


def test_si_content360_no_responde_el_catalogo_no_se_toca(api, monkeypatch):
    conn, _, error = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(503, text="caído"))

    assert error.status_code == 502 and conn.ejecutadas == []


def test_un_client_id_que_no_es_numerico_no_llama_a_nadie(api, monkeypatch):
    conn, llamadas, error = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json=CATALOGO),
        integ=integracion(api_code="abc"))

    assert error.status_code == 400 and llamadas == []


def test_una_integracion_atomic_sigue_por_su_camino(api, monkeypatch):
    """Riesgo: el desvío a Content360 rompe a Atomic."""
    conn, llamadas, _ = sincronizar(
        api, monkeypatch, lambda r: httpx.Response(200, json={"slots": [
            {"symbol": "a", "name": "A", "provider_code": "p"}]}),
        integ=integracion(codigo="atomic", adaptador="atomic",
                          url="https://atomic.example/api"))
    assert str(llamadas[0].url) == "https://atomic.example/api/allgamelist"
