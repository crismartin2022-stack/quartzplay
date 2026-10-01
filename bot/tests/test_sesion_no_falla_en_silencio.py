"""Una sesión que no se guarda no puede terminar en un token entregado.

`sesion_guardar` se comía la excepción: si el INSERT en `agencia_sesiones`
fallaba, el login devolvía el token igual y la persona quedaba "adentro" con
una llave que después nadie podía validar, porque quien valida lee la base. El
error existía solo en un log.

Estas pruebas fijan lo contrario, en los cuatro lugares que emiten sesiones:
el login de agencia, el login de cliente web, el canje desde Telegram y el
registro web. En los cuatro, si la base no acepta la sesión, la respuesta no
trae token y el motivo es honesto — nunca uno que sugiera que el problema son
los datos de la persona, que ya se verificaron y están bien.

La base falla de verdad, no `sesion_guardar` reemplazado por un doble: el
INSERT de `agencia_sesiones` es el único que revienta, y el resto de las
consultas del endpoint contestan como siempre. Si el doble fuera la función
entera, la prueba no diría nada sobre si la función propaga.

Importa el armado de `initData` de `test_sesion_cliente_telegram` en vez de
copiarlo: la firma tiene que ser la misma que acepta producción, y dos copias
del HMAC se desincronizan.
"""
import asyncio
import importlib
import logging
from datetime import datetime, timedelta, timezone

import httpx
import pytest

import registro_publico
from test_runtime_config import settings
from test_sesion_cliente_telegram import init_data


CLAVE = "una-clave-que-sirve"

AGENCIA = {
    "code": "AG001",
    "username": "agencia1",
    "name": "Agencia Uno",
    "address": "Calle 1",
    "phone": "+5491100000000",
    "status": "active",
    "moneda": "ARS",
    "tipo": "agencia",
    "codigo_ref": None,
    "nivel": 0,
    "debe_cambiar_pass": False,
    "permiso": "ambos",
}

CLIENTE = {
    "id": 701,
    "telegram_id": 998877,
    "username": "jugador1",
    "nombre_completo": "Ana Pérez",
    "balance": 150000,
    "saldo_bono": 0,
    "moneda": "ARS",
    "bloqueado": False,
    "creado_por": "AG001",
    "origen_registro": "agencia",
    "telefono_verificado_at": None,
}


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    modulo = importlib.reload(importlib.import_module("casino_api"))
    # La tabla en memoria de `auth` sobrevive al reload de `casino_api`
    # (`auth` no se recarga). Si no se limpia, un token de otra prueba sigue
    # ahí y ensucia justamente lo que se quiere medir.
    modulo.auth._sessions.clear()
    return modulo


# ── La base de mentira ────────────────────────────────────────────

def _norm(query):
    return " ".join(query.split())


class FalloDeBase(RuntimeError):
    """Lo que tira asyncpg cuando la base no está: acá, solo en el INSERT de
    sesiones, para que falle exactamente el paso que se está probando."""


class FakeConnection:
    def __init__(self, *, agencias=(), usuarios=(), pendientes=(),
                 fallar_sesion=False):
        self.agencias = [dict(a) for a in agencias]
        self.usuarios = [dict(u) for u in usuarios]
        self.pendientes = [dict(p) for p in pendientes]
        self.fallar_sesion = fallar_sesion
        self.sesiones = {}
        self.altas = []
        self.proximo_id = 900

    # -- escrituras --------------------------------------------------
    async def execute(self, query, *args):
        q = _norm(query)
        if q.startswith("INSERT INTO agencia_sesiones"):
            if self.fallar_sesion:
                raise FalloDeBase("agencia_sesiones: no se pudo escribir")
            self.sesiones[args[0]] = args[1]
            return "INSERT 0 1"
        return "OK"

    # -- lecturas ----------------------------------------------------
    async def fetchrow(self, query, *args):
        q = _norm(query)

        if q.startswith("SELECT agencia_code FROM agencia_sesiones"):
            quien = self.sesiones.get(args[0])
            return {"agencia_code": quien} if quien else None

        if q.startswith("SELECT * FROM agencias WHERE username="):
            for a in self.agencias:
                if a["username"] == args[0]:
                    return dict(a)
            return None

        if q.startswith("SELECT id, username, nombre_completo, balance"):
            for u in self.usuarios:
                if u["username"].lower() == str(args[0]).lower():
                    return dict(u)
            return None

        if q.startswith("SELECT id, bloqueado FROM users"):
            buscado = str(args[0])
            for u in self.usuarios:
                if buscado in (str(u["id"]), str(u.get("telegram_id"))):
                    return {"id": u["id"], "bloqueado": u["bloqueado"]}
            return None

        if q.startswith("SELECT id, username, password_hash, nombre_completo"):
            for p in self.pendientes:
                if p["token"] == args[0]:
                    return dict(p)
            return None

        if q.startswith("INSERT INTO users"):
            nueva = {
                "id": self.proximo_id,
                "username": args[0],
                "nombre_completo": args[2],
                "balance": 0,
                "saldo_bono": 0,
                "moneda": "ARS",
                "creado_por": args[5],
                "origen_registro": "web",
                "telefono_verificado_at": None,
            }
            self.proximo_id += 1
            self.altas.append(nueva)
            return dict(nueva)

        raise AssertionError(f"consulta no prevista por la prueba: {q}")

    async def fetchval(self, query, *args):
        q = _norm(query)
        # Usuario y correo libres, y el referido no es una agencia conocida:
        # el registro sigue de largo hasta crear la cuenta.
        if q.startswith("SELECT 1 FROM users") or \
           q.startswith("SELECT code FROM agencias"):
            return None
        raise AssertionError(f"consulta no prevista por la prueba: {q}")


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


