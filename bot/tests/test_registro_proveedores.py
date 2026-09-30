"""El registro de proveedores: que 44neoluck siga andando mientras la
configuración se muda de variables sueltas a la tabla.

Lo que se guarda acá, en orden de daño si se rompe: que sin fila las
variables de entorno sigan valiendo (producción hoy vive de ellas), que una
fila gane sobre el entorno, que la clave se cifre al guardarla y que un
cambio en el panel rija sin reiniciar.
"""

import asyncio
import base64
import importlib
import os

import pytest

import registro_proveedores as rp
import secretos
from test_runtime_config import settings
from test_mensajeria_admin import (
    FakePool, _Transaccion, admin_headers, req)

LLAVE = base64.urlsafe_b64encode(os.urandom(32)).decode()

ENTORNO = {"url": "https://44neoluck.xyz", "code": "cod-env",
           "secret": "secreto-env", "monedas": "ARS,COP"}


# ── La regla de resolución, sin base ──────────────────────────────

def test_sin_fila_el_entorno_sigue_valiendo():
    """Riesgo: mudar a la tabla y dejar a producción sin proveedor porque
    todavía no hay fila."""
    p = rp.armar_proveedor("44neoluck", None, None, ENTORNO)

    assert p.completo()
    assert (p.url, p.api_code, p.api_secret) == (
        "https://44neoluck.xyz", "cod-env", "secreto-env")
    assert p.monedas == ("ARS", "COP")
    assert p.origen == "entorno"
    assert p.adaptador == "neoluck"


def test_la_fila_gana_sobre_el_entorno():
    """Riesgo: que la pantalla de admin guarde un valor y el sistema siga
    usando el viejo de Railway."""
    fila = {"activa": True, "url": "https://otra.example/", "api_code": "cod-fila",
            "monedas": "USD", "adaptador": "neoluck", "ips_permitidas": []}

    p = rp.armar_proveedor("44neoluck", fila, "secreto-fila", ENTORNO)

    assert (p.url, p.api_code, p.api_secret) == (
        "https://otra.example", "cod-fila", "secreto-fila")
    assert p.monedas == ("USD",)
    assert p.origen == "base"


def test_campo_a_campo_lo_que_la_fila_no_trae_lo_completa_el_entorno():
    fila = {"activa": True, "url": "https://otra.example", "api_code": None,
            "monedas": None}

    p = rp.armar_proveedor("44neoluck", fila, None, ENTORNO)

    assert p.url == "https://otra.example"
    assert p.api_code == "cod-env"
    assert p.api_secret == "secreto-env"


def test_el_entorno_no_se_mezcla_con_otro_proveedor():
    """Riesgo: la URL de la fila de Atomic con la clave de 44neoluck."""
    assert rp.armar_proveedor("atomic", None, None, ENTORNO) is None

    fila = {"activa": True, "url": "https://api-slots.network/api"}
    p = rp.armar_proveedor("atomic", fila, None, ENTORNO)
    assert p.api_secret == "" and p.api_code == "" and not p.completo()


def test_sin_fila_ni_variables_no_hay_proveedor():
    vacio = {"url": "", "code": "", "secret": "", "monedas": "ARS"}
    assert rp.armar_proveedor("44neoluck", None, None, vacio) is None


def test_una_fila_apagada_se_ve_apagada():
    fila = {"activa": False, "url": "https://x.example"}
    assert rp.armar_proveedor("44neoluck", fila, None, ENTORNO).activa is False


# ── Con la API: cifrado, caché e invalidación ─────────────────────

class FakeConnIntegraciones:
    def __init__(self, filas=None):
        self.filas = dict(filas or {})
        self.lecturas = 0
        self.execute_calls = []

    def transaction(self):
        return _Transaccion()

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT * FROM casino_integraciones WHERE codigo=$1"):
            self.lecturas += 1
            return self.filas.get(args[0])
        if q.startswith("SELECT api_code, api_secret, api_secret_cifrado"):
            f = self.filas.get(args[0])
            return f and {k: f.get(k) for k in (
                "api_code", "api_secret", "api_secret_cifrado",
                "adaptador", "ips_permitidas")}
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def execute(self, query, *args):
        q = " ".join(query.split())
        self.execute_calls.append((q, args))
        if q.startswith("INSERT INTO casino_integraciones"):
            (codigo, nombre, activa, url, api_code, api_secret, cifrado,
             monedas, prioridad, notas, adaptador, ips) = args
            self.filas[codigo] = {
                "codigo": codigo, "nombre": nombre, "activa": activa,
                "url": url, "api_code": api_code, "api_secret": api_secret,
                "api_secret_cifrado": cifrado, "monedas": monedas,
                "prioridad": prioridad, "notas": notas,
                "adaptador": adaptador, "ips_permitidas": ips}
            return
        raise AssertionError(f"execute inesperado: {q}")


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    for var in ("PROVEEDOR_URL", "PROVEEDOR_CODE", "PROVEEDOR_SECRET",
                "PROVEEDOR_MONEDAS"):
        monkeypatch.delenv(var, raising=False)
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


