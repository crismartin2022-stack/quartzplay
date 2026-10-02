"""
La credencial de la terminal: el Box deja de ser nadie.

El Box es la pantalla de autoconsulta que la agencia deja en el mostrador. No
pide iniciar sesión a propósito: es para el que llega con el ticket impreso y no
tiene cuenta, o no quiere sacar el teléfono.

Lo único que sabía de sí misma era el código de agencia de su dirección
—`/box/AGE002`—, y una dirección no es una credencial: la escribe cualquiera.
Por eso el cash out del Box exigía un endpoint abierto, y por eso ese endpoint
era un agujero. No fue un olvido: era la única forma de que el Box anduviera.
Cerrado el agujero (`test_el_cashout_lo_pide_su_dueno`), el Box perdió el botón.

Ahora la terminal tiene credencial propia: la agencia emite un código de un solo
uso desde su panel, la pantalla lo canjea una vez por un token, y desde ahí
manda `Authorization: Bearer` como todos los demás.

Qué fija esta prueba:

  · el código de alta se canjea UNA sola vez — la segunda vez no sale nada
  · un código vencido no sirve, y uno que no existe tampoco
  · el token resuelve a SU terminal y a SU agencia, no a otra
  · APAGAR LA TERMINAL CORTA EL ACCESO EN EL ACTO, no cuando venza el token
  · la terminal cashea un boleto de la rama de su agencia si esa agencia lo
    tiene habilitado
  · NO puede si la agencia no lo tiene habilitado
  · NO puede un boleto de otra rama
  · EL CÓDIGO PÚBLICO DEL QR NO CANJEA UNA CREDENCIAL — es el que decide que
    esto no sea un agujero nuevo
  · una terminal NO es una agencia: su token no abre las puertas de
    `requiere_agencia`
  · `ultimo_uso` se escribe cuando la terminal opera, que es lo que permite ver
    una robada o una que dejó de usarse

Los datos son de fixture: cuatro agencias inventadas, tres terminales, tres
jugadores y una base de mentira que anota con qué la consultaron. No hay ningún
pedido armado para tocar plata ajena: el candado corta antes, y eso es lo que se
mira.
"""
import asyncio
import importlib
import inspect
from datetime import datetime, timedelta, timezone

import httpx
import pytest

from test_runtime_config import settings


# ── Las agencias: su árbol y su permiso ───────────────────────────

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

NOMBRES_AGENCIA = {code: f"Agencia {code}" for code in RUTAS}

TOKEN_AG_A = "llave-de-AG-A"
TOKEN_AG_B = "llave-de-AG-B"


# ── Las terminales ────────────────────────────────────────────────
#
# El `codigo` es el del QR: corto, y PÚBLICO por su función —lo publica
# `/api/box/{code}/terminal` sin pedir nada—. Que no sirva para canjear una
# credencial es justamente lo que se prueba más abajo.
#
# La 13 está apagada desde el principio: no hace falta apagarla en la prueba
# para ver que una apagada no entra, y la 11 queda libre para el camino feliz.

TERMINALES = {
    11: {"codigo": "AGEA0001", "nombre": "Mostrador",
         "agencia_code": "AG-A",   "activa": True},
    12: {"codigo": "ASIN0001", "nombre": "Entrada",
         "agencia_code": "AG-SIN", "activa": True},
    13: {"codigo": "AGEA0002", "nombre": "La de la barra",
         "agencia_code": "AG-A",   "activa": False},
}

TOKENS_TERMINAL = {tid: f"llave-terminal-{tid}" for tid in TERMINALES}


# ── Los códigos de alta ───────────────────────────────────────────
#
# Viven en `terminal_altas`, que es OTRA tabla y otra columna que la del QR.

AHORA = datetime.now(timezone.utc)

ALTAS = {
    "TA-nueva":    {"terminal_id": 11, "usado": False,
                    "expira_at": AHORA + timedelta(hours=24)},
    "TA-ya-usada": {"terminal_id": 11, "usado": True,
                    "expira_at": AHORA + timedelta(hours=24)},
    "TA-vencida":  {"terminal_id": 11, "usado": False,
                    "expira_at": AHORA - timedelta(hours=1)},
    "TA-apagada":  {"terminal_id": 13, "usado": False,
                    "expira_at": AHORA + timedelta(hours=24)},
}

ALTA_INEXISTENTE = "TA-no-existe"


# ── Los jugadores y sus boletos ───────────────────────────────────

JUGADORES = {
    701: {"agencia": "AG-A",   "telegram_id": 999701},
    702: {"agencia": "AG-B",   "telegram_id": 999702},
    703: {"agencia": "AG-SIN", "telegram_id": 999703},
    705: {"agencia": "AG-A1",  "telegram_id": 999705},   # de la subagencia
    # EL JUGADOR 11 EXISTE A PROPÓSITO: 11 es también el id de una terminal.
    # `users.id` y `terminales.id` son dos secuencias distintas sobre el mismo
    # rango de números, así que hay jugadores cuyo id es el id de una terminal.
    # Es el mismo peligro que el comentario de `_jugador_del_cashout` nombra
    # para `users.id` y `telegram_id`: si el prefijo no se mirara, `cliente:11`
    # resolvería a la terminal 11 y la comparación daría bien de casualidad.
    11:  {"agencia": "AG-B",   "telegram_id": 999011},
}