def use_fake_db(api, monkeypatch, **kwargs):
    conn = FakeConnection(**kwargs)

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(api, "get_db", fake_get_db)
    return conn


async def _post(app, path, json_body=None):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        return await client.post(path, json=json_body or {})


def post(app, path, json_body=None):
    return asyncio.run(_post(app, path, json_body=json_body))


# ── Los cuatro pedidos, con sus datos mínimos ─────────────────────

def agencia_fixture(api):
    return dict(AGENCIA, password_hash=api.auth.hash_password(CLAVE))


def cliente_fixture(api):
    return dict(CLIENTE, password_hash=api.auth.hash_password(CLAVE))


def pendiente_fixture(api, codigo="123456", token="pend-token"):
    return {
        "id": 55,
        "token": token,
        "username": "nuevo1",
        "password_hash": api.auth.hash_password(CLAVE),
        "nombre_completo": "Nuevo Jugador",
        "email": "nuevo@example.test",
        "email_normalizado": "nuevo@example.test",
        "telefono": "+5491199999999",
        "referido_code": "",
        "ip": "203.0.113.7",
        "codigo_hash": registro_publico.hash_codigo(
            codigo, token, api.CODIGO_SECRETO),
        "intentos": 0,
        "expira_at": datetime.now(timezone.utc) + timedelta(minutes=10),
    }


# Los cuatro emisores, cada uno con lo que necesita para llegar justo hasta
# el momento de guardar la sesión. La forma de la tupla:
# (nombre legible, función que hace el pedido con la base ya fallando).

def _pedido_agencia(api, monkeypatch):
    use_fake_db(api, monkeypatch, agencias=[agencia_fixture(api)],
                fallar_sesion=True)
    return post(api.app, "/api/agencias/login",
                json_body={"username": AGENCIA["username"], "password": CLAVE})


def _pedido_cliente_web(api, monkeypatch):
    use_fake_db(api, monkeypatch, usuarios=[cliente_fixture(api)],
                fallar_sesion=True)
    return post(api.app, "/api/cliente/login",
                json_body={"username": CLIENTE["username"], "password": CLAVE})


def _pedido_telegram(api, monkeypatch):
    use_fake_db(api, monkeypatch, usuarios=[cliente_fixture(api)],
                fallar_sesion=True)
    return post(api.app, "/api/cliente/sesion/telegram",
                json_body={"init_data": init_data(CLIENTE["telegram_id"])})


def _pedido_registro_web(api, monkeypatch):
    use_fake_db(api, monkeypatch, pendientes=[pendiente_fixture(api)],
                fallar_sesion=True)
    return post(api.app, "/api/cliente/registro/confirmar",
                json_body={"pendiente": "pend-token", "codigo": "123456"})


EMISORES = [
    pytest.param(_pedido_agencia, id="login-de-agencia"),
    pytest.param(_pedido_cliente_web, id="login-de-cliente-web"),
    pytest.param(_pedido_telegram, id="canje-desde-telegram"),
    pytest.param(_pedido_registro_web, id="registro-web"),
]


# ── La prueba que importa: ninguno entrega una llave muerta ───────

@pytest.mark.parametrize("pedido", EMISORES)
def test_si_la_sesion_no_se_guarda_no_se_devuelve_token(pedido, api, monkeypatch):
    """El token que no quedó en la base no abre nada: quien valida lee
    `agencia_sesiones`. Devolverlo deja a la persona creyendo que entró."""
    respuesta = pedido(api, monkeypatch)

    assert respuesta.status_code == 503, respuesta.text
    cuerpo = respuesta.json()
    assert "token" not in cuerpo, f"entregó una llave muerta: {cuerpo}"
    assert not any("token" in str(k).lower() for k in cuerpo)


