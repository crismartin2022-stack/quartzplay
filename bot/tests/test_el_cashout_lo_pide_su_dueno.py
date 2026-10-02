"""
El cash out lo pide su dueño.

`POST /api/betslip/{code}/cashout` no tenía NINGUNA autenticación. Con el
código del boleto —que va impreso en el ticket— cualquiera cerraba un boleto
ajeno y lo dejaba acreditado o cobrable en caja. Plata moviéndose sin que
nadie dijera quién la movió.

Y el permiso de la agencia salía del cuerpo del pedido, adentro de un `if`:

    agencia_ejec = (body.get("agencia_code") or "").upper() or None
    if agencia_ejec:
        ok = await conn.fetchval("SELECT puede_cashout ...", agencia_ejec)

El que no mandaba `agencia_code` no pasaba por ninguna verificación. Y ningún
frontend lo mandaba nunca —ni la app del jugador, ni la pantalla de agencia,
ni la terminal del box—, así que el `puede_cashout` que el admin habilita no
se estaba mirando jamás.

La regla, como la definió el dueño: lo pide el JUGADOR, el admin habilita el
cash out POR AGENCIA, y el jugador puede si SU agencia lo tiene habilitado.
La evaluación de riesgo es de ellos y no se toca.

Ahora son dos puertas con una regla cada una:

  · el jugador, sobre su boleto         /api/betslip/{code}/cashout
  · la ventanilla, sobre su rama        /api/betslip/{code}/cashout/agencia

Qué fija esta prueba:

  · sin identidad → 401, y la base no se escribe
  · con la identidad de OTRO jugador → 403, y el boleto no se toca
  · con la del dueño y la agencia habilitada → anda
  · con la del dueño y la agencia SIN habilitar → 403 con el mensaje de antes
  · mandar `agencia_code` en el cuerpo no cambia NADA — la que fija que el
    permiso dejó de venir del cliente
  · la ventanilla sigue funcionando, autenticada y dentro de su rama

Los datos son de fixture: cuatro agencias inventadas, seis jugadores y una
base de mentira que anota con qué la consultaron. No hay ningún pedido armado
para tocar plata ajena: el candado corta antes, y eso es lo que se mira.
"""
import asyncio
import importlib
import inspect

import httpx
import pytest

from test_runtime_config import settings


# ── Las agencias: su árbol y su permiso ───────────────────────────
#
# AG-A tiene una subagencia, AG-A1. AG-B cuelga sola. AG-SIN existe y está
# autenticada igual que las otras: lo único que le falta es el permiso, que es
# justo lo que separa un 200 de un 403 cuando todo lo demás está bien.

RUTAS = {
    "AG-A":   "AG-A",
    "AG-A1":  "AG-A/AG-A1",
    "AG-B":   "AG-B",
    "AG-SIN": "AG-SIN",
}

PUEDE_CASHOUT = {
    "AG-A":   True,
    "AG-A1":  True,
    "AG-B":   True,
    "AG-SIN": False,
}

TOKEN_AG_A   = "llave-de-AG-A"
TOKEN_AG_B   = "llave-de-AG-B"
TOKEN_AG_SIN = "llave-de-AG-SIN"


# ── Los jugadores: de qué agencia son y cómo entran ───────────────

JUGADORES = {
    701: {"agencia": "AG-A",   "telegram_id": 999701},
    702: {"agencia": "AG-B",   "telegram_id": 999702},
    703: {"agencia": "AG-SIN", "telegram_id": 999703},
    704: {"agencia": "admin",  "telegram_id": 999704},  # casa: registro web sin referido
    705: {"agencia": "AG-A1",  "telegram_id": 999705},
    706: {"agencia": None,     "telegram_id": 999706},  # sin agencia ninguna
}

# La sesión del sitio. El prefijo `cliente:` es el que distingue una sesión de
# jugador de una de agencia: las dos viven en la misma tabla.
TOKENS_JUGADOR = {jid: f"llave-jugador-{jid}" for jid in JUGADORES}

# La firma de Telegram de cada jugador, para la mini-app.
INIT_DATA = {jid: f"firma-de-{jid}" for jid in JUGADORES}


# ── Los boletos ───────────────────────────────────────────────────
#
# Todos 'active' y sin bono, para que lo único que decida entre un 200 y un
# 403 sea de quién es el boleto y quién lo pide.

