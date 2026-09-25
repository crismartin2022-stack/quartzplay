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
    """(ambito, clave) -> fila de `credenciales_mensajeria`, y por separado
    id -> fila de `remitentes_mensajeria`. Dos tablas distintas, pero una
    misma conexión falsa: los endpoints de admin comparten `get_db()`."""

    def __init__(self, filas=None, remitentes=None):
        self.filas = dict(filas or {})  # {(ambito, clave): {"valor_cifrado", "actualizado_por", "actualizado_at"}}
        self.remitentes = dict(remitentes or {})  # {id: {"canal","remitente","paises","activo","actualizado_por","actualizado_at"}}
        self._siguiente_id = max(self.remitentes, default=0) + 1
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
        if q.startswith("SELECT id, canal, remitente, paises, activo, "
                         "actualizado_por, actualizado_at FROM remitentes_mensajeria"):
            filas = sorted(self.remitentes.items(),
                           key=lambda kv: (kv[1]["canal"], kv[1]["remitente"]))
            return [{"id": rid, **f} for rid, f in filas]
        if q.startswith("SELECT remitente, paises FROM remitentes_mensajeria"):
            (canal,) = args
            return [{"remitente": f["remitente"], "paises": f["paises"]}
                    for f in self.remitentes.values()
                    if f["canal"] == canal and f["activo"]]
        raise AssertionError(f"fetch inesperado: {q}")

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        self.fetch_calls.append((q, args))
        if q.startswith("INSERT INTO remitentes_mensajeria"):
            canal, remitente, paises, activo = args
            existente = next(
                (rid for rid, f in self.remitentes.items()
                 if f["canal"] == canal and f["remitente"] == remitente), None)
            rid = existente if existente is not None else self._siguiente_id
            if existente is None:
                self._siguiente_id += 1
            self.remitentes[rid] = {
                "canal": canal, "remitente": remitente, "paises": list(paises),
                "activo": activo, "actualizado_por": "admin",
                "actualizado_at": "2026-09-25T12:00:00+00:00",
            }
            return {"id": rid, **self.remitentes[rid]}
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def fetchval(self, query, *args):
        q = " ".join(query.split())
        self.fetch_calls.append((q, args))
        if q.startswith("DELETE FROM remitentes_mensajeria WHERE id=$1 RETURNING id"):
            (rid,) = args
            return self.remitentes.pop(rid, None) and rid
        raise AssertionError(f"fetchval inesperado: {q}")

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