def usar(api, monkeypatch, conn):
    async def fake_get_db():
        return FakePool(conn)
    monkeypatch.setattr(api, "get_db", fake_get_db)


def con_entorno(api, monkeypatch):
    monkeypatch.setattr(api, "PROVEEDOR_URL", "https://44neoluck.xyz")
    monkeypatch.setattr(api, "PROVEEDOR_CODE", "cod-env")
    monkeypatch.setattr(api, "PROVEEDOR_SECRET", "secreto-env")


def test_sin_fila_el_diagnostico_y_el_catalogo_usan_el_entorno(api, monkeypatch):
    """Riesgo: que `/diagnostico` y `_traer_juegos` cambien de conducta al
    pasar por el registro."""
    con_entorno(api, monkeypatch)
    usar(api, monkeypatch, FakeConnIntegraciones())
    visto = {}

    class Resp:
        status_code = 200
        text = ""
        def json(self):
            return {"games": [{"id": "1"}]}

    class Cliente:
        def __init__(self, *a, **k): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *a): return False
        async def get(self, url, headers=None):
            visto["url"], visto["code"] = url, headers["X-Code"]
            return Resp()

    monkeypatch.setattr(api.httpx, "AsyncClient", Cliente)

    datos = asyncio.run(api._traer_juegos(forzar=True))

    assert len(datos["games"]) == 1
    assert visto == {"url": "https://44neoluck.xyz/api/v1/games", "code": "cod-env"}


def test_guardar_cifra_la_clave_y_no_deja_copia_en_claro(api, monkeypatch):
    """Riesgo: un volcado de la base que trae la clave del proveedor."""
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnIntegraciones()
    usar(api, monkeypatch, conn)

    r = req(api.app, "POST", "/api/admin/casino/integraciones", headers=headers,
            json_body={"codigo": "44neoluck", "url": "https://44neoluck.xyz",
                       "api_code": "cod", "api_secret": "clave-super-secreta",
                       "activa": True})

    assert r.status_code == 200
    fila = conn.filas["44neoluck"]
    assert fila["api_secret"] is None
    assert "clave-super-secreta" not in fila["api_secret_cifrado"]
    assert secretos.descifrar(fila["api_secret_cifrado"]) == "clave-super-secreta"


def test_guardar_sin_clave_nueva_conserva_la_anterior(api, monkeypatch):
    """Riesgo: cambiar la prioridad borra las credenciales (el endpoint
    siempre prometió que no)."""
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnIntegraciones({"44neoluck": {
        "codigo": "44neoluck", "api_code": "cod", "api_secret": "en-claro",
        "api_secret_cifrado": None, "adaptador": "neoluck",
        "ips_permitidas": []}})
    usar(api, monkeypatch, conn)

    req(api.app, "POST", "/api/admin/casino/integraciones", headers=headers,
        json_body={"codigo": "44neoluck", "prioridad": 5})

    fila = conn.filas["44neoluck"]
    assert fila["api_secret"] == "en-claro"
    assert fila["api_code"] == "cod"
    assert fila["prioridad"] == 5


def test_una_clave_vieja_en_claro_sigue_funcionando(api):
    """Riesgo: la fila actual de 44neoluck nació con `api_secret` en claro;
    romperla corta el casino."""
    assert api._secreto_de_integracion(
        {"codigo": "44neoluck", "api_secret": "en-claro"}) == "en-claro"


def test_un_cifrado_que_no_abre_no_cae_al_texto_plano(api):
    """Riesgo: usar en silencio una clave vieja porque la nueva no se
    pudo descifrar."""
    cifrado = secretos.cifrar("nueva")
    api_key_otra = base64.urlsafe_b64encode(os.urandom(32)).decode()
    os.environ["SECRETOS_CLAVE"] = api_key_otra  # llave rotada
    try:
        assert api._secreto_de_integracion({
            "codigo": "x", "api_secret": "vieja",
            "api_secret_cifrado": cifrado}) is None
    finally:
        os.environ["SECRETOS_CLAVE"] = LLAVE


def test_un_cambio_en_el_panel_rige_sin_reiniciar(api, monkeypatch):
    """Riesgo: el caché deja vigente el valor viejo tras guardar."""
    headers = admin_headers(api, monkeypatch)
    conn = FakeConnIntegraciones()
    con_entorno(api, monkeypatch)
    usar(api, monkeypatch, conn)

    antes = asyncio.run(api._proveedor("44neoluck"))
    asyncio.run(api._proveedor("44neoluck"))
    assert antes.origen == "entorno" and conn.lecturas == 1  # cacheado

    req(api.app, "POST", "/api/admin/casino/integraciones", headers=headers,
        json_body={"codigo": "44neoluck", "url": "https://nueva.example",
                   "api_code": "cod-nuevo", "api_secret": "clave-nueva"})

    despues = asyncio.run(api._proveedor("44neoluck"))
    assert despues.origen == "base"
    assert (despues.url, despues.api_code, despues.api_secret) == (
        "https://nueva.example", "cod-nuevo", "clave-nueva")