BOLETOS = {
    "QP-701":   {"user_id": 701,  "paid_by": "AG-A"},    # del jugador de AG-A
    "QP-702":   {"user_id": 702,  "paid_by": "AG-B"},    # del jugador de la otra rama
    "QP-703":   {"user_id": 703,  "paid_by": "AG-SIN"},  # agencia sin permiso
    "QP-704":   {"user_id": 704,  "paid_by": "AG-A"},    # jugador de la casa
    "QP-706":   {"user_id": 706,  "paid_by": "AG-A"},    # jugador sin agencia
    "QP-SUB":   {"user_id": 705,  "paid_by": "AG-A1"},   # de la subagencia
    "QP-MOSTR": {"user_id": None, "paid_by": "AG-A"},    # mostrador, sin cuenta
}

INEXISTENTE = "QP-NADA"

VALOR = 500.0


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
    """Contesta lo mínimo que cada puerta necesita y anota todo.

    `self.escrituras` es lo que importa: si un 401 o un 403 dejó pasar un
    UPDATE, la prueba lo ve aunque la respuesta diga que falló.
    """

    def __init__(self):
        self.consultas = []

    def _anotar(self, query, args):
        self.consultas.append((_norm(query), args))

    @property
    def escrituras(self):
        return [q for q, _ in self.consultas
                if q.startswith(("UPDATE", "INSERT", "DELETE"))]

    @property
    def escrituras_de_boletos(self):
        return [q for q in self.escrituras if "betslips" in q]

    @property
    def escrituras_de_saldo(self):
        return [q for q in self.escrituras if "users SET balance" in q]

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
                paid_by=datos["paid_by"], status="active",
                potential_win=1000, stake=100, odd_total=2.0,
                con_bono=False, picks="[]",
            )
        if "SELECT id FROM users WHERE telegram_id=$1" in q:
            for jid, datos in JUGADORES.items():
                if datos["telegram_id"] == args[0]:
                    return _Fila(id=jid)
            return None
        if "SELECT ruta FROM agencias WHERE code=$1" in q:
            ruta = RUTAS.get(args[0])
            return _Fila(ruta=ruta) if ruta else None
        raise AssertionError(f"fetchrow sin fixture: {q}")

    async def fetchval(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "SELECT creado_por FROM users WHERE id=$1" in q:
            datos = JUGADORES.get(args[0])
            return datos["agencia"] if datos else None
        if "SELECT puede_cashout FROM agencias WHERE code=$1" in q:
            return PUEDE_CASHOUT.get(args[0])
        if "SELECT telegram_id FROM users WHERE id=$1" in q:
            datos = JUGADORES.get(args[0])
            return datos["telegram_id"] if datos else None
        if "SELECT balance FROM users WHERE id=$1" in q:
            return 123456
        raise AssertionError(f"fetchval sin fixture: {q}")

    async def fetch(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "SELECT code FROM agencias WHERE ruta = $1 OR ruta LIKE $2" in q:
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

    # Las dos clases de sesión, en la misma tabla y distinguidas por el
    # prefijo `cliente:`, igual que en la base.
    tabla = {TOKEN_AG_A: "AG-A", TOKEN_AG_B: "AG-B", TOKEN_AG_SIN: "AG-SIN"}
    for jid, token in TOKENS_JUGADOR.items():
        tabla[token] = f"cliente:{jid}"

    async def fake_buscar(token):
        return tabla.get(token)

    monkeypatch.setattr(modulo, "sesion_buscar", fake_buscar)

    # La firma de Telegram: el HMAC real necesita el token del bot y un
    # `auth_date` fresco, y no es lo que se prueba acá.
    def fake_validar_init_data(crudo):
        for jid, firma in INIT_DATA.items():
            if crudo == firma:
                return {"id": JUGADORES[jid]["telegram_id"]}
        return None

    monkeypatch.setattr(modulo, "validar_init_data", fake_validar_init_data)

    # La valuación es de ellos y no se toca: tiene su propia cobertura y sale
    # a buscar cuotas vivas. Acá se fija disponible para que lo único que
    # decida el resultado sea la identidad.
    async def cashout_disponible(_picks, _stake, _odd_total):
        return {"disponible": True, "valor": VALOR, "stake": 100,
                "ganancia_potencial": 1000.0, "odd_original": 2.0,
                "odd_actual": 1.5, "detalle": []}

    monkeypatch.setattr(modulo, "_calcular_cashout", cashout_disponible)

    conn = FakeConnection()

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(modulo, "get_db", fake_get_db)
    modulo.base_de_mentira = conn
    return modulo


PUERTA_JUGADOR = "/api/betslip/{code}/cashout"
PUERTA_AGENCIA = "/api/betslip/{code}/cashout/agencia"


async def _pedir(app, metodo, url, cuerpo, token):
    transport = httpx.ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        if metodo == "GET":
            return await client.get(url, headers=headers)
        return await client.post(url, json=cuerpo or {}, headers=headers)


def post(api, plantilla, code, token=None, cuerpo=None):
    return asyncio.run(_pedir(api.app, "POST", plantilla.format(code=code),
                              cuerpo, token))


def get(api, plantilla, code, token=None):
    return asyncio.run(_pedir(api.app, "GET", plantilla.format(code=code),
                              None, token))


# ══════════════════════════════════════════════════════════════════
# LA PUERTA DEL JUGADOR — POST
# ══════════════════════════════════════════════════════════════════

# ── Sin identidad no se cashea ────────────────────────────────────

def test_sin_identidad_contesta_401(api):
    """El agujero, en una línea: con el código del ticket y nada más.

    El código va impreso. Esto era un 200 que cerraba el boleto de otro.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-701")

    assert respuesta.status_code == 401, respuesta.text


def test_sin_identidad_no_escribe_nada(api):
    """La que importa de verdad: el 401 podría llegar después de escribir."""
    post(api, PUERTA_JUGADOR, "QP-701")

    assert api.base_de_mentira.escrituras == []


def test_el_401_trae_un_texto_y_no_un_objeto(api):
    """Las tres pantallas muestran `detail` tal cual (`setCoMsg(d.detail)`).

    Un dict ahí —como el `{"reason": "login_required"}` de `/api/apuesta`—
    les rompe el render en vez de avisarle al jugador que entre.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-701")

    assert isinstance(respuesta.json()["detail"], str)


def test_un_token_de_agencia_no_sirve_en_la_puerta_del_jugador(api):
    """Las dos sesiones viven en la misma tabla. Sin el prefijo `cliente:`,
    `jugador_de_sesion` devuelve None y acá no entra nadie."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKEN_AG_A)

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.escrituras == []


# ── El boleto de otro no se toca ──────────────────────────────────

def test_el_boleto_de_otro_jugador_contesta_403(api):
    """702 entra con su sesión y manda el código del boleto de 701."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[702])

    assert respuesta.status_code == 403, respuesta.text


def test_el_boleto_de_otro_jugador_no_se_escribe(api):
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[702])

    assert respuesta.status_code == 403
    assert api.base_de_mentira.escrituras == []


def test_tampoco_al_reves(api):
    """La vuelta simétrica, para que no sea una sola dirección la cerrada."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-702", TOKENS_JUGADOR[701])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_el_boleto_de_mostrador_no_entra_por_la_puerta_del_jugador(api):
    """`user_id NULL`: el que compra en la ventanilla no tiene cuenta, así
    que ese boleto no es de ningún jugador. Se cashea por la otra puerta."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-MOSTR", TOKENS_JUGADOR[701])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


