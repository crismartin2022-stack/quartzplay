"""La lista blanca de IP de los callbacks de proveedores.

Nace de un incidente: panel-multiskin comparaba textos exactos, así que
`2001:41d0:363:2f00::/56` no coincidía con nada y nadie lo notaba. Lo que
se cubre acá es que los rangos coincidan de verdad, en IPv4 y en IPv6, y
que la decisión sobre la lista vacía quede fijada por un test.
"""

import asyncio
import importlib

import pytest
from fastapi import HTTPException

import registro_proveedores as rp
from test_runtime_config import settings
from test_registro_proveedores import FakeConnIntegraciones, usar


def ips(xff="", host=""):
    return rp.ips_del_pedido(xff, host)


# ── Rangos CIDR ───────────────────────────────────────────────────

def test_ipv4_dentro_del_rango_pasa_y_fuera_no():
    lista = ["203.0.113.0/24"]
    assert rp.ip_permitida(ips(host="203.0.113.77"), lista) == (True, "ok")
    assert rp.ip_permitida(ips(host="203.0.114.1"), lista)[0] is False


def test_ipv6_dentro_del_rango_pasa_y_fuera_no():
    """El caso exacto del incidente: un /56 de Atomic que la comparación de
    texto nunca habría reconocido."""
    lista = ["2001:41d0:363:2f00::/56"]
    assert rp.ip_permitida(ips(host="2001:41d0:363:2f42::9"), lista) == (True, "ok")
    assert rp.ip_permitida(ips(host="2001:41d0:363:3000::1"), lista)[0] is False


def test_una_direccion_suelta_vale_como_su_propio_rango():
    assert rp.ip_permitida(ips(host="198.51.100.4"), ["198.51.100.4"])[0] is True
    assert rp.ip_permitida(ips(host="198.51.100.5"), ["198.51.100.4"])[0] is False


def test_una_familia_no_coincide_con_la_otra():
    assert rp.ip_permitida(ips(host="203.0.113.1"), ["2001:db8::/32"])[0] is False


def test_ipv4_mapeada_en_ipv6_cuenta_como_la_ipv4():
    """Riesgo: un proxy que habla IPv6 deja afuera a un rango IPv4 permitido."""
    assert rp.ip_permitida(ips(host="::ffff:203.0.113.9"), ["203.0.113.0/24"])[0] is True


def test_una_entrada_daniada_en_la_base_no_tumba_el_resto():
    lista = ["esto-no-es-una-ip", "203.0.113.0/24"]
    assert rp.ip_permitida(ips(host="203.0.113.1"), lista)[0] is True
    assert rp.ip_permitida(ips(host="10.0.0.1"), ["esto-no-es-una-ip"])[0] is False


# ── Detrás del proxy ──────────────────────────────────────────────

def test_toda_la_cadena_de_x_forwarded_for_cuenta():
    """Riesgo: mirar solo `client.host` (el proxy) o solo la primera."""
    cadena = "10.9.9.9, 203.0.113.50, 172.16.0.1"
    assert rp.ip_permitida(ips(cadena, "172.16.0.1"), ["203.0.113.0/24"])[0] is True


def test_basura_en_la_cabecera_se_ignora_sin_romper():
    assert rp.ip_permitida(ips("no-soy-ip, 203.0.113.5"), ["203.0.113.0/24"])[0] is True


def test_con_proxy_de_confianza_solo_cuenta_la_entrada_que_no_falsifica_el_cliente():
    """Riesgo: el cliente escribe una IP permitida al principio de la
    cabecera. Con 1 salto de confianza solo vale la última entrada."""
    falsificada = "203.0.113.5, 198.51.100.99"  # la 2ª la agregó el proxy
    con_confianza = rp.ips_del_pedido(falsificada, "172.16.0.1", 1)
    assert rp.ip_permitida(con_confianza, ["203.0.113.0/24"])[0] is False
    # y sin confianza configurada el hueco existe (queda documentado)
    assert rp.ip_permitida(ips(falsificada), ["203.0.113.0/24"])[0] is True


# ── Lista vacía: falla cerrado ────────────────────────────────────

