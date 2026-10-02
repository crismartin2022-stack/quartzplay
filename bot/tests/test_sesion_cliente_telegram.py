"""
El canje de identidad de Telegram por sesión de cliente.

La mini-app no tenía token: se identificaba con el `initData` firmado y solo
en los POST, así que los pedidos que consultan la cuenta del jugador pasaban
el `user_id` suelto. Estas pruebas fijan la llave que reemplaza a ese id: que
una firma válida devuelve un token que `requiere_cliente` acepta, que una
firma que no cierra —o que ya venció— no devuelve ninguno, y que un usuario
de Telegram sin cuenta no provoca un alta implícita. Al final está la prueba
que ata las dos mitades: que los nueve endpoints cerrados exigen exactamente
esta llave y no otra.

La firma se arma de verdad, con el mismo HMAC que usa Telegram, en vez de
reemplazar `validar_init_data` por un doble: lo que se quiere probar es que
el token sale de una identidad firmada, y un doble que devuelve `{"id": 1}`
no prueba nada de eso. Los datos son de fixture: un bot de prueba y dos
jugadores inventados.
"""
import asyncio
import hashlib
import hmac
import importlib
import json
import time
import urllib.parse

import httpx
import pytest

from test_runtime_config import settings


BOT_TOKEN = settings()["TELEGRAM_TOKEN"]

JUGADOR = {"id": 501, "telegram_id": 999111, "bloqueado": False}
BLOQUEADO = {"id": 502, "telegram_id": 999222, "bloqueado": True}


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


async def _post(app, path, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        return await client.post(path, json=json_body or {})


def post(app, path, json_body=None):
    return asyncio.run(_post(app, path, json_body=json_body))


# ── El initData firmado, igual que lo arma Telegram ───────────────

def init_data(tg_id, bot_token=BOT_TOKEN, auth_date=None, romper_firma=False):
    datos = {
        "auth_date": str(int(auth_date if auth_date is not None else time.time())),
        "query_id": "AAFfixture",
        "user": json.dumps({"id": tg_id, "first_name": "Ana"}),
    }
    cadena = "\n".join(f"{k}={datos[k]}" for k in sorted(datos))
    secreto = hmac.new(b"WebAppData", bot_token.encode(), hashlib.sha256).digest()
    firma = hmac.new(secreto, cadena.encode(), hashlib.sha256).hexdigest()
    if romper_firma:
        firma = "0" * len(firma)
    return urllib.parse.urlencode({**datos, "hash": firma})


# ── Base y sesiones de mentira ────────────────────────────────────

def _normalize(query):
    return " ".join(query.split())


class FakeConnection:
    def __init__(self, usuarios):
        self.usuarios = [dict(u) for u in usuarios]

    async def fetchrow(self, query, *args):
        q = _normalize(query)
        assert q.startswith("SELECT id, bloqueado FROM users"), q
        buscado = str(args[0])
        for u in self.usuarios:
            if str(u["telegram_id"]) == buscado or str(u["id"]) == buscado:
                return {"id": u["id"], "bloqueado": u["bloqueado"]}
        return None


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


def use_fake_pool(api, monkeypatch, usuarios):
    async def fake_get_db():
        return FakePool(FakeConnection(usuarios))
    monkeypatch.setattr(api, "get_db", fake_get_db)


def forbid_db(api, monkeypatch):
    async def forbidden():
        raise AssertionError("no debería tocar la base")
    monkeypatch.setattr(api, "get_db", forbidden)


def sessions(api, monkeypatch):
    """Tabla de sesiones en memoria, la misma que leen `requiere_cliente` y
    `jugador_de_sesion` a través de `sesion_buscar`."""
    tabla = {}

    async def fake_guardar(token, quien, horas=12):
        tabla[token] = quien

    async def fake_buscar(token):
        return tabla.get(token)

    monkeypatch.setattr(api, "sesion_guardar", fake_guardar)
    monkeypatch.setattr(api, "sesion_buscar", fake_buscar)
    return tabla


# ── La llave que sirve ────────────────────────────────────────────

def test_una_firma_valida_devuelve_un_token_que_requiere_cliente_acepta(api, monkeypatch):
    tabla = sessions(api, monkeypatch)
    use_fake_pool(api, monkeypatch, [JUGADOR])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(JUGADOR["telegram_id"])})

    assert respuesta.status_code == 200
    token = respuesta.json()["token"]
    assert token
    # La prueba de fondo: la cerradura que viene después tiene que abrir con
    # esta llave y resolver al mismo jugador, no a otro.
    assert asyncio.run(api.requiere_cliente(f"Bearer {token}")) == JUGADOR["id"]
    assert tabla[token] == f"cliente:{JUGADOR['id']}"


def test_la_sesion_queda_con_el_prefijo_cliente_y_no_sirve_como_agencia(api, monkeypatch):
    tabla = sessions(api, monkeypatch)
    use_fake_pool(api, monkeypatch, [JUGADOR])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(JUGADOR["telegram_id"])})
    token = respuesta.json()["token"]

    assert tabla[token].startswith("cliente:")
    assert asyncio.run(api.jugador_de_sesion(f"Bearer {token}")) == JUGADOR["id"]


