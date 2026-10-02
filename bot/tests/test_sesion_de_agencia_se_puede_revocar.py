"""Dar de baja la sesión de una agencia la desaloja, y en el acto.

`requiere_agencia` leía la sesión de la base y después la volvía a escribir
en `auth._sessions` con el reloj en cero. Borrar la fila no echaba a nadie:
el token seguía abriendo hasta ocho horas más, y cada vez que volvía a caer
a la base el reloj arrancaba de nuevo, así que una sesión en uso no vencía
nunca. Con varias réplicas era peor: la baja ocurría en una, y en las otras
la sesión seguía viva.

Pesa más que la del jugador. Las agencias cargan saldo, cobran y ven
cuentas: mueven la plata de los jugadores. Una sesión que no se puede
revocar ahí es la que hay que poder cortar primero.

Estas pruebas están escritas para ponerse rojas si alguien vuelve a poner
la caché, que es el único motivo por el que estaría tentado: un token que
solo se emitió no abre, el borrado se siente en el pedido siguiente sin
esperar ningún TTL, y cada pedido vuelve a preguntarle a la base. También
fijan el reloj único y que las vencidas se borren, porque las dos cosas se
caen si la caché vuelve.

La tabla de mentira respeta `expira_at` de verdad: el INSERT lo calcula, el
SELECT descarta lo vencido y el DELETE de la purga se lleva eso mismo. Si el
doble no mirara la fecha, las pruebas de vencimiento no dirían nada.
"""
import asyncio
import importlib
from datetime import datetime, timedelta, timezone

import pytest

from test_runtime_config import settings


AGENCIA = "AG001"


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


# ── `agencia_sesiones`, con su vencimiento ────────────────────────

class FakeConnection:
    def __init__(self):
        self.filas = {}                 # token -> (agencia_code, expira_at)
        self.inserts = []
        self.lecturas_de_sesion = 0
        self.purgas = []

    # -- lo que hace la prueba, no la API -----------------------------
    def poner_sesion(self, token, code=AGENCIA, horas=8):
        self.filas[token] = (code, _ahora() + timedelta(hours=horas))

    def poner_sesion_vencida(self, token, code=AGENCIA, dias=40):
        self.filas[token] = (code, _ahora() - timedelta(days=dias))

    def revocar(self, token):
        """Lo mismo que un `DELETE FROM agencia_sesiones WHERE token = $1`:
        sacar al que no tiene que entrar más."""
        self.filas.pop(token, None)

    # -- escrituras ---------------------------------------------------
    async def execute(self, query, *args):
        q = _norm(query)
        if q.startswith("INSERT INTO agencia_sesiones"):
            token, code, horas = args
            self.inserts.append((token, code, horas))
            self.filas[token] = (code,
                                 _ahora() + timedelta(hours=int(horas)))
            return "INSERT 0 1"
        if q == "DELETE FROM agencia_sesiones WHERE expira_at <= NOW()":
            vencidos = [t for t, (_, exp) in self.filas.items()
                        if exp <= _ahora()]
            for t in vencidos:
                del self.filas[t]
            self.purgas.append(vencidos)
            return f"DELETE {len(vencidos)}"
        raise AssertionError(f"consulta no prevista por la prueba: {q}")

    # -- lecturas -----------------------------------------------------
    async def fetchrow(self, query, *args):
        q = _norm(query)
        if q.startswith("SELECT agencia_code FROM agencia_sesiones"):
            self.lecturas_de_sesion += 1
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


def abrir(api, token):
    """Un pedido de agencia con ese token. Devuelve el código, o lanza."""
    return asyncio.run(api.requiere_agencia(f"Bearer {token}"))


# ── La baja es inmediata ──────────────────────────────────────────

def test_un_token_vigente_abre(api, monkeypatch):
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-viva")

    assert abrir(api, "t-viva") == AGENCIA


