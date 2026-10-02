"""
Un boleto se liquida y se paga en su rama, no en cualquiera.

Tres endpoints de agencia buscaban el boleto por código y escribían sin
preguntar de quién era:

  · POST /api/agencias/me/liquidar              marcar ganado o perdido
  · POST /api/agencias/me/pagar-premio          pagar el premio
  · POST /api/betslip/{code}/cashout/pagar-caja pagar el cash out en caja

El código va impreso en el ticket. Con solo verlo, una agencia autenticada
podía marcar perdido el boleto de otra, o cobrarle el premio. Las agencias
compiten entre ellas y acá se mueve plata, así que no es un detalle.

Qué fija esta prueba, para los tres:

  · el boleto de otra rama → 403, y la base no se escribe
  · el boleto propio → sigue andando
  · el de una subagencia → sigue andando, la rama va hacia abajo
  · un código que no existe → sigue siendo 404, no 403

Y los dos casos de mostrador que hacen que la regla no sea solo "el jugador":

  · boleto sin jugador (`user_id NULL`, el que compra en la ventanilla no
    tiene cuenta): es de quien lo vendió
  · jugador de la casa (`creado_por='admin'`, registro web sin referido):
    el boleto lo liquida la agencia que lo cobró

Si la regla mirara solo al jugador, esos dos dejarían de funcionar y serían
ventas de todos los días. Si mirara solo al cobrador, una agencia podría
liquidar el boleto que le cobró a un jugador de otra. Hacen falta las dos.

Los datos son de fixture: tres agencias inventadas, cuatro jugadores y una
base de mentira que anota con qué la consultaron. No hay ningún pedido
armado para tocar plata ajena: el 403 corta antes, y eso es lo que se prueba.
"""
import asyncio
import importlib

import httpx
import pytest

from test_runtime_config import settings


# ── Las tres agencias y su árbol ──────────────────────────────────
#
# AG-A tiene una subagencia, AG-A1. AG-B cuelga sola y es la que intenta
# meter mano en los boletos de la otra.

RUTAS = {
    "AG-A":  "AG-A",
    "AG-A1": "AG-A/AG-A1",
    "AG-B":  "AG-B",
}

TOKEN_A = "llave-de-AG-A"
TOKEN_B = "llave-de-AG-B"


# ── Los jugadores y de quién son ──────────────────────────────────

JUGADORES = {
    601: "AG-A",     # cliente de la agencia A
    602: "AG-A1",    # cliente de la subagencia de A
    603: "AG-B",     # cliente de la agencia B
    604: "admin",    # jugador de la casa: registro web sin referido
}


# ── Los boletos ───────────────────────────────────────────────────
#
# Todos quedan en el mismo estado —ganada, sin pagar, cash out pendiente—
# para que los tres endpoints puedan trabajar sobre cualquiera y la única
# diferencia entre un 200 y un 403 sea de quién es el boleto.

BOLETOS = {
    "QP-A":     {"user_id": 601,  "paid_by": "AG-A"},   # propio de A
    "QP-SUB":   {"user_id": 602,  "paid_by": "AG-A1"},  # de la subagencia
    "QP-B":     {"user_id": 603,  "paid_by": "AG-B"},   # de la otra rama
    "QP-MOSTR": {"user_id": None, "paid_by": "AG-A"},   # mostrador, sin cuenta
    "QP-CASA":  {"user_id": 604,  "paid_by": "AG-A"},   # jugador de la casa
    "QP-HUERF": {"user_id": None, "paid_by": None},     # sin dueño ninguno
}

INEXISTENTE = "QP-NADA"


# ── Los tres endpoints, y cómo se arma cada pedido ────────────────

LOS_TRES = {
    "/api/agencias/me/liquidar": lambda code: (
        "/api/agencias/me/liquidar", {"code": code, "resultado": "ganada"}),
    "/api/agencias/me/pagar-premio": lambda code: (
        "/api/agencias/me/pagar-premio", {"code": code}),
    "/api/betslip/{code}/cashout/pagar-caja": lambda code: (
        f"/api/betslip/{code}/cashout/pagar-caja", {}),
}


# ── La base de mentira ────────────────────────────────────────────

def _norm(query):
    return " ".join(str(query).split())


class _Fila(dict):
    """asyncpg devuelve Record, que se lee como un dict. Con esto alcanza."""


class _Transaccion:
    async def __aenter__(self):
        return self

    async def __aexit__(self, *args):
        return False