# ── Con la del dueño y la agencia habilitada, anda ────────────────

def test_el_dueno_con_su_agencia_habilitada_puede(api):
    """El camino feliz: 701 es de AG-A y AG-A tiene el cash out habilitado."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[701])

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["ok"] is True
    assert respuesta.json()["valor"] == VALOR


def test_el_dueno_con_su_agencia_habilitada_cierra_el_boleto(api):
    """Que conteste 200 no alcanza: la plata tiene que haberse movido."""
    post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[701])

    assert api.base_de_mentira.escrituras_de_boletos
    assert api.base_de_mentira.escrituras_de_saldo


def test_la_firma_de_telegram_tambien_entra(api):
    """La mini-app no manda `Authorization`: manda el `init_data` firmado.

    Si esto se pusiera rojo, el arreglo habría cerrado la puerta a la mitad
    de los jugadores — los que entran desde Telegram.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", cuerpo={
        "init_data": INIT_DATA[701]})

    assert respuesta.status_code == 200, respuesta.text


def test_la_firma_de_telegram_de_otro_no_alcanza_el_boleto(api):
    """La identidad de Telegram se resuelve a `users.id` antes de comparar.

    Si se comparara el `telegram_id` contra `betslips.user_id` —dos
    numeraciones distintas sobre el mismo rango— esto podría dar 200.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", cuerpo={
        "init_data": INIT_DATA[702]})

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


# ── Con la del dueño y la agencia SIN habilitar, 403 ──────────────

def test_el_dueno_sin_permiso_de_su_agencia_contesta_403(api):
    """703 es el dueño del boleto, pero AG-SIN no lo tiene habilitado.

    Esta es la regla del dueño del negocio: el admin habilita por agencia, y
    el jugador puede si SU agencia lo tiene.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-703", TOKENS_JUGADOR[703])

    assert respuesta.status_code == 403, respuesta.text


