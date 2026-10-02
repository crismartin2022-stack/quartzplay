"""Un token de jugador no abre un endpoint de agencia.

Las dos clases de sesión que tiene esta API guardan su token en la misma
tabla, `agencia_sesiones`, y se distinguen por un prefijo en la columna
`agencia_code`: una agencia guarda su código a secas (`"AG001"`), un
jugador guarda `"cliente:701"`.

`requiere_cliente` miraba el prefijo y `requiere_agencia` no, así que el
cruce era de una sola dirección: un jugador mandaba su token a un endpoint
de agencia, pasaba la validación, y el endpoint recibía
`agencia_code = "cliente:701"` como si fuera el código de su agencia.

En la mayoría de los endpoints el cruce moría solo —ninguna agencia se
llama así, y una consulta por ese code no devuelve nada—, y por eso el
agujero no se veía: el jugador recibía 403 o 404 y parecía cerrado. Los que
sí lo sentían son los que ESCRIBEN el code sin verificar antes contra
`agencias`: dejaban filas a nombre de nadie, como una terminal con
`agencia_code = "cliente:701"`.

Estas pruebas fijan las dos direcciones a la vez, a propósito. La mitad que
ya funcionaba —una agencia no entra a un endpoint de jugador— está acá
porque el arreglo es su espejo, y si alguien unifica los dos chequeos en
uno, o cambia el prefijo, tiene que ver las dos caer juntas y no solo la
nueva.

El doble de la base es el mismo de `test_sesion_de_agencia_se_puede_revocar`
y respeta `expira_at`: si no mirara la fecha, una prueba de vencimiento no
diría nada.
"""
import asyncio
import importlib
from datetime import datetime, timedelta, timezone

import pytest

from test_runtime_config import settings


AGENCIA = "AG001"
JUGADOR = 701
# Lo que `/api/cliente/login` guarda para un jugador: el prefijo y su id.
SESION_DE_JUGADOR = f"cliente:{JUGADOR}"


def _ahora():
    return datetime.now(timezone.utc)


def _norm(query):
    return " ".join(query.split())


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


class FakeConnection:
    """`agencia_sesiones` y nada más: es la única tabla que tocan los dos
    guardias que se prueban acá."""

    def __init__(self):
        self.filas = {}                 # token -> (agencia_code, expira_at)

    def poner_sesion(self, token, code, horas=8):
        self.filas[token] = (code, _ahora() + timedelta(hours=horas))

    async def fetchrow(self, query, *args):
        q = _norm(query)
        if q.startswith("SELECT agencia_code FROM agencia_sesiones"):
            fila = self.filas.get(args[0])
            if not fila or fila[1] <= _ahora():
                return None
            return {"agencia_code": fila[0]}
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


def use_fake_db(api, monkeypatch):
    conn = FakeConnection()

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(api, "get_db", fake_get_db)
    return conn


def puerta_de_agencia(api, token):
    """Lo que corre en cada endpoint `/api/agencias/me/...`."""
    return asyncio.run(api.requiere_agencia(f"Bearer {token}"))


def puerta_de_jugador(api, token):
    """Lo que corre en cada endpoint del jugador."""
    return asyncio.run(api.requiere_cliente(f"Bearer {token}"))


# ── El cruce que estaba abierto ───────────────────────────────────

def test_un_token_de_jugador_no_abre_un_endpoint_de_agencia(api, monkeypatch):
    """La prueba de fondo. Antes esto devolvía `"cliente:701"` y el endpoint
    seguía adelante tratándolo como el código de una agencia."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as caso:
        puerta_de_agencia(api, "t-jugador")
    assert caso.value.status_code == 403


def test_el_rechazo_es_403_y_no_un_500(api, monkeypatch):
    """Que corte no alcanza: tiene que cortar a propósito.

    Un 500 diría que el chequeo está pero que algo revienta en el camino, y
    en producción se vería como "la app está caída" en vez de "esta
    credencial no es para acá". El `detail` también se mira: un
    `HTTPException` sin mensaje deja al frontend sin nada que mostrar."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as caso:
        puerta_de_agencia(api, "t-jugador")
    assert caso.value.status_code == 403
    assert caso.value.detail