TOKEN_JUGADOR = "llave-jugador-701"
TOKEN_JUGADOR_11 = "llave-jugador-11"

BOLETOS = {
    "QP-701":   {"user_id": 701,  "paid_by": "AG-A"},    # de la rama de AG-A
    "QP-702":   {"user_id": 702,  "paid_by": "AG-B"},    # de la OTRA rama
    "QP-703":   {"user_id": 703,  "paid_by": "AG-SIN"},  # agencia sin permiso
    "QP-SUB":   {"user_id": 705,  "paid_by": "AG-A1"},   # de la subagencia
    "QP-MOSTR": {"user_id": None, "paid_by": "AG-A"},    # mostrador, sin cuenta
}

VALOR = 500.0

PUERTA_VENTANILLA = "/api/betslip/{code}/cashout/agencia"


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

    El estado es mutable a propósito: `altas` y `terminales` se escriben igual
    que en la base, así que un canje de verdad quema su código y la prueba del
    segundo canje mira la consecuencia y no una promesa.

    `self.escrituras` es lo que importa cuando algo tiene que fallar: si un 401
    o un 403 dejó pasar un UPDATE, la prueba lo ve aunque la respuesta diga que
    falló.
    """

    def __init__(self, sesiones):
        self.consultas = []
        self.altas = {c: dict(d) for c, d in ALTAS.items()}
        self.terminales = {t: dict(d) for t, d in TERMINALES.items()}
        self.sesiones = sesiones
        self.ultimo_uso = {}

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

    @property
    def altas_emitidas(self):
        return [a for q, a in self.consultas
                if q.startswith("INSERT INTO terminal_altas")]

    def transaction(self):
        return _Transaccion()

    async def fetchrow(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        # ── El canje: una sola escritura condicional ──────────────
        #
        # LAS CONDICIONES SE LEEN DE LA CONSULTA, no se dan por puestas. Una
        # base de mentira que filtra por `usado` aunque el SQL no lo pida
        # contesta por el código en vez de ejecutarlo: sacarle el `usado =
        # false` al WHERE real no cambiaría nada y la prueba del "un solo uso"
        # quedaría verde sin probar nada. Lo encontró la comprobación por
        # mutación, que es para lo que sirve.
        if q.startswith("UPDATE terminal_altas SET usado = true"):
            alta = self.altas.get(args[0])
            if not alta:
                return None
            if "usado = false" in q and alta["usado"]:
                return None
            if ("expira_at > NOW()" in q
                    and alta["expira_at"] <= datetime.now(timezone.utc)):
                return None
            alta["usado"] = True
            alta["usado_at"] = datetime.now(timezone.utc)
            return _Fila(terminal_id=alta["terminal_id"])

        if "SELECT usado, expira_at FROM terminal_altas WHERE codigo=$1" in q:
            alta = self.altas.get(args[0])
            if not alta:
                return None
            return _Fila(usado=alta["usado"], expira_at=alta["expira_at"])

        # ── Resolver el token de terminal, y marcarle el uso ──────
        #
        # Igual que arriba: el `activa` se filtra solo si la consulta lo pide, y
        # el `ultimo_uso` se escribe solo si la consulta lo escribe. Las dos
        # formas —el UPDATE que autoriza y un SELECT suelto— se atienden acá a
        # propósito: así "apagar corta el acceso" y "la terminal marca su uso"
        # fallan cuando el código deja de hacerlo, y no cuando la base de
        # mentira se queda sin fixture.
        if ("terminales" in q and "WHERE id = $1" in q
                and "RETURNING id, codigo, nombre, agencia_code" in q
                or q.startswith("SELECT id, codigo, nombre, agencia_code "
                                "FROM terminales WHERE id = $1")):
            t = self.terminales.get(args[0])
            if not t:
                return None
            if "activa = true" in q and not t["activa"]:
                return None
            if "SET ultimo_uso = NOW()" in q:
                self.ultimo_uso[args[0]] = datetime.now(timezone.utc)
            return _Fila(id=args[0], codigo=t["codigo"], nombre=t["nombre"],
                         agencia_code=t["agencia_code"])

        if "SELECT id, codigo, nombre, agencia_code, activa FROM terminales" in q:
            t = self.terminales.get(args[0])
            if not t:
                return None
            return _Fila(id=args[0], codigo=t["codigo"], nombre=t["nombre"],
                         agencia_code=t["agencia_code"], activa=t["activa"])

        if "SELECT nombre, activa FROM terminales WHERE id=$1" in q:
            t = self.terminales.get(args[0])
            if not t:
                return None
            # La pertenencia también se lee de la consulta: si el endpoint deja
            # de pedir `agencia_code=$2`, acá deja de filtrarse y la prueba de
            # la terminal ajena se pone roja.
            if "agencia_code=$2" in q and t["agencia_code"] != args[1]:
                return None
            return _Fila(nombre=t["nombre"], activa=t["activa"])

        # ── La agencia de la terminal, para `/api/terminal/me` ────
        if "SELECT name, moneda, COALESCE(puede_cashout, FALSE)" in q:
            if args[0] not in RUTAS:
                return None
            return _Fila(name=NOMBRES_AGENCIA[args[0]], moneda="ARS",
                         puede_cashout=PUEDE_CASHOUT[args[0]])

        # ── El cash out ──────────────────────────────────────────
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
        if "SELECT ruta FROM agencias WHERE code=$1" in q:
            ruta = RUTAS.get(args[0])
            return _Fila(ruta=ruta) if ruta else None

        # El endpoint público del Box: la primera terminal activa de la agencia.
        if "SELECT codigo, nombre FROM terminales WHERE agencia_code=$1" in q:
            for tid in sorted(self.terminales):
                t = self.terminales[tid]
                if t["agencia_code"] == args[0] and t["activa"]:
                    return _Fila(codigo=t["codigo"], nombre=t["nombre"])
            return None

        raise AssertionError(f"fetchrow sin fixture: {q}")

    async def fetchval(self, query, *args):
        self._anotar(query, args)
        q = _norm(query)

        if "SELECT activa FROM terminales WHERE id=$1" in q:
            t = self.terminales.get(args[0])
            return t["activa"] if t else None
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

        # Buscar una terminal POR SU CÓDIGO DE QR. La base de mentira contesta
        # de verdad —devuelve la fila si ese código existe—, y eso importa:
        # antes esto devolvía None siempre, así que un canje que aceptara el
        # código del QR nunca lo encontraba y la prueba del código público
        # quedaba verde sin probar nada. Lo encontró la mutación.
        if "FROM terminales WHERE codigo=$1" in q:
            for tid, t in self.terminales.items():
                if t["codigo"] == args[0]:
                    return tid
            return None

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
        q = _norm(query)

        # La sesión se guarda de verdad: así el token que devuelve el canje
        # sirve para el pedido siguiente, y el camino completo se prueba entero
        # en vez de confiar en que el token "debería" andar.
        if q.startswith("INSERT INTO agencia_sesiones"):
            self.sesiones[args[0]] = args[1]
            return "INSERT 0 1"

        if q.startswith("INSERT INTO terminal_altas"):
            codigo, tid, agencia, expira = args[0], args[1], args[2], args[3]
            self.altas[codigo] = {"terminal_id": tid, "usado": False,
                                  "expira_at": expira}
            return "INSERT 0 1"

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

    # Las TRES clases de sesión, en la misma tabla y distinguidas solo por el
    # prefijo, igual que en la base: la agencia sin prefijo, el jugador con
    # `cliente:` y la terminal con `terminal:`.
    sesiones = {
        TOKEN_AG_A: "AG-A",
        TOKEN_AG_B: "AG-B",
        TOKEN_JUGADOR: "cliente:701",
        TOKEN_JUGADOR_11: "cliente:11",
    }
    for tid, token in TOKENS_TERMINAL.items():
        sesiones[token] = f"terminal:{tid}"

    async def fake_buscar(token):
        return sesiones.get(token)

    monkeypatch.setattr(modulo, "sesion_buscar", fake_buscar)

    # La valuación es de ellos y no se toca: sale a buscar cuotas vivas y tiene
    # su propia cobertura. Acá se fija disponible para que lo único que decida
    # el resultado sea la identidad.
    async def cashout_disponible(_picks, _stake, _odd_total):
        return {"disponible": True, "valor": VALOR, "stake": 100,
                "ganancia_potencial": 1000.0, "odd_original": 2.0,
                "odd_actual": 1.5, "detalle": []}

    monkeypatch.setattr(modulo, "_calcular_cashout", cashout_disponible)

    conn = FakeConnection(sesiones)

    async def fake_get_db():
        return FakePool(conn)

    monkeypatch.setattr(modulo, "get_db", fake_get_db)
    modulo.base_de_mentira = conn
    modulo.sesiones_de_mentira = sesiones
    return modulo


async def _pedir(app, metodo, url, cuerpo, token):
    transport = httpx.ASGITransport(app=app)
    headers = {"Authorization": f"Bearer {token}"} if token else {}
    async with httpx.AsyncClient(transport=transport,
                                 base_url="http://testserver") as client:
        if metodo == "GET":
            return await client.get(url, headers=headers)
        return await client.post(url, json=cuerpo or {}, headers=headers)


def post(api, url, token=None, cuerpo=None):
    return asyncio.run(_pedir(api.app, "POST", url, cuerpo, token))


def get(api, url, token=None):
    return asyncio.run(_pedir(api.app, "GET", url, None, token))


def canjear(api, codigo):
    return post(api, "/api/terminal/credencial", cuerpo={"codigo": codigo})


# ══════════════════════════════════════════════════════════════════
# EL ALTA: UN CÓDIGO DE UN SOLO USO
# ══════════════════════════════════════════════════════════════════

def test_la_agencia_emite_un_codigo_de_alta_para_su_terminal(api):
    """El camino feliz de la emisión: AG-A pide el alta de su terminal 11."""
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial",
                     TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["codigo"].startswith("TA-")
    assert respuesta.json()["terminal"] == "Mostrador"


def test_el_codigo_de_alta_no_se_parece_al_del_qr(api):
    """Un código de QR no puede ser un código de alta ni por casualidad.

    No es una cuestión de estilo: son dos espacios de valores distintos, y el
    canje busca en una tabla donde los del QR no están. Si alguien un día
    hiciera nacer los dos del mismo sorteo, el QR —que es público— pasaría a
    ser una credencial.
    """
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial",
                     TOKEN_AG_A)
    codigo = respuesta.json()["codigo"]

    assert codigo not in {t["codigo"] for t in TERMINALES.values()}
    assert len(codigo) > 16, "un código de alta corto se adivina"


def test_otra_agencia_no_emite_el_alta_de_una_terminal_ajena(api):
    """AG-B pide el alta de la terminal 11, que es de AG-A.

    Emitir la credencial de una terminal ajena es peor que editarla: deja a
    quien la pida cerrando boletos de la rama de otro.
    """
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial",
                     TOKEN_AG_B)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.altas_emitidas == []


def test_sin_sesion_no_se_emite_ningun_alta(api):
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial")

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.altas_emitidas == []


def test_el_token_de_un_jugador_no_emite_altas(api):
    """Las sesiones viven en la misma tabla. Sin el descarte del prefijo, la
    del jugador pasaría por agencia y emitiría credenciales de terminal."""
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial",
                     TOKEN_JUGADOR)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.altas_emitidas == []


def test_una_terminal_apagada_no_se_da_de_alta(api):
    """La 13 está apagada. Emitir un código para ella entregaría un token que
    el pedido siguiente rechaza, y el operador quedaría tipeando códigos que
    "andan" y no abren. El motivo se dice donde se puede arreglar."""
    respuesta = post(api, "/api/agencias/me/terminales/13/credencial",
                     TOKEN_AG_A)

    assert respuesta.status_code == 400, respuesta.text
    assert "apagada" in respuesta.json()["detail"]
    assert api.base_de_mentira.altas_emitidas == []


def test_la_terminal_canjea_su_codigo_y_recibe_un_token(api):
    respuesta = canjear(api, "TA-nueva")

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["ok"] is True
    assert cuerpo["token"]
    assert cuerpo["terminal"]["codigo"] == "AGEA0001"
    assert cuerpo["terminal"]["agencia_code"] == "AG-A"


def test_el_codigo_de_alta_se_canjea_UNA_sola_vez(api):
    """La que define "de un solo uso". El primero sale con token; el segundo,
    con el mismo código y a los dos segundos, no saca nada."""
    primero = canjear(api, "TA-nueva")
    segundo = canjear(api, "TA-nueva")

    assert primero.status_code == 200, primero.text
    assert segundo.status_code == 410, segundo.text
    assert "ya se usó" in segundo.json()["detail"]


def test_el_segundo_canje_no_emite_un_segundo_token(api):
    """La consecuencia, no el código de estado: dos credenciales vivas para la
    misma pantalla es exactamente lo que un código de un solo uso evita."""
    primero = canjear(api, "TA-nueva")
    segundo = canjear(api, "TA-nueva")

    assert segundo.json().get("token") is None
    tokens = [t for t, quien in api.sesiones_de_mentira.items()
              if quien == "terminal:11" and t not in TOKENS_TERMINAL.values()]
    assert len(tokens) == 1, "se emitió más de una credencial"
    assert tokens[0] == primero.json()["token"]


def test_el_canje_quema_el_codigo_en_una_sola_escritura(api):
    """No un SELECT y después un UPDATE: dos canjes a la vez leerían los dos
    `usado=false` y saldrían los dos con una credencial. El `usado = false` va
    adentro del WHERE, que es el único lugar donde la base puede decidirlo."""
    fuente = inspect.getsource(api.canjear_alta_terminal)

    assert "UPDATE terminal_altas" in fuente
    assert "usado = false" in fuente
    assert "RETURNING terminal_id" in fuente


def test_un_codigo_ya_usado_no_sirve(api):
    respuesta = canjear(api, "TA-ya-usada")

    assert respuesta.status_code == 410, respuesta.text
    assert respuesta.json().get("token") is None


def test_un_codigo_vencido_no_sirve(api):
    """Vence en 24 h. Un código de alta que no vence es una credencial latente:
    queda anotado en un papel del mostrador y sirve meses después."""
    respuesta = canjear(api, "TA-vencida")

    assert respuesta.status_code == 410, respuesta.text
    assert "venció" in respuesta.json()["detail"]
    assert respuesta.json().get("token") is None


def test_un_codigo_que_no_existe_no_sirve(api):
    respuesta = canjear(api, ALTA_INEXISTENTE)

    assert respuesta.status_code == 404, respuesta.text
    assert respuesta.json().get("token") is None


def test_canjear_sin_codigo_no_entrega_nada(api):
    respuesta = post(api, "/api/terminal/credencial", cuerpo={})

    assert respuesta.status_code == 400, respuesta.text
    assert respuesta.json().get("token") is None


def test_un_codigo_de_una_terminal_apagada_no_entrega_credencial(api):
    """El código de la 13 se emitió cuando estaba encendida (o alguien la
    apagó en las 24 h que el código vive). Al canjear se vuelve a mirar la
    fila: apagada no se da de alta."""
    respuesta = canjear(api, "TA-apagada")

    assert respuesta.status_code == 403, respuesta.text
    assert respuesta.json().get("token") is None


# ══════════════════════════════════════════════════════════════════
# EL CÓDIGO PÚBLICO DEL QR NO ES UNA CREDENCIAL
# ══════════════════════════════════════════════════════════════════

def test_el_endpoint_publico_sigue_publicando_el_codigo_del_qr(api):
    """Primero, que el dato ES público: sin esto la prueba de abajo no dice
    nada. `/api/box/{code}/terminal` no pide ninguna credencial y devuelve el
    código del QR tal cual. Es correcto que lo haga —el Box lo necesita para
    mostrarlo— y es exactamente por eso que ese código no puede canjear nada.
    """
    respuesta = get(api, "/api/box/AG-A/terminal")

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["terminal"]["codigo"] == "AGEA0001"


@pytest.mark.parametrize("codigo_qr",
                         [t["codigo"] for t in TERMINALES.values()])
def test_el_codigo_publico_del_qr_no_canjea_una_credencial(api, codigo_qr):
    """LA PRUEBA QUE SOSTIENE TODO EL DISEÑO.

    `terminales.codigo` es público por su función: va impreso en el QR pegado
    en la pared, lo publica un endpoint abierto y lo acepta `abrir_terminal` de
    cualquiera que escanee. Si ese código canjeara una credencial, cualquiera
    que mirara la pared —o que llamara al endpoint público— se haría pasar por
    terminal y cashearía boletos de esa agencia. El agujero volvería por otra
    puerta y más silenciosa que la primera.

    Se prueban los tres códigos de QR, no uno: el que se olvida es el que falla.
    """
    respuesta = canjear(api, codigo_qr)

    assert respuesta.status_code in (404, 410), respuesta.text
    assert respuesta.json().get("token") is None
    assert api.sesiones_de_mentira.get(codigo_qr) is None


def test_el_codigo_del_qr_tampoco_sirve_como_token(api):
    """La vuelta: tipearlo en el `Bearer` tampoco. Es el `sesion_buscar` el que
    corta, pero conviene fijarlo porque es el intento obvio."""
    for codigo_qr in (t["codigo"] for t in TERMINALES.values()):
        respuesta = get(api, "/api/terminal/me", codigo_qr)

        assert respuesta.status_code == 401, respuesta.text


# ══════════════════════════════════════════════════════════════════
# EL TOKEN RESUELVE A SU TERMINAL Y A SU AGENCIA
# ══════════════════════════════════════════════════════════════════

def test_la_terminal_sabe_quien_es(api):
    """Y de paso fija el orden de las rutas: `/api/terminal/me` tiene que estar
    registrada ANTES de `/api/terminal/{codigo}`, porque `{codigo}` matchea
    "me". Si alguien la mueve abajo, esto da el 404 de "Terminal no disponible"
    en vez de 200."""
    respuesta = get(api, "/api/terminal/me", TOKENS_TERMINAL[11])

    assert respuesta.status_code == 200, respuesta.text
    cuerpo = respuesta.json()
    assert cuerpo["codigo"] == "AGEA0001"
    assert cuerpo["nombre"] == "Mostrador"
    assert cuerpo["agencia_code"] == "AG-A"
    assert cuerpo["puede_cashout"] is True


def test_cada_token_resuelve_a_SU_terminal_y_no_a_otra(api):
    """Dos terminales de dos agencias distintas. Si el token no se resolviera
    contra su fila, la de AG-SIN contestaría como la de AG-A."""
    una = get(api, "/api/terminal/me", TOKENS_TERMINAL[11]).json()
    otra = get(api, "/api/terminal/me", TOKENS_TERMINAL[12]).json()

    assert (una["codigo"], una["agencia_code"]) == ("AGEA0001", "AG-A")
    assert (otra["codigo"], otra["agencia_code"]) == ("ASIN0001", "AG-SIN")


def test_la_agencia_de_la_terminal_sale_de_su_fila(api):
    """No de la dirección del Box ni del cuerpo del pedido: esa es la
    diferencia entre una credencial y un `/box/AGE002` que escribe cualquiera."""
    fuente = inspect.getsource(api._terminal_de_sesion)

    assert "RETURNING id, codigo, nombre, agencia_code" in fuente


def test_el_token_recien_canjeado_sirve_para_operar(api):
    """El camino completo, de punta a punta: se canjea el código y el token que
    salió de ahí identifica la terminal en el pedido siguiente."""
    token = canjear(api, "TA-nueva").json()["token"]

    respuesta = get(api, "/api/terminal/me", token)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["codigo"] == "AGEA0001"


def test_sin_credencial_la_pantalla_recibe_un_401_que_le_dice_qué_hacer(api):
    """El Box muestra este texto. "No autorizado" no le dice al operador del
    mostrador que tiene que pedirle un código a la agencia."""
    respuesta = get(api, "/api/terminal/me")

    assert respuesta.status_code == 401, respuesta.text
    assert "código de alta" in respuesta.json()["detail"]


# ══════════════════════════════════════════════════════════════════
# APAGAR LA TERMINAL CORTA EL ACCESO EN EL ACTO
# ══════════════════════════════════════════════════════════════════

def test_una_terminal_apagada_no_entra_aunque_su_token_siga_vivo(api):
    """La 13 está apagada y su token está en la tabla de sesiones, sin vencer.

    El mismo criterio que se le aplicó a las sesiones de agencia hace dos días:
    la baja pega en el pedido siguiente, no cuando el token vence solo. Una
    pantalla de mostrador se roba, o queda encendida en un local que cerró.
    """
    assert api.sesiones_de_mentira[TOKENS_TERMINAL[13]] == "terminal:13"

    respuesta = get(api, "/api/terminal/me", TOKENS_TERMINAL[13])

    assert respuesta.status_code == 403, respuesta.text
    assert "apagada" in respuesta.json()["detail"]


def test_apagarla_corta_el_acceso_EN_EL_ACTO(api):
    """La que importa: la misma terminal, el mismo token, antes y después.

    Entra, la agencia la apaga —el botón que ya existía—, y el pedido siguiente
    con el token idéntico ya no entra. Sin vencimientos en el medio.
    """
    antes = get(api, "/api/terminal/me", TOKENS_TERMINAL[11])
    assert antes.status_code == 200, antes.text

    # Lo que hace `borrar_terminal`: `UPDATE terminales SET activa=false`.
    api.base_de_mentira.terminales[11]["activa"] = False

    despues = get(api, "/api/terminal/me", TOKENS_TERMINAL[11])

    assert despues.status_code == 403, despues.text


def test_apagarla_tambien_le_corta_el_cash_out_en_el_acto(api):
    """Y que no sea solo `/me`: lo que se quiere cortar es la plata.

    Se cuentan las escrituras de boletos antes y después de apagarla. La
    primera operación cierra uno —es el camino feliz—, y la segunda no tiene
    que cerrar nada: si el contador se movió, la apagada cobró.
    """
    antes = post(api, PUERTA_VENTANILLA.format(code="QP-701"),
                 TOKENS_TERMINAL[11])
    assert antes.status_code == 200, antes.text
    escrituras_al_apagar = len(api.base_de_mentira.escrituras_de_boletos)

    api.base_de_mentira.terminales[11]["activa"] = False

    despues = post(api, PUERTA_VENTANILLA.format(code="QP-MOSTR"),
                   TOKENS_TERMINAL[11])

    assert despues.status_code == 403, despues.text
    assert len(api.base_de_mentira.escrituras_de_boletos) == \
        escrituras_al_apagar, "la apagada cerró un boleto"


def test_el_activa_va_en_el_where_del_update_que_autoriza(api):
    """No en un `if` después de leer la fila. Atado al mismo statement no hay
    forma de autorizar sin haberlo mirado, y una apagada no escribe nada."""
    fuente = inspect.getsource(api._terminal_de_sesion)

    assert "WHERE id = $1 AND activa = true" in fuente


def test_una_terminal_apagada_no_deja_marca_de_uso(api):
    """El `ultimo_uso` tiene que medir uso REAL. Si una apagada lo moviera, la
    fecha diría que la terminal trabaja justo cuando no puede."""
    get(api, "/api/terminal/me", TOKENS_TERMINAL[13])

    assert 13 not in api.base_de_mentira.ultimo_uso


# ══════════════════════════════════════════════════════════════════
# `ultimo_uso`: LO QUE PERMITE VER UNA ROBADA
# ══════════════════════════════════════════════════════════════════

def test_la_terminal_marca_su_ultimo_uso_al_operar(api):
    """La columna existía desde el principio y nadie la escribía fuera del
    escaneo del QR, así que no servía para lo único que importa: ver una
    terminal que dejó de usarse, o una que opera con el local cerrado."""
    post(api, PUERTA_VENTANILLA.format(code="QP-701"), TOKENS_TERMINAL[11])

    assert 11 in api.base_de_mentira.ultimo_uso


def test_el_ultimo_uso_se_escribe_en_el_mismo_update_que_autoriza(api):
    """Atado al statement que autoriza no puede quedar atrás: si la terminal
    operó, la fecha se movió. En una llamada aparte, el primer `return`
    temprano que alguien agregue la deja sin escribir y nadie se entera."""
    fuente = inspect.getsource(api._terminal_de_sesion)

    assert "UPDATE terminales SET ultimo_uso = NOW()" in fuente
    assert "RETURNING" in fuente


# ══════════════════════════════════════════════════════════════════
# LA TERMINAL CASHEA POR LA PUERTA DE LA VENTANILLA
# ══════════════════════════════════════════════════════════════════

def test_la_terminal_cashea_un_boleto_de_la_rama_de_su_agencia(api):
    """El camino feliz, y el botón que el Box recupera: la terminal 11 es de
    AG-A, AG-A tiene el cash out habilitado, y QP-701 es de su rama."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-701"),
                     TOKENS_TERMINAL[11])

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["ok"] is True
    assert respuesta.json()["valor"] == VALOR


