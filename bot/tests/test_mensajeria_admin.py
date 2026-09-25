"""El panel de Config → Mensajería: leer, guardar, borrar y probar las
credenciales de SMS y correo desde la base, con el entorno de respaldo.

Lo que importa acá, en el orden del feature doc
(`odd/tasks/credenciales-mensajeria-admin.md`): que ningún endpoint
devuelva el secreto completo, que sin `SECRETOS_CLAVE` la pantalla no
guarde nada y lo diga, que una fila en la base gane sobre la variable de
entorno, y que borrar la fila vuelva a usar el entorno sin reiniciar nada.
"""

import asyncio
import base64
import importlib
import json
import os

import httpx
import pytest

import secretos
from test_runtime_config import settings

LLAVE = base64.urlsafe_b64encode(os.urandom(32)).decode()

# Capturado antes de que ninguna prueba parchee `httpx.AsyncClient` para
# simular al proveedor: el cliente que arma el pedido ASGI contra la app
# tiene que seguir siendo el de verdad, aunque el envío de SMS/correo que
# ocurre *dentro* de ese pedido use el falso.
_ClienteASGIReal = httpx.AsyncClient


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def admin_headers(api, monkeypatch):
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", "test-admin-key")
    return {"X-Admin-Key": "test-admin-key"}


# ── Base falsa: una tabla credenciales_mensajeria en memoria ──────

class _Transaccion:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *a):
        return False


class FakeConnCredenciales:
    """(ambito, clave) -> fila, como la tabla real."""

    def __init__(self, filas=None):
        self.filas = dict(filas or {})  # {(ambito, clave): {"valor_cifrado", "actualizado_por", "actualizado_at"}}
        self.fetch_calls = []
        self.execute_calls = []

    def transaction(self):
        return _Transaccion()

    async def fetch(self, query, *args):
        q = " ".join(query.split())
        self.fetch_calls.append((q, args))
        if q.startswith("SELECT clave, valor_cifrado, actualizado_por, actualizado_at"):
            (ambito,) = args
            return [
                {"clave": clave, "valor_cifrado": f["valor_cifrado"],
                 "actualizado_por": f["actualizado_por"],
                 "actualizado_at": f["actualizado_at"]}
                for (a, clave), f in self.filas.items() if a == ambito
            ]
        raise AssertionError(f"fetch inesperado: {q}")

    async def execute(self, query, *args):
        q = " ".join(query.split())
        self.execute_calls.append((q, args))
        if q.startswith("INSERT INTO credenciales_mensajeria"):
            ambito, clave, valor_cifrado = args
            self.filas[(ambito, clave)] = {
                "valor_cifrado": valor_cifrado, "actualizado_por": "admin",
                "actualizado_at": "2026-09-25T12:00:00+00:00",
            }
            return
        if q.startswith("DELETE FROM credenciales_mensajeria"):
            ambito, clave = args
            self.filas.pop((ambito, clave), None)
            return
        raise AssertionError(f"execute inesperado: {q}")


class _Acquire:
    def __init__(self, conn):
        self.conn = conn

    async def __aenter__(self):
        return self.conn

    async def __aexit__(self, *a):
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


async def _req(app, method, path, headers=None, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with _ClienteASGIReal(transport=transport, base_url="http://testserver") as client:
        return await client.request(method, path, headers=headers or {}, json=json_body)


def req(app, method, path, headers=None, json_body=None):
    return asyncio.run(_req(app, method, path, headers=headers, json_body=json_body))


# ── Sin llave maestra: la pantalla no guarda nada y lo dice ───────

def test_sin_llave_el_get_lo_marca_y_no_hay_base_utilizable(api, monkeypatch):
    monkeypatch.delenv("SECRETOS_CLAVE", raising=False)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "GET", "/api/admin/mensajeria", headers=headers)

    assert r.status_code == 200
    assert r.json()["hay_llave_maestra"] is False


def test_sin_llave_guardar_falla_con_503_y_no_escribe(api, monkeypatch):
    monkeypatch.delenv("SECRETOS_CLAVE", raising=False)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/mensajeria", headers=headers,
            json_body={"valores": [{"ambito": "sms", "clave": "clave", "valor": "algo"}]})

    assert r.status_code == 503
    assert conn.execute_calls == [], "no debe escribir nada sin llave maestra"