def test_el_403_se_distingue_del_401_de_una_sesion_vencida(api, monkeypatch):
    """Son dos problemas distintos y el frontend hace dos cosas distintas.

    El 401 es "no te pudimos identificar": la mini-app pide sesión nueva y
    repite el pedido. Si el token de un jugador diera 401, volvería a entrar
    con su clave correcta y chocaría contra el mismo 401 para siempre. El
    403 dice que la sesión está bien y la puerta no es la suya."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as cruce:
        puerta_de_agencia(api, "t-jugador")

    with pytest.raises(api.HTTPException) as sin_fila:
        puerta_de_agencia(api, "t-que-no-existe")

    assert cruce.value.status_code == 403
    assert sin_fila.value.status_code == 401
    assert cruce.value.status_code != sin_fila.value.status_code


def test_el_prefijo_se_mira_entero_no_el_id(api, monkeypatch):
    """Cualquier jugador, no solo el de la prueba: lo que cierra la puerta
    es el prefijo, así que el id que venga detrás no cambia nada."""
    conn = use_fake_db(api, monkeypatch)
    for token, code in (("t-1", "cliente:1"),
                        ("t-grande", "cliente:999999"),
                        ("t-raro", "cliente:")):
        conn.poner_sesion(token, code)
        with pytest.raises(api.HTTPException) as caso:
            puerta_de_agencia(api, token)
        assert caso.value.status_code == 403, code


# ── Lo que tiene que seguir entrando ──────────────────────────────

def test_un_token_de_agencia_sigue_abriendo_un_endpoint_de_agencia(
        api, monkeypatch):
    """El guardia del arreglo: cerrar el cruce no puede cerrarle la puerta a
    quien sí es una agencia. Un chequeo escrito al revés —rechazar lo que
    NO tiene el prefijo— pasaría las tres pruebas de arriba y rompería
    todos los endpoints de agencia en producción."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-agencia", AGENCIA)

    assert puerta_de_agencia(api, "t-agencia") == AGENCIA


def test_un_code_de_agencia_que_contiene_cliente_sigue_abriendo(
        api, monkeypatch):
    """Lo que decide es el prefijo, no que la palabra aparezca.

    Un `"cliente" in code` dejaría afuera a una agencia que se llamara
    `AGCLIENTES`, y el error se vería en producción como una agencia real que
    de golpe no puede entrar."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-nombre", "AGCLIENTES")

    assert puerta_de_agencia(api, "t-nombre") == "AGCLIENTES"


# ── La mitad que ya funcionaba ────────────────────────────────────

def test_un_token_de_agencia_sigue_sin_abrir_un_endpoint_de_jugador(
        api, monkeypatch):
    """Esta dirección ya estaba cerrada y la prueba está acá para que siga.

    El arreglo es el espejo de este chequeo. Si alguien junta los dos en una
    función compartida, o cambia el prefijo, tiene que ver caer las dos
    direcciones juntas y no solo la que se agregó."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-agencia", AGENCIA)

    with pytest.raises(api.HTTPException) as caso:
        puerta_de_jugador(api, "t-agencia")
    assert caso.value.status_code == 401


def test_un_token_de_jugador_sigue_abriendo_un_endpoint_de_jugador(
        api, monkeypatch):
    """La otra mitad del espejo: el jugador entra donde le corresponde.

    Sin esto, un chequeo que rechazara el prefijo en los DOS guardias
    pasaría todo lo demás y dejaría al jugador sin su propia app."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    assert puerta_de_jugador(api, "t-jugador") == JUGADOR


def test_jugador_de_sesion_tampoco_acepta_una_agencia(api, monkeypatch):
    """El tercer lugar que mira el prefijo. No lanza —el llamador decide—,
    pero tiene que coincidir con los otros dos: si los tres no dicen lo
    mismo, hay un cuarto camino de entrada esperando."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-agencia", AGENCIA)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    assert asyncio.run(
        api.jugador_de_sesion("Bearer t-agencia")) is None
    assert asyncio.run(
        api.jugador_de_sesion("Bearer t-jugador")) == JUGADOR