def test_la_terminal_cierra_el_boleto_de_verdad(api):
    post(api, PUERTA_VENTANILLA.format(code="QP-701"), TOKENS_TERMINAL[11])

    assert api.base_de_mentira.escrituras_de_boletos


def test_la_terminal_cashea_el_boleto_de_mostrador(api):
    """`user_id NULL`: el que compró en la ventanilla no tiene cuenta. Es el
    caso más corriente del Box, y por la puerta del jugador no entra nunca."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-MOSTR"),
                     TOKENS_TERMINAL[11])

    assert respuesta.status_code == 200, respuesta.text


def test_la_terminal_consulta_el_valor(api):
    respuesta = get(api, PUERTA_VENTANILLA.format(code="QP-701"),
                    TOKENS_TERMINAL[11])

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["valor"] == VALOR


def test_la_terminal_no_cashea_si_su_agencia_no_lo_tiene_habilitado(api):
    """La terminal 12 es de AG-SIN, que está autenticada igual que las otras:
    lo único que le falta es el permiso, y eso alcanza.

    La terminal no es una excepción al permiso de su agencia. Si lo fuera,
    habilitar el cash out se podría saltear comprando una pantalla.
    """
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-703"),
                     TOKENS_TERMINAL[12])

    assert respuesta.status_code == 403, respuesta.text
    assert "habilitado" in respuesta.json()["detail"]


def test_la_terminal_sin_permiso_no_escribe_nada(api):
    post(api, PUERTA_VENTANILLA.format(code="QP-703"), TOKENS_TERMINAL[12])

    assert api.base_de_mentira.escrituras_de_boletos == []
    assert api.base_de_mentira.escrituras_de_saldo == []


def test_la_terminal_sin_permiso_tampoco_consulta_el_valor(api):
    """El `detalle` que devuelve la consulta es el contenido del ticket."""
    respuesta = get(api, PUERTA_VENTANILLA.format(code="QP-702"),
                    TOKENS_TERMINAL[12])

    assert respuesta.status_code == 403, respuesta.text


def test_la_terminal_no_cashea_un_boleto_de_otra_rama(api):
    """La 11 es de AG-A y QP-702 es del jugador de AG-B. Compiten entre ellas y
    es plata: el código del boleto va impreso en el ticket."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-702"),
                     TOKENS_TERMINAL[11])

    assert respuesta.status_code == 403, respuesta.text
    assert "rama" in respuesta.json()["detail"]