def test_solo_se_enmascara_lo_que_de_verdad_es_secreto(api, monkeypatch):
    """El remitente es el nombre que el jugador ve en su teléfono, no una
    credencial. Enmascararlo no protege nada y le esconde al admin lo que
    necesita para entender por qué un envío salió como salió. Además
    "IAQP Col" enmascarado da "IAQP… Col", que parece roto estando bien."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-secreta-de-verdad")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "IAQP Col")
    monkeypatch.setenv("CORREO_DESDE", "codigos@mail.iaqp.lat")
    headers = admin_headers(api, monkeypatch)
    use_fake_pool(api, monkeypatch, FakeConnCredenciales())

    campos = req(api.app, "GET", "/api/admin/mensajeria",
                 headers=headers).json()["proveedores"]

    # El remitente se lee entero, y el correo de salida también.
    assert campos["sms"]["campos"]["remitente_sms"]["mascara"] == "IAQP Col"
    assert campos["sms"]["campos"]["remitente_sms"]["secreto"] is False
    assert campos["correo"]["campos"]["remitente"]["mascara"] == "codigos@mail.iaqp.lat"

    # La clave sigue enmascarada, que es lo único que importa esconder.
    clave = campos["sms"]["campos"]["clave"]
    assert clave["secreto"] is True
    assert clave["mascara"] != "clave-secreta-de-verdad"
    assert "clave-secreta-de-verdad" not in json.dumps(campos)


def test_probar_con_pais_usa_el_remitente_de_ese_pais(api, monkeypatch):
    """Sin esto la prueba mentiría. Diría "el SMS salió" habiendo salido por
    el remitente del entorno, cuando lo que el admin quiere saber es si
    puede alcanzar a un jugador de ESE país. Además devuelve cuál usó: en
    una cuenta con varios remitentes, saber que salió no alcanza."""
    import mensajeria
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave-secreta-de-verdad")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "El de respaldo")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales(remitentes={1: {
        "canal": "sms", "remitente": "IAQP EC", "paises": ["EC"],
        "activo": True, "actualizado_por": "admin", "actualizado_at": None}})
    use_fake_pool(api, monkeypatch, conn)
    proveedor = ProveedorFalso().parchear(monkeypatch, mensajeria)

    r = req(api.app, "POST", "/api/admin/mensajeria/probar", headers=headers,
            json_body={"proveedor": "sms", "destino": "0991234567",
                       "pais": "EC"})

    assert r.status_code == 200
    assert r.json()["remitente"] == "IAQP EC"
    assert proveedor.pedidos[0]["json"]["data"]["from"] == "IAQP EC"
    # Y el número se normalizó con ese país, como en un envío real.
    assert proveedor.pedidos[0]["json"]["data"]["to"] == ["593991234567"]


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


# ── Remitentes por país: el panel de admin ────────────────────────
#
# `mensajeria.elegir_remitente` ya está probada sin base en
# `test_mensajeria.py`; acá lo que importa es la parte que sí toca la base:
# que el panel liste, guarde y borre remitentes, y que `_credenciales_para_envio`
# los use de verdad para resolver el remitente de un envío.

def test_remitentes_lista_vacia_por_defecto(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    use_fake_pool(api, monkeypatch, FakeConnCredenciales())

    r = req(api.app, "GET", "/api/admin/remitentes", headers=headers)

    assert r.status_code == 200
    assert r.json() == {"remitentes": {"sms": [], "whatsapp": []}}


def test_remitentes_guardar_lo_deja_ver_en_el_get(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    use_fake_pool(api, monkeypatch, FakeConnCredenciales())

    r = req(api.app, "POST", "/api/admin/remitentes", headers=headers,
            json_body={"canal": "sms", "remitente": "IAQP Col",
                      "paises": ["ar", "co", "ve"]})

    assert r.status_code == 200
    guardado = r.json()["remitente"]
    assert guardado["paises"] == ["AR", "CO", "VE"]  # se normaliza a mayúsculas
    assert guardado["activo"] is True  # por defecto

    r_get = req(api.app, "GET", "/api/admin/remitentes", headers=headers)
    assert r_get.json()["remitentes"]["sms"][0]["remitente"] == "IAQP Col"


def test_remitentes_guardar_de_nuevo_actualiza_en_vez_de_duplicar(api, monkeypatch):
    """Mismo canal y remitente dos veces: la segunda vez corrige la lista de
    países, no crea una segunda fila ambigua."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    req(api.app, "POST", "/api/admin/remitentes", headers=headers,
        json_body={"canal": "sms", "remitente": "IAQP Col", "paises": ["AR"]})
    req(api.app, "POST", "/api/admin/remitentes", headers=headers,
        json_body={"canal": "sms", "remitente": "IAQP Col", "paises": ["AR", "CO"]})

    assert len(conn.remitentes) == 1
    assert list(conn.remitentes.values())[0]["paises"] == ["AR", "CO"]