# ── El GET nunca revela el secreto completo ───────────────────────

def test_get_enmascara_y_dice_de_donde_sale_cada_campo(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp-entorno")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    monkeypatch.setenv("RESEND_API_KEY", "")
    monkeypatch.setenv("CORREO_DESDE", "")
    headers = admin_headers(api, monkeypatch)

    secreto_db = "sk_dexatel_muy_secreta_9182736450"
    conn = FakeConnCredenciales({
        ("sms", "clave"): {"valor_cifrado": secretos.cifrar(secreto_db),
                           "actualizado_por": "admin",
                           "actualizado_at": "2026-09-25T12:00:00+00:00"},
    })
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "GET", "/api/admin/mensajeria", headers=headers)

    cuerpo = r.json()
    assert secreto_db not in json.dumps(cuerpo)

    campo_clave = cuerpo["proveedores"]["sms"]["campos"]["clave"]
    assert campo_clave["configurado"] is True
    assert campo_clave["origen"] == "base"
    assert campo_clave["mascara"] == secretos.enmascarar(secreto_db)

    campo_remitente = cuerpo["proveedores"]["sms"]["campos"]["remitente_sms"]
    assert campo_remitente["origen"] == "entorno"
    assert campo_remitente["configurado"] is True

    campo_whatsapp = cuerpo["proveedores"]["sms"]["campos"]["remitente_whatsapp"]
    assert campo_whatsapp["configurado"] is False
    assert campo_whatsapp["mascara"] is None


# ── La base gana, el entorno respalda, borrar vuelve al entorno ───

def test_una_fila_en_la_base_gana_sobre_la_variable_de_entorno(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-del-entorno")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp-entorno")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    conn = FakeConnCredenciales({
        ("sms", "clave"): {"valor_cifrado": secretos.cifrar("clave-de-la-base"),
                           "actualizado_por": "admin",
                           "actualizado_at": "2026-09-25T12:00:00+00:00"},
    })
    use_fake_pool(api, monkeypatch, conn)

    cred = asyncio.run(api._credenciales_sms())

    assert cred.clave == "clave-de-la-base"
    assert cred.remitente_sms == "iaqp-entorno"  # sin fila para este campo: cae al entorno


def test_borrar_la_fila_vuelve_a_usar_el_entorno_sin_reiniciar(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-del-entorno")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales({
        ("sms", "clave"): {"valor_cifrado": secretos.cifrar("clave-de-la-base"),
                           "actualizado_por": "admin",
                           "actualizado_at": "2026-09-25T12:00:00+00:00"},
    })
    use_fake_pool(api, monkeypatch, conn)

    # Se lee una vez para poblar el caché con el valor de la base.
    assert asyncio.run(api._credenciales_sms()).clave == "clave-de-la-base"

    r = req(api.app, "DELETE", "/api/admin/mensajeria/sms/clave", headers=headers)
    assert r.status_code == 200
    assert ("sms", "clave") not in conn.filas

    # Sin reiniciar el proceso: el caché ya se invalidó al borrar.
    assert asyncio.run(api._credenciales_sms()).clave == "clave-del-entorno"


def test_guardar_cifra_el_valor_y_el_proximo_envio_usa_la_base(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-del-entorno")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp-entorno")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    # Antes de guardar, cae al entorno (y se cachea).
    assert asyncio.run(api._credenciales_sms()).clave == "clave-del-entorno"

    r = req(api.app, "POST", "/api/admin/mensajeria", headers=headers,
            json_body={"valores": [{"ambito": "sms", "clave": "clave",
                                    "valor": "clave-nueva-del-panel"}]})

    assert r.status_code == 200
    assert r.json()["guardados"] == [{"ambito": "sms", "clave": "clave"}]
    assert "clave-nueva-del-panel" not in json.dumps(r.json())

    guardado_cifrado = conn.filas[("sms", "clave")]["valor_cifrado"]
    assert secretos.descifrar(guardado_cifrado) == "clave-nueva-del-panel"

    # El caché se invalidó al guardar: el próximo envío ya usa la base.
    assert asyncio.run(api._credenciales_sms()).clave == "clave-nueva-del-panel"