def test_el_boleto_de_otra_rama_no_se_escribe(api):
    post(api, PUERTA_VENTANILLA.format(code="QP-702"), TOKENS_TERMINAL[11])

    assert api.base_de_mentira.escrituras_de_boletos == []
    assert api.base_de_mentira.escrituras_de_saldo == []


def test_la_terminal_si_cashea_un_boleto_de_su_SUBagencia(api):
    """La rama es la rama: AG-A1 cuelga de AG-A, así que el boleto del jugador
    de la subagencia SÍ es de la rama de la terminal de la casa madre. Es la
    misma regla que la caja —`exigir_boleto_de_la_rama`—, no una más chica.

    Importa que sea la misma y no una recortada: si la terminal mirara solo su
    propia agencia en vez de la rama, el boleto que la subagencia vendió no se
    podría cashear en el mostrador de la madre, y eso es venta de todos los
    días.
    """
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-SUB"),
                     TOKENS_TERMINAL[11])

    assert respuesta.status_code == 200, respuesta.text


def test_la_terminal_de_la_subagencia_no_cashea_hacia_arriba(api):
    """Y la rama es hacia ABAJO, no en las dos direcciones: la 12 es de AG-SIN,
    que no tiene a AG-A debajo. Sin esto "la rama" sería "cualquiera del árbol".
    """
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-SUB"),
                     TOKENS_TERMINAL[12])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos == []


