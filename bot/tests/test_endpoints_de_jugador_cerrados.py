"""
Los nueve GET del jugador, cerrados con la sesión.

Nacieron recibiendo el `user_id` en la URL porque la mini-app de Telegram se
identificaba con el `initData` firmado y solo en los POST: en un GET no había
otro dato a mano. Los ids son correlativos, así que cambiando un número se
leía el historial de apuestas, el chat de soporte o la autoexclusión de
cualquier otro jugador.

Lo que fijan estas pruebas, para los nueve:

  · sin sesión → 401, y la base no se toca
  · con la sesión de OTRO jugador → 403, y la base no se toca
  · con la sesión propia → contesta lo mismo que antes
  · el id que llega a la base es SIEMPRE el de la sesión

La última es la que importa a futuro. Las otras tres se podrían cumplir y el
agujero volver igual: alcanza con que alguien use el id de la URL en una
consulta nueva. Por eso además hay una prueba estructural —ninguno de los
nueve declara un `user_id` que venga del cliente— y por eso en el servidor el
id de la URL ni entra a la función.

Los datos son de fixture: dos jugadores inventados y una base de mentira que
anota con qué la consultaron. No hay ningún pedido armado para sacar datos de
otro: el 403 corta antes, y eso es justamente lo que se prueba.
"""
import asyncio
import importlib

import httpx
import pytest

from test_runtime_config import settings


JUGADOR = 501          # el de la sesión
OTRO = 502             # el que se pide en la URL para colarse
TICKET_PROPIO = 77
TICKET_DE_OTRO = 88

TOKEN_PROPIO = "llave-del-501"
TOKEN_DE_OTRO = "llave-del-502"


# ── Las nueve rutas, y cómo se arma cada URL ──────────────────────
#
# La URL no cambió a propósito —hay mini-apps viejas instaladas— así que el id
# sigue viajando: en la ruta en siete de ellas, como parámetro de consulta en
# las dos de soporte. Esta tabla es la que dice cuál es cuál.

def _ruta(plantilla):
    return lambda uid: plantilla.format(uid=uid)


LOS_NUEVE = {
    "/api/historial/{user_id}": _ruta("/api/historial/{uid}"),
    "/api/soporte/hilo": _ruta("/api/soporte/hilo?user_id={uid}"),
    "/api/jugador/{user_id}/responsable": _ruta("/api/jugador/{uid}/responsable"),
    "/api/iacoin/saldo/{user_id}": _ruta("/api/iacoin/saldo/{uid}"),
    "/api/historial-juegos/{user_id}": _ruta("/api/historial-juegos/{uid}"),
    "/api/p2p/mis-apuestas/{user_id}": _ruta("/api/p2p/mis-apuestas/{uid}"),
    "/api/compartir/mis-ganancias/{user_id}": _ruta("/api/compartir/mis-ganancias/{uid}"),
    "/api/superbono/mio/{user_id}": _ruta("/api/superbono/mio/{uid}"),
    "/api/soporte/contacto": _ruta("/api/soporte/contacto?user_id={uid}"),
}


# ── La base de mentira ────────────────────────────────────────────

def _norm(query):
    return " ".join(str(query).split())


class _Fila(dict):
    """asyncpg devuelve Record, que se lee como un dict. Con esto alcanza."""