def test_guardar_campo_desconocido_se_rechaza(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/mensajeria", headers=headers,
            json_body={"valores": [{"ambito": "telegram", "clave": "token",
                                    "valor": "x"}]})

    assert r.status_code == 400
    assert conn.execute_calls == []


# ── Probar: manda de verdad y devuelve la respuesta cruda ─────────

class ProveedorFalso:
    def __init__(self, status=201, cuerpo=None):
        self.status = status
        self.cuerpo = cuerpo if cuerpo is not None else {"data": [{"id": "MSG-PRUEBA"}]}
        self.pedidos = []

    def parchear(self, monkeypatch, modulo):
        prueba = self

        class ClienteFalso:
            def __init__(self, *a, **k):
                pass

            async def __aenter__(self):
                return self

            async def __aexit__(self, *a):
                return False

            async def post(self, url, json=None, headers=None):
                prueba.pedidos.append({"url": url, "json": json, "headers": headers})
                return httpx.Response(prueba.status, json=prueba.cuerpo,
                                      request=httpx.Request("POST", url))

        monkeypatch.setattr(modulo.httpx, "AsyncClient", ClienteFalso)
        return self


def test_probar_sms_manda_de_verdad_y_devuelve_la_respuesta_cruda(api, monkeypatch):
    import mensajeria
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-secreta-de-verdad")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)
    proveedor = ProveedorFalso().parchear(monkeypatch, mensajeria)

    r = req(api.app, "POST", "/api/admin/mensajeria/probar", headers=headers,
            json_body={"proveedor": "sms", "destino": "+593991234567"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is True
    assert cuerpo["identificador"] == "MSG-PRUEBA"
    assert cuerpo["respuesta"] == {"data": [{"id": "MSG-PRUEBA"}]}
    assert "clave-secreta-de-verdad" not in json.dumps(cuerpo)
    # Se mandó de verdad: hubo un pedido real al proveedor.
    assert len(proveedor.pedidos) == 1
    assert proveedor.pedidos[0]["headers"]["X-Dexatel-Key"] == "clave-secreta-de-verdad"


def test_probar_devuelve_el_error_crudo_si_el_proveedor_rechaza(api, monkeypatch):
    import mensajeria
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)
    ProveedorFalso(status=400, cuerpo={"message": "unverified number"}).parchear(
        monkeypatch, mensajeria)

    r = req(api.app, "POST", "/api/admin/mensajeria/probar", headers=headers,
            json_body={"proveedor": "sms", "destino": "+593991234567"})

    assert r.status_code == 200
    cuerpo = r.json()
    assert cuerpo["ok"] is False
    assert cuerpo["status_proveedor"] == 400
    assert cuerpo["respuesta"] == {"message": "unverified number"}


def test_probar_sin_credenciales_da_503(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/mensajeria/probar", headers=headers,
            json_body={"proveedor": "sms", "destino": "+593991234567"})

    assert r.status_code == 503


# ── Ningún endpoint devuelve el secreto completo ──────────────────

def test_ningun_endpoint_de_mensajeria_devuelve_el_secreto_completo(api, monkeypatch):
    import mensajeria
    secreto = "sk_dexatel_super_secreta_no_debe_salir_nunca_jamas"
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r_guardar = req(api.app, "POST", "/api/admin/mensajeria", headers=headers,
                    json_body={"valores": [{"ambito": "sms", "clave": "clave",
                                            "valor": secreto}]})
    r_get = req(api.app, "GET", "/api/admin/mensajeria", headers=headers)

    ProveedorFalso().parchear(monkeypatch, mensajeria)
    r_probar = req(api.app, "POST", "/api/admin/mensajeria/probar", headers=headers,
                   json_body={"proveedor": "sms", "destino": "+593991234567"})

    r_borrar = req(api.app, "DELETE", "/api/admin/mensajeria/sms/clave", headers=headers)

    for respuesta in (r_guardar, r_get, r_probar, r_borrar):
        assert secreto not in respuesta.text