def test_el_rotulo_del_movimiento_nombra_la_terminal(api):
    """"Lo cerró la caja" y "lo cerró la pantalla de la entrada" no son el mismo
    hecho cuando hay que revisar un movimiento. Y el rótulo lo pone el
    servidor: antes lo elegía el cliente ('box', o lo que quisiera)."""
    post(api, PUERTA_VENTANILLA.format(code="QP-701"), TOKENS_TERMINAL[11])

    movimientos = [args for q, args in api.base_de_mentira.consultas
                   if q.startswith("INSERT INTO wallet_transactions")]
    assert movimientos, "no quedó movimiento de billetera"
    assert "terminal AGEA0001" in movimientos[0][-1]


def test_el_rotulo_de_la_agencia_no_cambio(api):
    """La caja sigue firmando con su code: la terminal se sumó sin tocar lo que
    ya andaba."""
    post(api, PUERTA_VENTANILLA.format(code="QP-701"), TOKEN_AG_A)

    movimientos = [args for q, args in api.base_de_mentira.consultas
                   if q.startswith("INSERT INTO wallet_transactions")]
    assert movimientos
    assert movimientos[0][-1].endswith("por AG-A")


# ══════════════════════════════════════════════════════════════════
# UNA TERMINAL NO ES UNA AGENCIA
# ══════════════════════════════════════════════════════════════════
#
# Una terminal es una identidad de LOCAL, no de persona: está en un mostrador y
# la toca cualquiera que pase. Su token abre tres puertas y ninguna más. Lo que
# la mantiene afuera de las demás es que su prefijo está en
# `PREFIJOS_NO_AGENCIA`, el mismo descarte que ya dejaba afuera al jugador.