def test_lista_vacia_rechaza_todo_y_dice_por_que():
    """Decisión: distinto de panel-multiskin, que deja pasar. Borrar el
    valor no puede apagar en silencio la única defensa del endpoint."""
    assert rp.ip_permitida(ips(host="203.0.113.1"), []) == (False, "lista_vacia")
    assert rp.ip_permitida(ips(host="203.0.113.1"), None) == (False, "lista_vacia")


# ── Validación al guardar ─────────────────────────────────────────

def test_normalizar_acepta_rangos_y_direcciones_y_las_deja_canonicas():
    assert rp.normalizar_redes([" 198.51.100.4 ", "2001:41D0:363:2F00::/56",
                                "198.51.100.4", ""]) == [
        "198.51.100.4/32", "2001:41d0:363:2f00::/56"]


@pytest.mark.parametrize("malo", ["no-es-ip", "10.0.0.5/24", "300.1.1.1", "1.2.3.4/40"])
def test_normalizar_rechaza_lo_mal_escrito_en_vez_de_corregirlo(malo):
    """`10.0.0.5/24` corregido solo sería ensanchar el permiso sin que
    nadie lo decida."""
    with pytest.raises(ValueError):
        rp.normalizar_redes([malo])


# ── El guardia de los endpoints ───────────────────────────────────

class _Req:
    def __init__(self, xff="", host="172.16.0.1"):
        self.headers = {"x-forwarded-for": xff} if xff else {}
        self.client = type("C", (), {"host": host})()


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def _conn(ips_lista, activa=True):
    return FakeConnIntegraciones({"atomic": {
        "codigo": "atomic", "activa": activa, "adaptador": "atomic",
        "url": "https://api-slots.network/api", "api_code": "iaqp",
        "ips_permitidas": ips_lista}})


def test_el_guardia_deja_pasar_una_ip_de_la_lista(api, monkeypatch):
    usar(api, monkeypatch, _conn(["203.0.113.0/24"]))
    asyncio.run(api._exigir_ip_de_proveedor(_Req("203.0.113.8"), "atomic"))


def test_el_guardia_rechaza_con_403_una_ip_ajena(api, monkeypatch):
    usar(api, monkeypatch, _conn(["203.0.113.0/24"]))
    with pytest.raises(HTTPException) as e:
        asyncio.run(api._exigir_ip_de_proveedor(_Req("198.51.100.1"), "atomic"))
    assert e.value.status_code == 403


def test_el_guardia_con_lista_vacia_rechaza(api, monkeypatch):
    usar(api, monkeypatch, _conn([]))
    with pytest.raises(HTTPException) as e:
        asyncio.run(api._exigir_ip_de_proveedor(_Req("203.0.113.8"), "atomic"))
    assert e.value.status_code == 403


def test_el_guardia_rechaza_un_proveedor_apagado_o_inexistente(api, monkeypatch):
    usar(api, monkeypatch, _conn(["203.0.113.0/24"], activa=False))
    for codigo in ("atomic", "no-existe"):
        with pytest.raises(HTTPException):
            asyncio.run(api._exigir_ip_de_proveedor(_Req("203.0.113.8"), codigo))


def test_cambiar_la_lista_desde_el_panel_rige_sin_reiniciar(api, monkeypatch):
    """Riesgo: Atomic cambia de IP y hace falta un deploy."""
    from test_mensajeria_admin import admin_headers, req
    conn = _conn(["203.0.113.0/24"])
    usar(api, monkeypatch, conn)
    with pytest.raises(HTTPException):
        asyncio.run(api._exigir_ip_de_proveedor(_Req("198.51.100.1"), "atomic"))

    r = req(api.app, "POST", "/api/admin/casino/integraciones",
            headers=admin_headers(api, monkeypatch),
            json_body={"codigo": "atomic", "activa": True,
                       "ips_permitidas": ["198.51.100.0/24"]})

    assert r.status_code == 200
    asyncio.run(api._exigir_ip_de_proveedor(_Req("198.51.100.1"), "atomic"))


def test_guardar_una_lista_mal_escrita_es_400_y_no_escribe(api, monkeypatch):
    from test_mensajeria_admin import admin_headers, req
    conn = _conn(["203.0.113.0/24"])
    usar(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/casino/integraciones",
            headers=admin_headers(api, monkeypatch),
            json_body={"codigo": "atomic", "ips_permitidas": ["10.0.0.5/24"]})

    assert r.status_code == 400
    assert conn.execute_calls == []