def test_el_403_de_permiso_conserva_el_mensaje_que_ya_existia(api):
    respuesta = post(api, PUERTA_JUGADOR, "QP-703", TOKENS_JUGADOR[703])

    assert respuesta.json()["detail"] == (
        "Tu agencia no tiene habilitado el cash out. "
        "Pedíselo al administrador.")


def test_el_dueno_sin_permiso_no_escribe_nada(api):
    post(api, PUERTA_JUGADOR, "QP-703", TOKENS_JUGADOR[703])

    assert api.base_de_mentira.escrituras == []


def test_el_jugador_de_la_casa_no_tiene_quien_le_habilite(api):
    """`creado_por='admin'` (CASA): el registro web sin código de referido.

    No hay agencia que le habilite nada, así que falla cerrado. Queda fijado
    acá porque es una consecuencia de producto, no un detalle: si el dueño
    quiere que la casa también pueda, hay que habilitarlo explícitamente.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-704", TOKENS_JUGADOR[704])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_el_jugador_sin_agencia_tampoco(api):
    """`creado_por NULL`. Mismo razonamiento: sin agencia no hay permiso."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-706", TOKENS_JUGADOR[706])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_el_que_no_tiene_agencia_recibe_su_propio_mensaje(api):
    """Sin agencia y 'mi agencia no lo tiene habilitado' no son lo mismo.

    Los dos son 403 —sacar la guarda de `agencia_code` vacío no cambia el
    código, porque `WHERE code=NULL` no trae fila y el segundo candado corta
    igual— así que el mensaje es lo único que los distingue. Al jugador de la
    casa decirle "pedíselo a tu agencia" lo manda a buscar a alguien que no
    existe.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-706", TOKENS_JUGADOR[706])

    assert respuesta.json()["detail"] == (
        "Tu cuenta no tiene una agencia que habilite el cash out. "
        "Pedíselo al administrador.")


# ══════════════════════════════════════════════════════════════════
# LA QUE FIJA EL ARREGLO: EL PERMISO YA NO VIENE DEL CLIENTE
# ══════════════════════════════════════════════════════════════════

def test_mandar_agencia_code_no_da_permiso(api):
    """El corazón del arreglo.

    703 es el dueño del boleto pero su agencia (AG-SIN) no tiene el cash out.
    Manda en el cuerpo `agencia_code: "AG-A"`, que SÍ lo tiene. Tiene que
    seguir siendo 403: el permiso se busca desde `users.creado_por` del
    jugador autenticado, y lo que venga en el cuerpo no se lee.

    Un dato de permiso que manda el cliente no es un permiso.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-703", TOKENS_JUGADOR[703],
                     cuerpo={"agencia_code": "AG-A"})

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_mandar_agencia_code_no_da_pertenencia(api):
    """La otra mitad: tampoco convierte el boleto de otro en propio."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[702],
                     cuerpo={"agencia_code": "AG-B"})

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_mandar_agencia_code_no_da_identidad(api):
    """Y sin sesión no abre nada, que es como estaba el agujero: el `if`
    sobre `agencia_code` era toda la autorización que había."""
    respuesta = post(api, PUERTA_JUGADOR, "QP-701",
                     cuerpo={"agencia_code": "AG-A"})

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_mandar_agencia_code_tampoco_le_quita_el_permiso_al_dueno(api):
    """Simétrica: el cuerpo no se lee, ni para abrir ni para cerrar.

    701 es de AG-A, habilitada. Manda `agencia_code: "AG-SIN"`, que no lo
    está. Sigue siendo 200 porque ese campo ya no tiene lector.
    """
    respuesta = post(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[701],
                     cuerpo={"agencia_code": "AG-SIN"})

    assert respuesta.status_code == 200, respuesta.text


def test_mandar_ejecutor_no_cambia_de_puerta(api):
    """`ejecutor` también salía del cuerpo y elegía el camino.

    Mandar 'agencia' o 'box' ya no mueve nada: la puerta del jugador es la
    del jugador, y el rótulo lo pone el servidor.
    """
    for ejecutor in ("agencia", "box", "cliente", "admin"):
        respuesta = post(api, PUERTA_JUGADOR, "QP-701",
                         cuerpo={"ejecutor": ejecutor})

        assert respuesta.status_code == 401, (ejecutor, respuesta.text)


# ── El código que no existe sigue dando 404 ───────────────────────

def test_un_codigo_inexistente_sigue_siendo_404(api):
    """Al jugador que tipeó mal hay que decirle que no existe, no que no es
    suyo. El 404 va después de la identidad y antes de la pertenencia."""
    respuesta = get(api, PUERTA_JUGADOR, INEXISTENTE, TOKENS_JUGADOR[701])

    assert respuesta.status_code == 404, respuesta.text


def test_un_codigo_inexistente_sin_identidad_sigue_siendo_401(api):
    """La identidad va primero: un desconocido no averigua qué códigos
    existen probando y mirando si le contestan 404 o 403."""
    respuesta = get(api, PUERTA_JUGADOR, INEXISTENTE)

    assert respuesta.status_code == 401, respuesta.text


# ══════════════════════════════════════════════════════════════════
# LA PUERTA DEL JUGADOR — GET
# ══════════════════════════════════════════════════════════════════
#
# Es de solo lectura, y se cierra igual. No devuelve un número suelto:
# `detalle` trae selección por selección con su cuota original y la viva, o
# sea el contenido del ticket. Y es un oráculo: con el código a la vista,
# abierto servía para saber cuál conviene cerrar antes de cerrarlo.

def test_el_get_sin_identidad_contesta_401(api):
    respuesta = get(api, PUERTA_JUGADOR, "QP-701")

    assert respuesta.status_code == 401, respuesta.text


def test_el_get_de_un_boleto_ajeno_contesta_403(api):
    respuesta = get(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[702])

    assert respuesta.status_code == 403, respuesta.text


def test_el_get_del_propio_boleto_anda(api):
    respuesta = get(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[701])

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["disponible"] is True
    assert respuesta.json()["valor"] == VALOR


def test_el_get_no_escribe_nunca(api):
    """Consultar no cierra el boleto. Obvio, y por eso vale fijarlo: las dos
    puertas comparten `_valor_de_cashout`."""
    get(api, PUERTA_JUGADOR, "QP-701", TOKENS_JUGADOR[701])

    assert api.base_de_mentira.escrituras == []


def test_el_get_del_propio_boleto_no_pide_permiso_de_agencia(api):
    """Consultar no es cashear. 703 no puede ejecutar —AG-SIN no lo tiene
    habilitado— pero puede ver cuánto vale su propio boleto: negarle eso no
    protege nada y lo deja sin saber por qué no puede."""
    respuesta = get(api, PUERTA_JUGADOR, "QP-703", TOKENS_JUGADOR[703])

    assert respuesta.status_code == 200, respuesta.text


# ══════════════════════════════════════════════════════════════════
# LA PUERTA DEL MOSTRADOR
# ══════════════════════════════════════════════════════════════════

def test_la_ventanilla_sin_token_contesta_401(api):
    respuesta = post(api, PUERTA_AGENCIA, "QP-701")

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_un_token_de_jugador_no_abre_la_puerta_de_la_agencia(api):
    """`requiere_agencia` rechaza el prefijo `cliente:`. Si no, el jugador
    entraría por la puerta que alcanza a toda una rama.

    Es 403 y no 401 a propósito, y no se cambia desde acá: el token es válido
    y la sesión existe, lo que no alcanza es para qué sirve. Decirle 401 lo
    mandaría a renovar una sesión que está perfecta.
    """
    respuesta = post(api, PUERTA_AGENCIA, "QP-701", TOKENS_JUGADOR[701])

    assert respuesta.status_code == 403, respuesta.text
    assert respuesta.json()["detail"] == "Esta sesión no es de una agencia"
    assert api.base_de_mentira.escrituras == []


def test_la_ventanilla_cashea_un_boleto_de_su_rama(api):
    """El mostrador sigue funcionando: es la mitad del arreglo que no se ve.

    Si esto se pusiera rojo, el candado habría dejado a las agencias sin
    poder cashear en la ventanilla, que es una operación de todos los días.
    """
    respuesta = post(api, PUERTA_AGENCIA, "QP-701", TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos


def test_la_ventanilla_alcanza_a_su_subagencia(api):
    """La rama va hacia abajo: AG-A llega a los boletos de AG-A1.

    Si esto se pusiera rojo, el candado estaría comparando por igualdad en
    lugar de por rama y la agencia madre dejaría de poder operar.
    """
    respuesta = post(api, PUERTA_AGENCIA, "QP-SUB", TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text


def test_la_ventanilla_no_alcanza_otra_rama(api):
    """AG-B manda el código de un boleto de AG-A. Es el mismo agujero que ya
    se cerró en liquidar y en pagar-caja, acá también."""
    respuesta = post(api, PUERTA_AGENCIA, "QP-701", TOKEN_AG_B)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_la_ventanilla_cashea_el_boleto_de_mostrador(api):
    """`user_id NULL`: el que compró en la ventanilla no tiene cuenta.

    Ese boleto no es de ningún jugador, así que por la otra puerta no entra.
    Si esta tampoco lo tomara, no habría forma de cashearlo.
    """
    respuesta = post(api, PUERTA_AGENCIA, "QP-MOSTR", TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos


def test_el_boleto_de_mostrador_tampoco_lo_toca_otra_agencia(api):
    """Que no tenga jugador no lo hace de todos."""
    respuesta = post(api, PUERTA_AGENCIA, "QP-MOSTR", TOKEN_AG_B)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras == []


def test_la_ventanilla_sin_permiso_contesta_403(api):
    """AG-SIN está autenticada y el boleto es de su rama: lo único que le
    falta es el permiso, y acá se mira incondicionalmente."""
    respuesta = post(api, PUERTA_AGENCIA, "QP-703", TOKEN_AG_SIN)

    assert respuesta.status_code == 403, respuesta.text
    assert respuesta.json()["detail"] == (
        "Tu agencia no tiene habilitado el cash out. "
        "Pedíselo al administrador.")
    assert api.base_de_mentira.escrituras == []


def test_la_ventanilla_con_un_codigo_inexistente_da_404(api):
    """El 404 es anterior al candado y tiene que seguir primero: al cajero
    que tipeó mal un código hay que decirle que no existe."""
    respuesta = post(api, PUERTA_AGENCIA, INEXISTENTE, TOKEN_AG_A)

    assert respuesta.status_code == 404, respuesta.text


def test_el_get_de_la_ventanilla_pide_sesion(api):
    respuesta = get(api, PUERTA_AGENCIA, "QP-701")

    assert respuesta.status_code == 401, respuesta.text


def test_el_get_de_la_ventanilla_respeta_la_rama(api):
    respuesta = get(api, PUERTA_AGENCIA, "QP-701", TOKEN_AG_B)

    assert respuesta.status_code == 403, respuesta.text


def test_el_get_de_la_ventanilla_anda_en_su_rama(api):
    respuesta = get(api, PUERTA_AGENCIA, "QP-701", TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["disponible"] is True


# ══════════════════════════════════════════════════════════════════
# GUARDAS ESTRUCTURALES CONTRA LA REINCIDENCIA
# ══════════════════════════════════════════════════════════════════
#
# Las de arriba se podrían cumplir y el agujero volver: alcanza con que
# alguien agregue una ruta nueva, o saque un candado y adapte una prueba.

LAS_CUATRO = [
    ("GET",  "/api/betslip/{code}/cashout"),
    ("POST", "/api/betslip/{code}/cashout"),
    ("GET",  "/api/betslip/{code}/cashout/agencia"),
    ("POST", "/api/betslip/{code}/cashout/agencia"),
]


def _ruta(api, metodo, path):
    for r in api.app.routes:
        if getattr(r, "path", None) == path and metodo in getattr(r, "methods", ()):
            return r
    raise AssertionError(f"no existe {metodo} {path}")


@pytest.mark.parametrize("metodo,path", LAS_CUATRO)
def test_las_cuatro_puertas_existen(api, metodo, path):
    """Si una desaparece o se renombra, las pruebas de arriba se saltearían
    en silencio contra una ruta que ya no está."""
    assert _ruta(api, metodo, path) is not None


@pytest.mark.parametrize("metodo,path", LAS_CUATRO)
def test_ninguna_puerta_lee_el_permiso_del_cuerpo(api, metodo, path):
    """La guarda del arreglo.

    `agencia_code` quedó sin lector a propósito. Si alguien lo vuelve a leer
    del cuerpo, el permiso vuelve a venir del cliente y esto cae.
    """
    fuente = inspect.getsource(_ruta(api, metodo, path).endpoint)

    assert 'body.get("agencia_code")' not in fuente
    assert "agencia_ejec" not in fuente


@pytest.mark.parametrize("metodo", ["GET", "POST"])
def test_la_puerta_del_jugador_exige_identidad_y_pertenencia(api, metodo):
    fuente = inspect.getsource(
        _ruta(api, metodo, "/api/betslip/{code}/cashout").endpoint)

    assert "_jugador_del_cashout" in fuente, "dejó de pedir identidad"
    assert "_exigir_boleto_del_jugador" in fuente, "dejó de mirar de quién es"


def test_la_puerta_del_jugador_saca_la_agencia_del_jugador(api):
    """El permiso sale de `users.creado_por` del jugador autenticado."""
    fuente = inspect.getsource(
        _ruta(api, "POST", "/api/betslip/{code}/cashout").endpoint)

    assert "SELECT creado_por FROM users WHERE id=$1" in fuente
    assert "_exigir_cashout_habilitado" in fuente


@pytest.mark.parametrize("metodo", ["GET", "POST"])
def test_la_puerta_de_la_agencia_exige_sesion_y_rama(api, metodo):
    """La puerta del mostrador sigue pidiendo una sesión y sigue mirando la rama.

    La dependencia pasó de `requiere_agencia` a `requiere_ventanilla` cuando la
    terminal del local recibió su credencial: por esta puerta entran la agencia
    Y una terminal suya, con las mismas dos reglas. Lo que esta prueba fija no
    es el nombre de la dependencia sino que haya una, y que la rama se siga
    mirando. Que `requiere_ventanilla` no deje pasar al jugador lo fija
    `test_credencial_de_terminal`.
    """
    ruta = _ruta(api, metodo, "/api/betslip/{code}/cashout/agencia")
    fuente = inspect.getsource(ruta.endpoint)

    assert "Depends(requiere_ventanilla)" in fuente, \
        "dejó de pedir sesión de mostrador"
    assert "exigir_boleto_de_la_rama" in fuente, "dejó de mirar la rama"


def test_la_puerta_de_la_agencia_exige_el_permiso(api):
    fuente = inspect.getsource(
        _ruta(api, "POST", "/api/betslip/{code}/cashout/agencia").endpoint)

    assert "_exigir_cashout_habilitado" in fuente


def test_el_permiso_de_cashout_se_verifica_incondicionalmente(api):
    """El agujero no era que faltara la consulta: era que vivía adentro de un
    `if` sobre un dato del cuerpo y se salteaba sola.

    En `_exigir_cashout_habilitado` la consulta no está bajo ninguna
    condición que dependa del pedido: o hay permiso, o es 403.
    """
    fuente = inspect.getsource(api._exigir_cashout_habilitado)

    assert "SELECT puede_cashout FROM agencias WHERE code=$1" in fuente
    assert "body" not in fuente, "el permiso no puede mirar el cuerpo del pedido"


def test_el_rotulo_del_movimiento_no_sale_del_cuerpo(api):
    """`ejecutor` queda escrito en el `method` del movimiento de billetera.

    Antes lo elegía el cliente: una firma de auditoría falsificable. Ahora lo
    pone el servidor — 'cliente' en una puerta, el code autenticado en la otra.
    """
    for metodo, path in LAS_CUATRO:
        if metodo != "POST":
            continue
        fuente = inspect.getsource(_ruta(api, metodo, path).endpoint)
        assert 'body.get("ejecutor")' not in fuente, path