PUERTAS_DE_AGENCIA = [
    ("GET",  "/api/agencias/me/terminales"),
    ("GET",  "/api/agencias/me/puede-cashout"),
    ("POST", "/api/agencias/me/terminales/11/credencial"),
    ("POST", "/api/betslip/QP-701/cashout/pagar-caja"),
]


@pytest.mark.parametrize("metodo,ruta", PUERTAS_DE_AGENCIA)
def test_el_token_de_terminal_no_abre_las_puertas_de_la_agencia(api, metodo,
                                                                ruta):
    """Si esto se pone verde en algún momento, la pantalla del mostrador pasó a
    poder lo que puede la agencia: cargar saldo, ver cuentas, emitirse
    credenciales nuevas a sí misma. Un 403 acá es el alcance, no un faltante.
    """
    if metodo == "GET":
        respuesta = get(api, ruta, TOKENS_TERMINAL[11])
    else:
        respuesta = post(api, ruta, TOKENS_TERMINAL[11])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos == []
    assert api.base_de_mentira.altas_emitidas == []


def test_la_terminal_no_se_emite_credenciales_a_si_misma(api):
    """El caso que más importa de la lista de arriba, con nombre propio: una
    pantalla que puede emitir altas se clona sola y la agencia no se entera."""
    respuesta = post(api, "/api/agencias/me/terminales/11/credencial",
                     TOKENS_TERMINAL[11])

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.altas_emitidas == []