@pytest.mark.parametrize("pedido", EMISORES)
def test_el_motivo_no_culpa_a_los_datos_de_la_persona(pedido, api, monkeypatch):
    """Las credenciales ya se verificaron: están bien. Un mensaje de clave
    incorrecta o de cuenta bloqueada la manda a arreglar algo que no está
    roto, y a perder el rato."""
    respuesta = pedido(api, monkeypatch)
    detalle = respuesta.json()["detail"].lower()

    assert "sesión" in detalle or "sesion" in detalle
    for mentira in ("contraseña", "clave incorrect", "usuario o", "bloquead",
                    "incorrect", "inválid", "invalid"):
        assert mentira not in detalle, f"culpa a la persona: {detalle}"
    # Y tiene que decirle qué hacer, no solo que algo falló.
    assert "probá" in detalle or "entrá" in detalle


@pytest.mark.parametrize("pedido", EMISORES)
def test_el_motivo_real_queda_en_el_log(pedido, api, monkeypatch, caplog):
    """Lo que no se le cuenta a la persona tiene que estar en el log, o el
    fallo vuelve a ser invisible para quien lo puede arreglar."""
    with caplog.at_level(logging.ERROR):
        pedido(api, monkeypatch)

    assert any("agencia_sesiones" in r.getMessage() for r in caplog.records), \
        [r.getMessage() for r in caplog.records]


def test_el_registro_web_manda_al_login_porque_la_cuenta_ya_existe(api, monkeypatch):
    """Los otros tres pueden decir "probá de nuevo". Acá no: la cuenta quedó
    creada y el pendiente borrado, así que registrarse otra vez choca con
    "ese usuario ya está tomado" y la persona cree que perdió el alta."""
    respuesta = _pedido_registro_web(api, monkeypatch)
    detalle = respuesta.json()["detail"]

    assert respuesta.status_code == 503
    assert "creada" in detalle
    assert "usuario y clave" in detalle


# ── La función, aparte de los endpoints ───────────────────────────

def test_sesion_guardar_lanza_en_vez_de_tragarse_el_error(api, monkeypatch):
    async def base_caida():
        raise FalloDeBase("no hay base")

    monkeypatch.setattr(api, "get_db", base_caida)

    with pytest.raises(api.SesionNoGuardada) as caso:
        asyncio.run(api.sesion_guardar("t-1", "cliente:9"))
    # 503 y no 401: el problema es la base, no quién pide.
    assert caso.value.status_code == 503


def test_sesion_guardar_vuelve_normal_cuando_la_base_acepta(api, monkeypatch):
    conn = use_fake_db(api, monkeypatch)

    asyncio.run(api.sesion_guardar("t-2", "cliente:9"))

    assert conn.sesiones["t-2"] == "cliente:9"


# ── `requiere_cliente` valida contra la base ──────────────────────

def test_requiere_cliente_acepta_un_token_recien_emitido(api, monkeypatch):
    """El camino completo: el canje emite la llave, `sesion_guardar` la deja
    en la base y `requiere_cliente` la lee de ahí y resuelve al jugador."""
    conn = use_fake_db(api, monkeypatch, usuarios=[cliente_fixture(api)])

    respuesta = post(api.app, "/api/cliente/sesion/telegram",
                     json_body={"init_data": init_data(CLIENTE["telegram_id"])})

    token = respuesta.json()["token"]
    assert conn.sesiones[token] == f"cliente:{CLIENTE['id']}"
    assert asyncio.run(api.requiere_cliente(f"Bearer {token}")) == CLIENTE["id"]


def test_requiere_cliente_no_abre_con_un_token_que_solo_esta_en_memoria(api, monkeypatch):
    """Acá vivía un `auth.verify_session` que nunca existió, así que esto es
    lo que ya pasaba. Queda fijado a propósito: una caché positiva en memoria
    haría que un token revocado siguiera abriendo hasta vencer solo, y con
    varias réplicas la baja en una no llegaría a las otras."""
    use_fake_db(api, monkeypatch)

    # Token legítimo de `auth`, pero nunca persistido.
    token = api.auth.create_session(f"cliente:{CLIENTE['id']}")
    assert token in api.auth._sessions

    with pytest.raises(api.HTTPException) as caso:
        asyncio.run(api.requiere_cliente(f"Bearer {token}"))
    assert caso.value.status_code == 401


def test_requiere_cliente_no_acepta_una_sesion_de_agencia(api, monkeypatch):
    """Sin el prefijo `cliente:` no es un jugador. Si pasara, una agencia
    entraría a los endpoints del jugador con su propia sesión."""
    conn = use_fake_db(api, monkeypatch)
    asyncio.run(api.sesion_guardar("t-agencia", AGENCIA["code"]))
    assert conn.sesiones["t-agencia"] == AGENCIA["code"]

    with pytest.raises(api.HTTPException) as caso:
        asyncio.run(api.requiere_cliente("Bearer t-agencia"))
    assert caso.value.status_code == 401