class FakeConnection:
    """Contesta lo mínimo que cada endpoint necesita y anota todo.

    `self.consultas` guarda (sql, args) de cada llamada. Eso es lo que
    permite preguntarle a la prueba algo que no se ve en la respuesta: de
    quién eran los datos que se fueron a buscar.
    """

    def __init__(self):
        self.consultas = []

    def _anotar(self, query, args):
        self.consultas.append((_norm(query), args))

    @property
    def ids_consultados(self):
        """Todos los enteros que se usaron como parámetro, aplanados."""
        vistos = set()
        for _, args in self.consultas:
            for a in args:
                if isinstance(a, int) and not isinstance(a, bool):
                    vistos.add(a)
        return vistos

    async def fetchrow(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "FROM iacoin_cotizaciones" in q:
            return _Fila(precio_compra=10, precio_venta=12, spread_pct=2,
                         created_at=_AHORA)
        if "COALESCE(saldo_iacoin,0)" in q:
            return _Fila(iac=5, bal=123400, moneda="ARS")
        if "FROM recompensas WHERE user_id=$1" in q:
            return _Fila(n=3, total=450)
        if "FROM users u LEFT JOIN agencias a" in q:
            return _Fila(name="Agencia Fixture", whatsapp="+5490000000",
                         telegram_url="https://t.me/fixture",
                         soporte_horario="9 a 18")
        if "FROM soporte_tickets WHERE user_id=$1" in q:
            return _Fila(id=TICKET_PROPIO)
        if "FROM soporte_tickets WHERE id=$1 AND user_id=$2" in q:
            # El filtro que ya estaba escrito: el ticket es de alguien, y si
            # el id no es el del dueño no hay fila.
            ticket_id, user_id = args[0], args[1]
            dueno = {TICKET_PROPIO: JUGADOR, TICKET_DE_OTRO: OTRO}
            if dueno.get(int(ticket_id)) != int(user_id):
                return None
            return _Fila(id=int(ticket_id), estado="abierto", derivado=False,
                         agencia_code="FIX")
        if "FROM agencias a WHERE a.code=$1" in q:
            return _Fila(name="Agencia Fixture", whatsapp="+5490000000",
                         telegram_url="https://t.me/fixture",
                         soporte_horario="9 a 18")
        if "FROM autoexclusiones" in q or "FROM sesiones_juego" in q:
            return None
        if "FROM superbono_ganadores" in q:
            return _Fila(id=9001, monto=5000, moneda="ARS",
                         created_at=_AHORA)
        if "SELECT moneda FROM users WHERE id=$1" in q:
            return _Fila(moneda="ARS")
        raise AssertionError(f"fetchrow sin fixture: {q}")

    async def fetchval(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)
        if "rollover_pendiente" in q:
            return 1500
        raise AssertionError(f"fetchval sin fixture: {q}")

    async def fetch(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)
        if "FROM soporte_mensajes" in q:
            return [_Fila(autor="cliente", texto="hola", created_at=_AHORA)]
        if ("FROM iacoin_movimientos" in q or "FROM compartidas c" in q
                or "FROM p2p_apuestas p" in q or "FROM app_config" in q
                or "FROM limites_jugador" in q or "FROM betslips" in q
                or "FROM casino_rounds r" in q):
            return []
        raise AssertionError(f"fetch sin fixture: {q}")

    async def execute(self, query, *args):
        self._anotar(query, args)
        return "UPDATE 1"


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


# ── Montaje ───────────────────────────────────────────────────────

@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    modulo = importlib.reload(importlib.import_module("casino_api"))

    global _AHORA
    _AHORA = modulo.datetime.now(modulo.timezone.utc)

    # Las sesiones, en memoria: la misma tabla que lee `requiere_cliente` a
    # través de `sesion_buscar`.
    tabla = {TOKEN_PROPIO: f"cliente:{JUGADOR}",
             TOKEN_DE_OTRO: f"cliente:{OTRO}"}

    async def fake_buscar(token):
        return tabla.get(token)

    monkeypatch.setattr(modulo, "sesion_buscar", fake_buscar)

    conn = FakeConnection()

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(modulo, "get_db", fake_get_db)
    modulo.base_de_mentira = conn
    return modulo


_AHORA = None


async def _get(app, url, token=None):
    cabeceras = {"Authorization": f"Bearer {token}"} if token else {}
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        return await client.get(url, headers=cabeceras)


def get(app, url, token=None):
    return asyncio.run(_get(app, url, token=token))


# ── Sin sesión no se abre ninguno ─────────────────────────────────

@pytest.mark.parametrize("ruta", list(LOS_NUEVE))
def test_sin_sesion_contesta_401_y_no_consulta_nada(api, ruta):
    """401 y no 404: el 404 de una URL que se movió no se distingue de un
    endpoint que no existe, y el cliente viejo no sabría qué hacer con él. El
    401 sí: la app pide una sesión nueva y repite el pedido."""
    respuesta = get(api.app, LOS_NUEVE[ruta](JUGADOR))

    assert respuesta.status_code == 401, ruta
    # Lo importante no es el código sino que corta antes de la base: si
    # consultara y después negara, el dato ya habría salido de la tabla.
    assert api.base_de_mentira.consultas == [], ruta


# ── La sesión de otro jugador no sirve ────────────────────────────

@pytest.mark.parametrize("ruta", list(LOS_NUEVE))
def test_pedir_la_cuenta_de_otro_contesta_403_y_no_consulta_nada(api, ruta):
    """Entra con su propia sesión y pide el id del de al lado.

    403 explícito y no un silencioso "te devuelvo lo tuyo": son dos cosas
    distintas. Un pedido con el id equivocado es un bug en alguna pantalla, y
    si se lo contesta igual nadie se entera nunca."""
    respuesta = get(api.app, LOS_NUEVE[ruta](OTRO), token=TOKEN_PROPIO)

    assert respuesta.status_code == 403, ruta
    assert api.base_de_mentira.consultas == [], ruta


@pytest.mark.parametrize("ruta", list(LOS_NUEVE))
def test_la_sesion_de_otro_tampoco_sirve_sin_pedir_un_id_ajeno(api, ruta):
    """La vuelta simétrica: la sesión del 502 pidiendo la URL del 501."""
    respuesta = get(api.app, LOS_NUEVE[ruta](JUGADOR), token=TOKEN_DE_OTRO)

    assert respuesta.status_code == 403, ruta
    assert api.base_de_mentira.consultas == [], ruta


# ── Con la sesión propia andan igual que antes ─────────────────────

@pytest.mark.parametrize("ruta", list(LOS_NUEVE))
def test_con_la_sesion_propia_sigue_contestando(api, ruta):
    respuesta = get(api.app, LOS_NUEVE[ruta](JUGADOR), token=TOKEN_PROPIO)

    assert respuesta.status_code == 200, (ruta, respuesta.text)
    assert respuesta.json() is not None


@pytest.mark.parametrize("ruta", list(LOS_NUEVE))
def test_el_id_que_llega_a_la_base_es_el_de_la_sesion(api, ruta):
    """La prueba de fondo.

    No alcanza con que el 403 corte: si una consulta usara el id de la URL,
    bastaría con que algún día coincida —o que alguien saque la comparación—
    para que el agujero vuelva. Acá el id pedido y el de la sesión son el
    mismo, así que el 403 no interviene, y lo que se mira es qué número se
    fue a buscar a la base."""
    respuesta = get(api.app, LOS_NUEVE[ruta](JUGADOR), token=TOKEN_PROPIO)

    assert respuesta.status_code == 200, ruta
    assert JUGADOR in api.base_de_mentira.ids_consultados, ruta
    assert OTRO not in api.base_de_mentira.ids_consultados, ruta


# ── El id de la URL no es un parámetro de ninguno ─────────────────

def test_ninguno_de_los_nueve_recibe_un_user_id_del_cliente(api):
    """La guarda estructural contra la reincidencia.

    En los nueve, `user_id` es el valor que devuelve la sesión: su default es
    `Depends(requiere_cliente_propio)`. El de la URL no está declarado, así
    que no existe dentro de la función y una consulta nueva no puede tomarlo
    por error. Si alguien vuelve a declararlo —`user_id: int`— esta prueba
    cae, y es la señal de que el agujero volvió a abrirse."""
    rutas = {r.path: r for r in api.app.routes if hasattr(r, "dependant")}

    for ruta in LOS_NUEVE:
        assert ruta in rutas, f"desapareció {ruta}: revisar la lista"
        dependant = rutas[ruta].dependant
        nombres = [p.name for p in
                   (dependant.path_params + dependant.query_params)]
        assert "user_id" not in nombres, (
            f"{ruta} volvió a recibir el user_id del cliente")


def test_el_id_de_la_url_no_aparece_en_la_firma_de_la_funcion(api):
    """Lo mismo visto desde el código y no desde FastAPI: el nombre `user_id`
    está, pero atado a la sesión. Las dos pruebas juntas descartan tanto
    declararlo como parámetro suelto como sacarle la dependencia."""
    import inspect

    funciones = (api.historial_jugador, api.historial_por_juego,
                 api.jr_estado, api.iacoin_saldo, api.p2p_mias,
                 api.mis_recompensas, api.superbono_mio,
                 api.soporte_hilo, api.soporte_contacto)

    for fn in funciones:
        parametro = inspect.signature(fn).parameters["user_id"]
        assert getattr(parametro.default, "dependency",
                       None) is api.requiere_cliente_propio, \
            f"{fn.__name__}: el user_id dejó de salir de la sesión"


# ── Los dos casos que tienen algo propio ──────────────────────────

def test_el_superbono_de_otro_no_se_puede_marcar_como_visto(api):
    """Es el único GET de los nueve que escribe: da el premio por visto.

    Con el id suelto se podía recorrer los ids y dar por vistos los premios
    de todos, que entonces nunca los veían aparecer en la pantalla. Que corte
    con 403 antes de la base es lo que lo impide."""
    respuesta = get(api.app, f"/api/superbono/mio/{OTRO}", token=TOKEN_PROPIO)

    assert respuesta.status_code == 403
    escrituras = [q for q, _ in api.base_de_mentira.consultas
                  if q.startswith("UPDATE")]
    assert escrituras == []


def test_el_propio_superbono_si_queda_marcado_como_visto(api):
    """La contraparte: cerrarlo no puede dejar de hacer lo que hacía."""
    respuesta = get(api.app, f"/api/superbono/mio/{JUGADOR}",
                    token=TOKEN_PROPIO)

    assert respuesta.status_code == 200
    assert respuesta.json()["gano"] is True
    assert any(q.startswith("UPDATE superbono_ganadores")
               for q, _ in api.base_de_mentira.consultas)


def test_el_hilo_de_soporte_de_otro_sigue_sin_abrirse_por_ticket_id(api):
    """El `AND user_id=$2` del hilo ya estaba escrito, pero comparaba contra
    el id que mandaba el mismo que preguntaba, así que no sostenía nada. Ahora
    el id sale de la sesión: pedir el ticket de otro no devuelve la
    conversación."""
    respuesta = get(api.app,
                    f"/api/soporte/hilo?user_id={JUGADOR}"
                    f"&ticket_id={TICKET_DE_OTRO}",
                    token=TOKEN_PROPIO)

    assert respuesta.status_code == 404
    assert "mensajes" not in respuesta.json()


def test_el_hilo_propio_se_abre_igual_que_antes(api):
    respuesta = get(api.app,
                    f"/api/soporte/hilo?user_id={JUGADOR}"
                    f"&ticket_id={TICKET_PROPIO}",
                    token=TOKEN_PROPIO)

    assert respuesta.status_code == 200
    assert respuesta.json()["ticket_id"] == TICKET_PROPIO
    assert len(respuesta.json()["mensajes"]) == 1


# ── Las dos de soporte, sin el id en la URL ────────────────────────

@pytest.mark.parametrize("ruta", ["/api/soporte/hilo", "/api/soporte/contacto"])
def test_soporte_anda_aunque_el_cliente_ya_no_mande_el_user_id(api, ruta):
    """El id del parámetro de consulta quedó siendo redundante: el frontend
    nuevo no lo manda. Dejó de ser obligatorio en vez de pasar a devolver un
    422, porque el pedido tiene todo lo que necesita en el encabezado."""
    respuesta = get(api.app, ruta, token=TOKEN_PROPIO)

    assert respuesta.status_code == 200, respuesta.text
    assert JUGADOR in api.base_de_mentira.ids_consultados


# ── La sesión que no es de cliente ─────────────────────────────────

def test_una_sesion_de_agencia_no_abre_la_cuenta_de_un_jugador(api, monkeypatch):
    """El token de agencia vive en la misma tabla, con otro prefijo. Si
    `requiere_cliente` no mirara el prefijo, quien atiende el mostrador
    entraría a la cuenta de cualquiera de sus clientes por esta puerta."""
    async def fake_buscar(token):
        return "FIX" if token == "llave-de-agencia" else None

    monkeypatch.setattr(api, "sesion_buscar", fake_buscar)

    respuesta = get(api.app, f"/api/historial/{JUGADOR}",
                    token="llave-de-agencia")

    assert respuesta.status_code == 401
    assert api.base_de_mentira.consultas == []