def test_el_descarte_del_prefijo_esta_en_un_solo_lugar(api):
    """`exigir_sesion_de_agencia` es la regla, y la terminal se sumó a la tupla
    en vez de copiarse un `if`. Dos copias de una regla de seguridad es cómo
    una se queda vieja: el agujero de `/api/imprimir` existió por eso."""
    fuente = inspect.getsource(api.exigir_sesion_de_agencia)

    assert "PREFIJOS_NO_AGENCIA" in fuente
    assert api.PREFIJO_TERMINAL in api.PREFIJOS_NO_AGENCIA
    assert api.PREFIJO_CLIENTE in api.PREFIJOS_NO_AGENCIA


def test_el_token_de_un_jugador_no_resuelve_a_la_terminal_con_su_mismo_id(api):
    """`users.id` y `terminales.id` son dos secuencias sobre el mismo rango.

    El jugador 11 existe y la terminal 11 también. Si `requiere_terminal` no
    exigiera el prefijo, `cliente:11` llegaría a `_terminal_de_sesion`, el
    `int("11")` daría 11, y el jugador entraría como la terminal de AG-A: con
    su cash out de ventanilla y su rama. Daría bien de casualidad, que es la
    peor forma de dar bien.
    """
    respuesta = get(api, "/api/terminal/me", TOKEN_JUGADOR_11)

    assert respuesta.status_code == 401, respuesta.text
    assert 11 not in api.base_de_mentira.ultimo_uso, \
        "el token del jugador movió el `ultimo_uso` de una terminal"


