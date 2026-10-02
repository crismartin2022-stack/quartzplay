"""`/api/imprimir` es la cuarta puerta: valida la sesión a mano.

El arreglo de `requiere_agencia` —un token de jugador no sirve como token de
agencia, ver `test_token_de_jugador_no_es_token_de_agencia`— no llegaba acá.
`registrar_impresion` no usa esa dependencia: acepta la clave de admin O una
sesión de agencia, así que un `Depends(requiere_agencia)` a secas le cerraría
la puerta al admin, y por eso valida a mano.

Autenticar sí autenticaba: sin token da 401. Lo que no miraba es la CLASE de
sesión. `sesion_buscar` devuelve el code tal cual está guardado, incluido
`"cliente:701"`, y el endpoint lo escribía en `impresiones_log.agencia_code` y
en `.quien` como si fuera una agencia.

La prueba que importa es la de la fila: el daño no era que el jugador recibiera
un `{"ok": true}` —eso no le sirve de nada—, era la fila sucia. El historial de
impresiones se lee en cascada por `agencia_code` y nadie lo borra, así que una
fila a nombre de un code que no existe cuenta impresiones de nadie para
siempre. Por eso cada prueba de rechazo mira también que `impresiones_log`
quedó vacío, y no solo el código de estado.

El doble de la base es el de `test_token_de_jugador_no_es_token_de_agencia`,
más la tabla donde se escribe: respeta `expira_at` y guarda los INSERT para
poder contarlos.
"""
import asyncio
import importlib
import json
from datetime import datetime, timedelta, timezone

import pytest

from test_runtime_config import settings


AGENCIA = "AG001"
JUGADOR = 701
# Lo que `/api/cliente/login` guarda para un jugador: el prefijo y su id.
SESION_DE_JUGADOR = f"cliente:{JUGADOR}"
CLAVE_ADMIN = "test-admin-key"


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
    api = importlib.reload(importlib.import_module("casino_api"))
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", CLAVE_ADMIN)
    return api


class FakeConnection:
    """`agencia_sesiones` para entrar y `impresiones_log` para ver qué quedó
    escrito. Son las dos únicas tablas que toca este endpoint."""

    def __init__(self):
        self.sesiones = {}              # token -> (agencia_code, expira_at)
        self.impresiones = []           # las filas que se insertaron

    def poner_sesion(self, token, code, horas=8):
        self.sesiones[token] = (code, _ahora() + timedelta(hours=horas))

    async def fetchrow(self, query, *args):
        q = _norm(query)
        if q.startswith("SELECT agencia_code FROM agencia_sesiones"):
            fila = self.sesiones.get(args[0])
            if not fila or fila[1] <= _ahora():
                return None
            return {"agencia_code": fila[0]}
        raise AssertionError(f"consulta no prevista por la prueba: {q}")

    async def execute(self, query, *args):
        q = _norm(query)
        if q.startswith("INSERT INTO impresiones_log"):
            tipo, referencia, agencia_code, quien, detalle = args
            self.impresiones.append({
                "tipo": tipo, "referencia": referencia,
                "agencia_code": agencia_code, "quien": quien,
                "detalle": detalle,
            })
            return "INSERT 0 1"
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


def _pedido(headers, body):
    """El `Request` real de Starlette, con cuerpo: el endpoint lo lee con
    `await request.json()` y las cabeceras con `request.headers.get`."""
    from starlette.requests import Request

    crudo = json.dumps(body).encode()

    async def receive():
        return {"type": "http.request", "body": crudo, "more_body": False}

    return Request({
        "type": "http", "method": "POST", "path": "/api/imprimir",
        "headers": [(k.lower().encode(), v.encode())
                    for k, v in headers.items()],
    }, receive)


def imprimir(api, headers, body=None):
    """Lo que corre cuando alguien pide `POST /api/imprimir`."""
    body = {"tipo": "ticket", "referencia": "T-1"} if body is None else body
    return asyncio.run(api.registrar_impresion(_pedido(headers, body)))


# ── El cruce que estaba abierto ───────────────────────────────────

def test_un_token_de_jugador_no_registra_una_impresion(api, monkeypatch):
    """La prueba de fondo, y la que mira el daño real.

    Antes esto devolvía `{"ok": true}` y dejaba una fila con
    `agencia_code = "cliente:701"`. Que ahora corte con 403 importa menos que
    el `impresiones_log` vacío: la fila no se puede deshacer."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as caso:
        imprimir(api, {"Authorization": "Bearer t-jugador"})

    assert caso.value.status_code == 403
    assert conn.impresiones == []


def test_el_rechazo_usa_el_mismo_403_que_la_puerta_de_las_agencias(
        api, monkeypatch):
    """El mismo código que eligió el arreglo de `requiere_agencia`, no uno
    nuevo.

    Las dos puertas rechazan lo mismo por la misma razón, y el frontend no
    tiene por qué distinguir en qué endpoint le pasó: si una diera 401 y la
    otra 403, la mini-app pediría sesión nueva en una y no en la otra. Se
    comparan contra la otra puerta y no contra el número escrito a mano para
    que el día que el 403 cambie, cambien juntas o caiga esta prueba."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as por_imprimir:
        imprimir(api, {"Authorization": "Bearer t-jugador"})
    with pytest.raises(api.HTTPException) as por_la_dependencia:
        asyncio.run(api.requiere_agencia("Bearer t-jugador"))

    assert por_imprimir.value.status_code == \
        por_la_dependencia.value.status_code
    assert por_imprimir.value.detail