def test_la_respuesta_no_cuenta_nada_del_jugador_mas_que_la_llave(api, monkeypatch):
    sessions(api, monkeypatch)
    use_fake_pool(api, monkeypatch, [JUGADOR])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(JUGADOR["telegram_id"])})

    assert set(respuesta.json()) == {"token", "registrado"}
    assert respuesta.json()["registrado"] is True


# ── Las firmas que no se aceptan ──────────────────────────────────

def test_una_firma_invalida_se_rechaza_sin_tocar_la_base(api, monkeypatch):
    sessions(api, monkeypatch)
    forbid_db(api, monkeypatch)

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(JUGADOR["telegram_id"],
                                                       romper_firma=True)})

    assert respuesta.status_code == 401
    assert "token" not in respuesta.json()


def test_una_firma_de_otro_bot_se_rechaza(api, monkeypatch):
    """El initData de un bot cualquiera no vale: si valiera, cualquiera que
    tenga un bot podría firmar el id de Telegram que quiera."""
    sessions(api, monkeypatch)
    forbid_db(api, monkeypatch)

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(
                         JUGADOR["telegram_id"],
                         bot_token="999999:otro-bot-cualquiera")})

    assert respuesta.status_code == 401


def test_un_init_data_viejo_se_rechaza(api, monkeypatch):
    """Un initData filtrado que sirva para siempre es una sesión eterna
    regalada: alcanzaría para pedir una nueva cada vez que vence."""
    sessions(api, monkeypatch)
    forbid_db(api, monkeypatch)

    viejo = init_data(JUGADOR["telegram_id"], auth_date=time.time() - 86400 - 60)
    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": viejo})

    assert respuesta.status_code == 401


def test_sin_init_data_se_rechaza(api, monkeypatch):
    sessions(api, monkeypatch)
    forbid_db(api, monkeypatch)

    assert post(api.app, "/api/cliente/sesion/telegram",
                json_body={}).status_code == 401
    assert post(api.app, "/api/cliente/sesion/telegram",
                json_body={"init_data": ""}).status_code == 401


# ── El usuario de Telegram que todavía no tiene cuenta ────────────

def test_un_usuario_de_telegram_sin_cuenta_no_recibe_token_ni_queda_dado_de_alta(api, monkeypatch):
    """La decisión: no hay alta implícita. Se contesta `registrado: False`,
    igual que `/api/me`, y la app muestra su propio registro. Crear la cuenta
    acá en silencio haría altas que nadie pidió, con el nombre que vino en la
    firma."""
    tabla = sessions(api, monkeypatch)
    use_fake_pool(api, monkeypatch, [JUGADOR])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(123456789)})

    assert respuesta.status_code == 200
    assert respuesta.json() == {"registrado": False, "token": None}
    assert tabla == {}


def test_una_cuenta_bloqueada_no_se_lleva_una_llave_nueva(api, monkeypatch):
    tabla = sessions(api, monkeypatch)
    use_fake_pool(api, monkeypatch, [JUGADOR, BLOQUEADO])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(BLOQUEADO["telegram_id"])})

    assert respuesta.status_code == 403
    assert tabla == {}


# ── La cerradura ya está puesta ───────────────────────────────────

# Los nueve que la auditoría marcó. Recibían un `user_id` del cliente y no
# verificaban quién lo mandaba; ahora los nueve exigen la sesión.
ENDPOINTS_QUE_EXIGEN_SESION = (
    "/api/soporte/contacto",
    "/api/soporte/hilo",
    "/api/historial/{user_id}",
    "/api/historial-juegos/{user_id}",
    "/api/jugador/{user_id}/responsable",
    "/api/iacoin/saldo/{user_id}",
    "/api/p2p/mis-apuestas/{user_id}",
    "/api/compartir/mis-ganancias/{user_id}",
    "/api/superbono/mio/{user_id}",
)


def _dependencias(dependant):
    for sub in dependant.dependencies:
        yield sub.call
        yield from _dependencias(sub)


def test_la_llave_que_construye_este_canje_es_la_que_abre_los_nueve(api):
    """Esta prueba estaba invertida: exigía que NINGUNO pidiera sesión, porque
    mientras la mini-app no mandaba el token con seguridad, cerrar uno dejaba
    gente afuera. Ya la manda, y los nueve están cerrados, así que ahora
    verifica lo contrario: que los nueve pasen por `requiere_cliente`.

    Vive acá y no con los nueve a propósito: lo que fija es que la llave que
    emite el canje y la cerradura que pusieron los endpoints sean la misma
    pieza. Si alguien cerrara los nueve con otra dependencia —una que el canje
    de Telegram no sepa satisfacer— las pruebas de allá seguirían pasando y
    la mini-app quedaría afuera igual."""
    rutas = {r.path: r for r in api.app.routes if hasattr(r, "dependant")}

    for ruta in ENDPOINTS_QUE_EXIGEN_SESION:
        assert ruta in rutas, f"desapareció {ruta}: revisar la lista"
        assert api.requiere_cliente in _dependencias(rutas[ruta].dependant), \
            f"{ruta} quedó abierto: cualquiera lee la cuenta de otro"