def test_el_jugador_con_id_de_terminal_tampoco_cashea_por_la_ventanilla(api):
    """La consecuencia con plata del cruce de arriba."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-701"),
                     TOKEN_JUGADOR_11)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos == []


def test_el_token_de_terminal_no_es_el_de_un_jugador(api):
    """La otra dirección del cruce: la terminal tampoco es un jugador, así que
    no entra por la puerta del jugador ni ve los datos de una cuenta."""
    respuesta = post(api, "/api/betslip/QP-701/cashout", TOKENS_TERMINAL[11])

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos == []


def test_el_token_de_un_jugador_no_entra_por_la_ventanilla(api):
    """`requiere_ventanilla` acepta dos identidades, no tres. Agrandar una
    puerta es el momento exacto en que se cuela la tercera."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-701"),
                     TOKEN_JUGADOR)

    assert respuesta.status_code == 403, respuesta.text
    assert api.base_de_mentira.escrituras_de_boletos == []


def test_la_agencia_sigue_entrando_por_la_ventanilla(api):
    """Lo que ya andaba sigue andando: la terminal se sumó a la puerta, no la
    reemplazó."""
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-701"), TOKEN_AG_A)

    assert respuesta.status_code == 200, respuesta.text
    assert respuesta.json()["ok"] is True


def test_sin_ningun_token_la_ventanilla_sigue_cerrada(api):
    respuesta = post(api, PUERTA_VENTANILLA.format(code="QP-701"))

    assert respuesta.status_code == 401, respuesta.text
    assert api.base_de_mentira.escrituras == []