def test_el_403_del_cruce_se_distingue_del_401_de_no_tener_sesion(
        api, monkeypatch):
    """Son dos problemas distintos y el frontend hace dos cosas distintas.

    El 401 es "no te pudimos identificar, pedí sesión y repetí". Si el token de
    un jugador diera 401, volvería a entrar con su clave correcta y chocaría
    contra el mismo 401 para siempre. El 403 dice que la sesión está bien y la
    puerta no es la suya."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    with pytest.raises(api.HTTPException) as cruce:
        imprimir(api, {"Authorization": "Bearer t-jugador"})
    with pytest.raises(api.HTTPException) as sin_fila:
        imprimir(api, {"Authorization": "Bearer t-que-no-existe"})

    assert cruce.value.status_code == 403
    assert sin_fila.value.status_code == 401
    assert conn.impresiones == []


def test_el_prefijo_se_mira_entero_no_el_id(api, monkeypatch):
    """Cualquier jugador, no solo el de la prueba: lo que cierra la puerta es
    el prefijo, así que el id que venga detrás no cambia nada."""
    conn = use_fake_db(api, monkeypatch)
    for token, code in (("t-1", "cliente:1"),
                        ("t-grande", "cliente:999999"),
                        ("t-raro", "cliente:")):
        conn.poner_sesion(token, code)
        with pytest.raises(api.HTTPException) as caso:
            imprimir(api, {"Authorization": f"Bearer {token}"})
        assert caso.value.status_code == 403, code
    assert conn.impresiones == []


# ── Lo que tiene que seguir entrando ──────────────────────────────

def test_una_agencia_sigue_registrando_su_impresion(api, monkeypatch):
    """El guardia del arreglo: cerrar el cruce no puede cerrarle la puerta a
    quien sí es una agencia. Un chequeo escrito al revés —rechazar lo que NO
    tiene el prefijo— pasaría todo lo de arriba y rompería la impresión de
    tickets en todas las agencias."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-agencia", AGENCIA)

    assert imprimir(api, {"Authorization": "Bearer t-agencia"}) == {"ok": True}
    assert len(conn.impresiones) == 1
    assert conn.impresiones[0]["agencia_code"] == AGENCIA
    assert conn.impresiones[0]["quien"] == AGENCIA


def test_un_code_de_agencia_que_contiene_cliente_sigue_entrando(
        api, monkeypatch):
    """Lo que decide es el prefijo, no que la palabra aparezca: un
    `"cliente" in code` dejaría afuera a una agencia llamada `AGCLIENTES`."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-nombre", "AGCLIENTES")

    assert imprimir(api, {"Authorization": "Bearer t-nombre"}) == {"ok": True}
    assert conn.impresiones[0]["agencia_code"] == "AGCLIENTES"


def test_la_clave_de_admin_sigue_abriendo_sin_sesion(api, monkeypatch):
    """La razón por la que este endpoint valida a mano.

    El admin entra con `X-Admin-Key` y sin ningún Bearer. Si el arreglo se
    hubiera hecho colgando `Depends(requiere_agencia)` del endpoint, esta
    prueba caería con 401 y el panel de admin se quedaría sin registrar
    impresiones. La fila del admin va con `agencia_code = None` a propósito:
    la impresión no es de ninguna agencia."""
    conn = use_fake_db(api, monkeypatch)

    assert imprimir(api, {"X-Admin-Key": CLAVE_ADMIN}) == {"ok": True}
    assert conn.impresiones[0]["agencia_code"] is None
    assert conn.impresiones[0]["quien"] == "admin"


def test_sin_credencial_sigue_siendo_401_y_no_escribe(api, monkeypatch):
    """Lo que ya funcionaba antes del arreglo y tiene que seguir: sin token y
    sin clave de admin no entra nadie."""
    conn = use_fake_db(api, monkeypatch)

    with pytest.raises(api.HTTPException) as caso:
        imprimir(api, {})

    assert caso.value.status_code == 401
    assert conn.impresiones == []


def test_una_clave_de_admin_equivocada_no_pasa_por_la_puerta_del_admin(
        api, monkeypatch):
    """La clave mal no es "entrar como agencia sin token": cae al otro camino,
    que sin Bearer corta con 401. Sin esto, un `es_admin` mal escrito podría
    dejar pasar cualquier valor en la cabecera."""
    conn = use_fake_db(api, monkeypatch)

    with pytest.raises(api.HTTPException) as caso:
        imprimir(api, {"X-Admin-Key": "no-es-la-clave"})

    assert caso.value.status_code == 401
    assert conn.impresiones == []


# ── La regla, compartida ──────────────────────────────────────────

def test_las_dos_puertas_usan_el_mismo_chequeo(api, monkeypatch):
    """Que la regla esté en un solo lugar es parte del arreglo, no estética.

    Este agujero existió porque el chequeo del prefijo estaba escrito dentro de
    `requiere_agencia` y el endpoint que valida a mano no lo tenía. Con dos
    copias, la próxima vez que la regla cambie —otro prefijo, otra clase de
    sesión— una de las dos se queda vieja y nadie se entera hasta que aparece
    otra fila sucia."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-jugador", SESION_DE_JUGADOR)

    def siempre_pasa(code):
        return code

    monkeypatch.setattr(api, "exigir_sesion_de_agencia", siempre_pasa)

    # Con el chequeo compartido anulado, las dos puertas se abren: la del
    # `Depends` y la que valida a mano. Eso es lo que prueba que miran la
    # misma función y no dos copias.
    assert asyncio.run(
        api.requiere_agencia("Bearer t-jugador")) == SESION_DE_JUGADOR
    assert imprimir(api, {"Authorization": "Bearer t-jugador"}) == {"ok": True}
    assert conn.impresiones[0]["agencia_code"] == SESION_DE_JUGADOR