def test_remitentes_pais_no_habilitado_se_rechaza(api, monkeypatch):
    """Si se cuela un código mal escrito, ningún envío a ese país lo iba a
    usar nunca: mejor que el panel lo diga ahora, no el día que alguien de
    ese país intente verificarse."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/remitentes", headers=headers,
            json_body={"canal": "sms", "remitente": "IAQP Col", "paises": ["ZZ"]})

    assert r.status_code == 400
    assert conn.remitentes == {}


def test_remitentes_canal_invalido_se_rechaza(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    use_fake_pool(api, monkeypatch, FakeConnCredenciales())

    r = req(api.app, "POST", "/api/admin/remitentes", headers=headers,
            json_body={"canal": "telegram", "remitente": "IAQP", "paises": []})

    assert r.status_code == 400


def test_remitentes_borrar_por_id(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales(remitentes={
        1: {"canal": "sms", "remitente": "IAQP Col", "paises": ["AR"],
            "activo": True, "actualizado_por": "admin",
            "actualizado_at": "2026-09-25T12:00:00+00:00"},
    })
    use_fake_pool(api, monkeypatch, conn)

    r = req(api.app, "DELETE", "/api/admin/remitentes/1", headers=headers)

    assert r.status_code == 200
    assert conn.remitentes == {}


def test_remitentes_borrar_id_inexistente_da_404(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    headers = admin_headers(api, monkeypatch)
    use_fake_pool(api, monkeypatch, FakeConnCredenciales())

    r = req(api.app, "DELETE", "/api/admin/remitentes/999", headers=headers)

    assert r.status_code == 404


# ── La resolución de verdad: `_credenciales_para_envio` con la base ─

def test_credenciales_para_envio_usa_el_remitente_del_pais_cubierto(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp-entorno")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    conn = FakeConnCredenciales(remitentes={
        1: {"canal": "sms", "remitente": "IAQP Col", "paises": ["AR", "CO", "VE"],
            "activo": True, "actualizado_por": "admin", "actualizado_at": "x"},
        2: {"canal": "sms", "remitente": "IAQP EC", "paises": ["EC"],
            "activo": True, "actualizado_por": "admin", "actualizado_at": "x"},
    })
    use_fake_pool(api, monkeypatch, conn)

    cred = asyncio.run(api._credenciales_para_envio("sms", "EC"))

    assert cred.remitente_sms == "IAQP EC"


def test_credenciales_para_envio_sin_cobertura_cae_al_remitente_por_defecto(api, monkeypatch):
    """El caso real que motivó la tabla: un país sin remitente propio no
    puede quedar sin nada mientras haya un remitente por defecto del canal."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    conn = FakeConnCredenciales(remitentes={
        1: {"canal": "sms", "remitente": "IAQP Col", "paises": ["AR", "CO", "VE"],
            "activo": True, "actualizado_por": "admin", "actualizado_at": "x"},
        2: {"canal": "sms", "remitente": "IAQP", "paises": [],
            "activo": True, "actualizado_por": "admin", "actualizado_at": "x"},
    })
    use_fake_pool(api, monkeypatch, conn)

    cred = asyncio.run(api._credenciales_para_envio("sms", "PE"))

    assert cred.remitente_sms == "IAQP"


def test_credenciales_para_envio_sin_nada_el_error_nombra_el_pais(api, monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    conn = FakeConnCredenciales(remitentes={
        1: {"canal": "sms", "remitente": "IAQP Col", "paises": ["AR", "CO", "VE"],
            "activo": True, "actualizado_por": "admin", "actualizado_at": "x"},
    })
    use_fake_pool(api, monkeypatch, conn)

    import mensajeria
    with pytest.raises(mensajeria.SinRemitenteParaPais, match="Ecuador"):
        asyncio.run(api._credenciales_para_envio("sms", "EC"))


def test_credenciales_para_envio_ignora_remitentes_inactivos(api, monkeypatch):
    """Un remitente dado de baja (revocado por la operadora, por ejemplo) no
    puede seguir eligiéndose: por eso la lectura filtra por `activo=true`."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    conn = FakeConnCredenciales(remitentes={
        1: {"canal": "sms", "remitente": "IAQP EC", "paises": ["EC"],
            "activo": False, "actualizado_por": "admin", "actualizado_at": "x"},
    })
    use_fake_pool(api, monkeypatch, conn)

    import mensajeria
    with pytest.raises(mensajeria.SinRemitenteParaPais):
        asyncio.run(api._credenciales_para_envio("sms", "EC"))


def test_credenciales_para_envio_se_cachea_y_se_invalida_al_guardar(api, monkeypatch):
    """Mismo contrato que las credenciales: un cambio en el panel rige en el
    próximo envío, sin reiniciar el proceso."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    monkeypatch.setenv("DEXATEL_API_KEY", "clave")
    monkeypatch.setenv("DEXATEL_SMS_FROM", "iaqp-entorno")
    monkeypatch.setenv("DEXATEL_WHATSAPP_FROM", "")
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnCredenciales()
    use_fake_pool(api, monkeypatch, conn)

    # Sin filas todavía: cae al entorno, y se cachea.
    assert asyncio.run(api._credenciales_para_envio("sms", "EC")).remitente_sms == "iaqp-entorno"

    req(api.app, "POST", "/api/admin/remitentes", headers=headers,
        json_body={"canal": "sms", "remitente": "IAQP EC", "paises": ["EC"]})

    # El caché se invalidó al guardar: el próximo envío ya ve el remitente nuevo.
    assert asyncio.run(api._credenciales_para_envio("sms", "EC")).remitente_sms == "IAQP EC"