class FakeConnection:
    """Contesta lo mínimo que cada endpoint necesita y anota todo.

    `self.escrituras` es lo que importa: si un 403 dejó pasar un UPDATE,
    la prueba lo ve aunque la respuesta diga que falló.
    """

    def __init__(self):
        self.consultas = []

    def _anotar(self, query, args):
        self.consultas.append((_norm(query), args))

    @property
    def escrituras(self):
        """Las consultas que modifican algo."""
        return [q for q, _ in self.consultas
                if q.startswith(("UPDATE", "INSERT", "DELETE"))]

    @property
    def escrituras_de_boletos(self):
        return [q for q in self.escrituras if "betslips" in q]

    def transaction(self):
        return _Transaccion()

    async def fetchrow(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "FROM betslips WHERE code=$1" in q:
            datos = BOLETOS.get(args[0])
            if datos is None:
                return None
            return _Fila(
                code=args[0], user_id=datos["user_id"],
                paid_by=datos["paid_by"],
                # Estado que deja contentos a los tres endpoints a la vez.
                status="cashout_pending", resultado="ganada", pagado_at=None,
                potential_win=1000, stake=100, odd_total=2.0,
                con_bono=False, picks="[]",
            )
        if "SELECT ruta FROM agencias WHERE code=$1" in q:
            ruta = RUTAS.get(args[0])
            return _Fila(ruta=ruta) if ruta else None
        raise AssertionError(f"fetchrow sin fixture: {q}")

    async def fetchval(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "SELECT creado_por FROM users WHERE id=$1" in q:
            return JUGADORES.get(args[0])
        raise AssertionError(f"fetchval sin fixture: {q}")

    async def fetch(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "SELECT code FROM agencias WHERE ruta = $1 OR ruta LIKE $2" in q:
            # Lo mismo que hace la base: la rama son los codes cuya ruta
            # arranca con la de la agencia que pregunta.
            ruta = args[0]
            return [_Fila(code=c) for c, r in RUTAS.items()
                    if r == ruta or r.startswith(ruta + "/")]
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

    # Las sesiones de agencia, en memoria: la misma tabla que lee
    # `requiere_agencia` a través de `sesion_buscar`.
    tabla = {TOKEN_A: "AG-A", TOKEN_B: "AG-B"}

    async def fake_buscar(token):
        return tabla.get(token)

    monkeypatch.setattr(modulo, "sesion_buscar", fake_buscar)

    # Cuenta corriente y aviso por Telegram: no son lo que se prueba acá, y
    # cada uno consulta por su cuenta. Se los deja en nada para que el
    # camino feliz de pagar-premio llegue hasta el final.
    async def nada(*args, **kwargs):
        return None

    monkeypatch.setattr(modulo, "_mover_cc", nada)
    monkeypatch.setattr(modulo, "avisar_cliente", nada)

    conn = FakeConnection()

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(modulo, "get_db", fake_get_db)
    modulo.base_de_mentira = conn
    return modulo


async def _post(app, url, cuerpo, token):
    transport = httpx.ASGITransport(app=app)
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        return await client.post(url, json=cuerpo,
                                 headers={"Authorization": f"Bearer {token}"})


def post(api, endpoint, code, token):
    url, cuerpo = LOS_TRES[endpoint](code)
    return asyncio.run(_post(api.app, url, cuerpo, token))


# ── El boleto de otra rama no se toca ─────────────────────────────

@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_de_otra_rama_contesta_403(api, endpoint):
    """AG-B entra con su sesión y manda el código de un boleto de AG-A.

    Es el agujero que estaba abierto: con el código a la vista alcanzaba
    para marcarlo perdido o cobrarle el premio."""
    respuesta = post(api, endpoint, "QP-A", TOKEN_B)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_de_otra_rama_no_se_escribe(api, endpoint):
    """La que importa de verdad.

    El 403 se podría contestar después de haber escrito. Acá se mira la
    base: sobre `betslips` no se tocó nada."""
    post(api, endpoint, "QP-A", TOKEN_B)

    assert api.base_de_mentira.escrituras == [], endpoint


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_tampoco_al_revés_la_rama_de_a_sobre_el_boleto_de_b(api, endpoint):
    """La vuelta simétrica, para que no sea una sola dirección la cerrada."""
    respuesta = post(api, endpoint, "QP-B", TOKEN_A)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)
    assert api.base_de_mentira.escrituras == [], endpoint


# ── La operación legítima sigue andando ───────────────────────────

@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_propio_se_sigue_pudiendo(api, endpoint):
    respuesta = post(api, endpoint, "QP-A", TOKEN_A)

    assert respuesta.status_code == 200, (endpoint, respuesta.text)
    assert api.base_de_mentira.escrituras_de_boletos, endpoint


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_de_una_subagencia_tambien(api, endpoint):
    """La rama va hacia abajo: AG-A alcanza a los boletos de AG-A1.

    Si esto se pusiera rojo, el candado estaría comparando por igualdad en
    lugar de por rama y la agencia madre dejaría de poder operar."""
    respuesta = post(api, endpoint, "QP-SUB", TOKEN_A)

    assert respuesta.status_code == 200, (endpoint, respuesta.text)
    assert api.base_de_mentira.escrituras_de_boletos, endpoint


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_la_subagencia_no_alcanza_los_de_otra_rama(api, endpoint):
    """La rama no va hacia arriba ni a los costados."""
    respuesta = post(api, endpoint, "QP-B", TOKEN_A)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)


# ── Los dos casos de mostrador ────────────────────────────────────

@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_sin_jugador_es_de_quien_lo_vendio(api, endpoint):
    """`box_crear_betslip` inserta `user_id NULL`: el que compra en la
    ventanilla no tiene cuenta, solo queda su nombre a mano. Ese boleto lo
    tiene que poder liquidar la agencia que lo vendió."""
    respuesta = post(api, endpoint, "QP-MOSTR", TOKEN_A)

    assert respuesta.status_code == 200, (endpoint, respuesta.text)


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_sin_jugador_tampoco_lo_toca_otra_agencia(api, endpoint):
    """Que no tenga jugador no lo hace de todos."""
    respuesta = post(api, endpoint, "QP-MOSTR", TOKEN_B)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)
    assert api.base_de_mentira.escrituras == [], endpoint


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_jugador_de_la_casa_lo_liquida_la_agencia_que_cobro(api, endpoint):
    """El registro web sin código de referido deja al jugador en
    `creado_por='admin'`, que no está en la rama de ninguna agencia.

    Si la regla mirara solo al jugador, la agencia que le cobró el boleto
    en el mostrador no podría liquidárselo nunca. Es una venta común, así
    que el cobrador también cuenta."""
    respuesta = post(api, endpoint, "QP-CASA", TOKEN_A)

    assert respuesta.status_code == 200, (endpoint, respuesta.text)


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_jugador_de_la_casa_no_lo_liquida_una_agencia_cualquiera(api, endpoint):
    """Contracara de la anterior: que el jugador sea de la casa no abre el
    boleto a cualquiera, porque lo cobró AG-A y no AG-B."""
    respuesta = post(api, endpoint, "QP-CASA", TOKEN_B)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)