def test_borrar_la_fila_cierra_la_sesion_en_el_pedido_siguiente(api, monkeypatch):
    """La prueba de fondo, y sin viajar en el tiempo: la sesión abre, se da
    de baja, y el pedido siguiente ya no entra. Ningún TTL de por medio.

    Con la caché en memoria este era el agujero: el segundo pedido no
    llegaba a la base y contestaba con la copia, hasta ocho horas más."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-revocada")
    assert abrir(api, "t-revocada") == AGENCIA

    conn.revocar("t-revocada")

    with pytest.raises(api.HTTPException) as caso:
        abrir(api, "t-revocada")
    assert caso.value.status_code == 401


def test_un_token_que_solo_se_emitio_no_abre(api, monkeypatch):
    """El mismo razonamiento que en `requiere_cliente`: emitir no es
    registrar. `auth.create_session` solo genera el token; si no quedó en
    la base, no hay sesión. Esta es la prueba que se pone roja si alguien
    vuelve a guardar sesiones en memoria y a validarlas desde ahí."""
    use_fake_db(api, monkeypatch)

    token = api.auth.create_session(AGENCIA)
    assert token

    with pytest.raises(api.HTTPException) as caso:
        abrir(api, token)
    assert caso.value.status_code == 401


def test_una_fila_vencida_no_abre(api, monkeypatch):
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion_vencida("t-vieja")

    with pytest.raises(api.HTTPException) as caso:
        abrir(api, "t-vieja")
    assert caso.value.status_code == 401


def test_cada_pedido_vuelve_a_preguntarle_a_la_base(api, monkeypatch):
    """Dos pedidos, dos lecturas. Si alguna caché contesta por el segundo,
    la baja que ocurra en el medio —o en otra réplica— no se siente."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion("t-viva")

    abrir(api, "t-viva")
    abrir(api, "t-viva")

    assert conn.lecturas_de_sesion == 2


def test_auth_ya_no_guarda_sesiones_en_memoria(api):
    """El guardia estructural del de arriba: sin la tabla ni la dependencia
    que la leía, no hay dónde volver a cachear sin que se note en el diff.

    `destroy_session` también se fue: solo sacaba de esa tabla, así que
    nunca revocó nada. Revocar hoy es borrar la fila."""
    for muerto in ("_sessions", "_purge", "require_agencia",
                   "destroy_session", "SESSION_TTL"):
        assert not hasattr(api.auth, muerto), \
            f"volvió `auth.{muerto}`: la sesión dejó de vivir solo en la base"


# ── Un solo reloj ─────────────────────────────────────────────────

def test_la_sesion_se_guarda_con_el_unico_ttl(api, monkeypatch):
    """El TTL estaba en dos lados y no coincidían: ocho horas en memoria,
    doce en el INSERT. La vida real de una sesión dependía de qué camino la
    validaba. Ahora sale de `auth.SESSION_TTL_H` y de ningún otro lugar."""
    conn = use_fake_db(api, monkeypatch)

    asyncio.run(api.sesion_guardar("t-nueva", AGENCIA))

    assert conn.inserts == [("t-nueva", AGENCIA,
                             str(api.auth.SESSION_TTL_H))]
    # Ocho horas, el valor documentado de `SESSION_TTL_H`. Se puede cambiar
    # por entorno, pero no quedan dos.
    assert api.auth.SESSION_TTL_H == 8


def test_sesion_guardar_no_acepta_un_reloj_propio(api, monkeypatch):
    """Antes `horas` era un parámetro con default 12. Que no exista es lo
    que impide que vuelvan a haber dos relojes."""
    use_fake_db(api, monkeypatch)

    with pytest.raises(TypeError):
        asyncio.run(api.sesion_guardar("t-x", AGENCIA, 12))


# ── Las vencidas se borran ────────────────────────────────────────

def test_la_purga_borra_las_vencidas_y_deja_las_vigentes(api, monkeypatch):
    """En producción había 54 filas y las 54 estaban vencidas, la más vieja
    de agosto. No abrían nada, pero son tokens de sesión acumulados sin
    ninguna fecha en la que desaparezcan."""
    conn = use_fake_db(api, monkeypatch)
    conn.poner_sesion_vencida("t-agosto")
    conn.poner_sesion_vencida("t-septiembre", dias=5)
    conn.poner_sesion("t-viva")

    asyncio.run(api.purgar_sesiones_vencidas())

    assert sorted(conn.purgas[0]) == ["t-agosto", "t-septiembre"]
    assert list(conn.filas) == ["t-viva"]
    # Y la que quedó sigue abriendo: la purga no echa a nadie de más.
    assert abrir(api, "t-viva") == AGENCIA


def test_el_arranque_programa_la_purga(api, monkeypatch):
    """La función sola no limpia nada: alguien tiene que llamarla. Va por el
    mecanismo que ya usa el resto del archivo para las tareas periódicas,
    el startup de FastAPI, y no por el camino de emisión: lo que deja filas
    acumuladas es justamente que nadie entre durante meses."""
    programadas = []

    def fake_create_task(coro, *args, **kwargs):
        programadas.append(coro.cr_code.co_name)
        coro.close()        # solo miramos que se programe, no la corremos

    monkeypatch.setattr(api.asyncio, "create_task", fake_create_task)

    asyncio.run(api._arrancar_combos_ia())

    assert "_loop_purgar_sesiones" in programadas, programadas