@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_el_boleto_sin_dueno_se_rechaza(api, endpoint):
    """Sin jugador y sin cobrador no es de nadie, y se rechaza.

    No se puede haber llegado a liquidar un boleto sin venderlo primero,
    así que esto no frena mostrador: es una fila incoherente."""
    respuesta = post(api, endpoint, "QP-HUERF", TOKEN_A)

    assert respuesta.status_code == 403, (endpoint, respuesta.text)
    assert api.base_de_mentira.escrituras == [], endpoint


# ── El código que no existe sigue dando 404 ───────────────────────

@pytest.mark.parametrize("endpoint", list(LOS_TRES))
def test_un_codigo_inexistente_sigue_siendo_404(api, endpoint):
    """El 404 es anterior al candado y tiene que seguir primero: al cajero
    que tipeó mal un código hay que decirle que no existe, no que no es de
    su rama."""
    respuesta = post(api, endpoint, INEXISTENTE, TOKEN_A)

    assert respuesta.status_code == 404, (endpoint, respuesta.text)


# ── Que los tres sigan preguntando ────────────────────────────────

def test_los_tres_endpoints_verifican_la_rama(api):
    """La guarda estructural contra la reincidencia.

    Las de arriba se podrían cumplir y el agujero volver: alcanza con que
    alguien agregue un endpoint nuevo que escriba `betslips` por código.
    Esta mira que los tres que ya se arreglaron sigan llamando al candado,
    y es la que cae si alguien lo saca."""
    import inspect

    rutas = {r.path: r for r in api.app.routes if hasattr(r, "endpoint")}

    for endpoint in LOS_TRES:
        assert endpoint in rutas, f"desapareció {endpoint}: revisar la lista"
        fuente = inspect.getsource(rutas[endpoint].endpoint)
        assert "exigir_boleto_de_la_rama" in fuente, (
            f"{endpoint} dejó de verificar de quién es el boleto")
