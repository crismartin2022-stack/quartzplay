"""Los endpoints que aceptan "admin O agencia" entran por una sola puerta.

EL AGUJERO QUE ESTO CIERRA. Esta línea estaba copiada ocho veces en
`casino_api.py`:

    token = request.headers.get("Authorization","").replace("Bearer ","")

y ninguna de las ocho copias miraba la CLASE de sesión. Las tres clases viven
en la misma tabla `agencia_sesiones` y solo se distinguen por un prefijo en
`agencia_code`: una agencia guarda su código a secas (`"AG001"`), un jugador
guarda `"cliente:701"` y una terminal `"terminal:12"`. `sesion_buscar`
devuelve lo que haya guardado, tal cual, así que el token de un jugador
pasaba la validación y el endpoint seguía con `agencia_code = "cliente:701"`.

De las ocho, una —`registrar_impresion`— sí sentía el daño: escribía ese code
en `impresiones_log` y dejaba filas a nombre de nadie (ver
`test_imprimir_no_acepta_token_de_jugador`). Las otras siete estaban cerradas
POR ACCIDENTE: chocaban después contra una consulta que no devuelve nada
—ninguna agencia se llama `cliente:701`, así que `codes_de_la_rama` devuelve
una rama donde el objetivo no está— y el jugador recibía 403 o 404 y parecía
cerrado. Siete endpoints a un refactor de distancia de reabrirse: cualquiera
que cambiara el orden de esas consultas, o que agregara un camino que escribe
antes de verificar, reabría el agujero sin tocar nada que se vea.

POR QUÉ ESTAS PRUEBAS VAN POR HTTP Y NO LLAMANDO A LA FUNCIÓN. El arreglo
mueve la autenticación del CUERPO a la FIRMA de la función, con un
`Depends(requiere_admin_o_agencia)`. Una prueba que llame a la función
directamente tiene que pasarle la credencial ya resuelta, o sea que probaría
el cuerpo y no la puerta: la dependencia no correría. Por HTTP corre la cadena
completa, que es exactamente lo que cambia.

EL CONTRATO. Para cada endpoint se fijan los cuatro casos que el refactor
tenía que preservar —sesión de agencia válida, clave de admin, sin nada, y
token de jugador— y los números son los que daba el código ANTES del
refactor. Los tres primeros no se movieron; el cuarto es el único que cambia,
y pasa de "cerrado de casualidad" a cerrado a propósito. Si alguien vuelve a
abrir una de las puertas, cae el caso de su fila y no una prueba genérica:
la tabla dice qué endpoint y con qué credencial.

El doble de la base es el de `test_imprimir_no_acepta_token_de_jugador`,
ampliado a las tablas que tocan estos ocho. Respeta `expira_at` —si no
mirara la fecha, una prueba de vencimiento no diría nada— y es permisivo con
lo que no es de autenticación: devuelve filas plausibles para que el camino
feliz llegue hasta el final, porque lo que se compara acá es la puerta, no el
reporte que sale del otro lado.
"""
import asyncio
import importlib
from datetime import datetime, timedelta, timezone

import pytest

from test_runtime_config import settings


AGENCIA = "AG001"          # la agencia que entra: raíz de su rama
SUB = "AG002"              # una sub-agencia suya, objetivo de los endpoints
INFLUENCER = "INF001"      # influencer colgado de AGENCIA
JUGADOR = 701              # cliente creado por AGENCIA
SESION_DE_JUGADOR = f"cliente:{JUGADOR}"
SESION_DE_TERMINAL = "terminal:12"
CLAVE_ADMIN = "test-admin-key"


def _ahora():
    return datetime.now(timezone.utc)


def _norm(query):
    return " ".join(query.split())


# ── EL DOBLE DE LA BASE ───────────────────────────────────────────

def _fila_agencia(code, ruta, tipo="agencia", parent=None, permiso="ambos"):
    """Una fila de `agencias` con todas las columnas que leen estos ocho.

    Están todas y no las justas a propósito: `configurar_cuenta` hace
    `SELECT *` y después lee una docena de columnas, y una fila incompleta
    haría fallar la prueba por un KeyError que no tiene nada que ver con la
    puerta que se está probando.
    """
    return {
        "code": code, "name": f"Agencia {code}", "username": code.lower(),
        "password_hash": "x", "parent_code": parent, "ruta": ruta,
        "nivel": ruta.count("/"), "pct_ggr": 10.0, "pct_ventas": 5.0,
        "moneda": "ARS", "tipo": tipo, "status": "active",
        "address": "calle 1", "phone": "123", "saldo_cc": 0,
        "alcance": "solo_agencia", "permiso": permiso,
        "codigo_ref": "REF000001", "pct_ggr_casino": 0, "pct_desafios": 0,
    }


class FakeConnection:
    """Las tablas que tocan los ocho endpoints, y nada más.

    Lo que es de autenticación —`agencia_sesiones`, y el `tipo` y la `ruta`
    de `agencias`— está modelado en serio, porque es lo que decide. El resto
    contesta lo mínimo plausible: lo que se prueba acá es quién entra, no la
    aritmética del reporte que sale después.
    """

    def __init__(self):
        self.sesiones = {}              # token -> (agencia_code, expira_at)
        self.agencias = {
            AGENCIA: _fila_agencia(AGENCIA, AGENCIA),
            SUB: _fila_agencia(SUB, f"{AGENCIA}/{SUB}", parent=AGENCIA),
            INFLUENCER: _fila_agencia(INFLUENCER, f"{AGENCIA}/{INFLUENCER}",
                                      tipo="influencer", parent=AGENCIA),
        }
        self.users = {JUGADOR: {"id": JUGADOR, "creado_por": AGENCIA,
                                "nombre_completo": "Juan Jugador"}}
        self.escrituras = []            # cada INSERT/UPDATE que llegó
        # Cada consulta que llegó, en orden. Sirve para probar que un rechazo
        # ocurrió ANTES de ir a la base y no después de preguntar por un code
        # que no puede existir: ver
        # `test_el_descarte_de_clase_corta_antes_de_consultar_la_base`.
        self.consultas = []

    def poner_sesion(self, token, code, horas=8):
        self.sesiones[token] = (code, _ahora() + timedelta(hours=horas))

    # ── lecturas ──
    async def fetchrow(self, query, *args):
        q = _norm(query)
        self.consultas.append(q)

        if q.startswith("SELECT agencia_code FROM agencia_sesiones"):
            fila = self.sesiones.get(args[0])
            if not fila or fila[1] <= _ahora():
                return None
            return {"agencia_code": fila[0]}

        if q.startswith("SELECT * FROM agencias WHERE code"):
            return self.agencias.get(args[0])

        if q.startswith("SELECT ruta FROM agencias WHERE code"):
            fila = self.agencias.get(args[0])
            return {"ruta": fila["ruta"]} if fila else None

        if q.startswith("SELECT tipo FROM agencias WHERE code"):
            fila = self.agencias.get(args[0])
            return {"tipo": fila["tipo"]} if fila else None

        if q.startswith("SELECT parent_code FROM agencias WHERE code")  \
                and "tipo='influencer'" in q:
            fila = self.agencias.get(args[0])
            if not fila or fila["tipo"] != "influencer":
                return None
            return {"parent_code": fila["parent_code"]}

        if q.startswith("SELECT pct_ggr, pct_ventas FROM agencias WHERE code"):
            fila = self.agencias.get(args[0])
            if not fila:
                return None
            return {"pct_ggr": fila["pct_ggr"], "pct_ventas": fila["pct_ventas"]}

        if q.startswith("SELECT id, creado_por, nombre_completo FROM users"):
            return self.users.get(args[0])

        if q.startswith("SELECT creado_por FROM users"):
            fila = self.users.get(args[0])
            return {"creado_por": fila["creado_por"]} if fila else None

        if q.startswith("SELECT a.name, a.username, a.codigo_ref"):
            fila = self.agencias.get(args[0])
            if not fila or fila["tipo"] != "influencer":
                return None
            return dict(fila, parent_name="Agencia AG001")

        if q.startswith("INSERT INTO liquidaciones"):
            self.escrituras.append(("liquidaciones", args))
            return {"id": 1}

        raise AssertionError(f"consulta no prevista por la prueba: {q}")

    async def fetch(self, query, *args):
        q = _norm(query)
        self.consultas.append(q)

        # `codes_de_la_rama`: la rama hacia abajo de una ruta.
        if q.startswith("SELECT code FROM agencias WHERE ruta"):
            ruta = args[0]
            return [{"code": f["code"]} for f in self.agencias.values()
                    if f["ruta"] == ruta or f["ruta"].startswith(ruta + "/")]

        if "FROM agencias" in q and "tipo='influencer'" in q:
            return [dict(f) for f in self.agencias.values()
                    if f["tipo"] == "influencer"
                    and (len(args) == 0 or f["parent_code"] in args[0])]

        if q.startswith("SELECT code, name, pct_ggr, pct_ventas FROM agencias"):
            return []

        # combos, jugadas y cualquier otro listado del reporte.
        return []

    async def fetchval(self, query, *args):
        q = _norm(query)
        self.consultas.append(q)
        if q.startswith("SELECT activa FROM terminales"):
            return None
        return 0

    async def execute(self, query, *args):
        self.escrituras.append((_norm(query)[:60], args))
        return "OK"


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


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    api = importlib.reload(importlib.import_module("casino_api"))
    monkeypatch.setattr(api.auth, "ADMIN_API_KEY", CLAVE_ADMIN)
    return api


@pytest.fixture
def conn(api, monkeypatch):
    c = FakeConnection()
    c.poner_sesion("t-agencia", AGENCIA)
    c.poner_sesion("t-jugador", SESION_DE_JUGADOR)
    c.poner_sesion("t-terminal", SESION_DE_TERMINAL)
    c.poner_sesion("t-influencer", INFLUENCER)

    async def fake_get_db():
        return FakePool(c)

    monkeypatch.setattr(api, "get_db", fake_get_db)
    return c


@pytest.fixture
def cliente(api):
    """El cliente HTTP, sin el `with`: el arranque de la app abre la base real
    y acá no hay base. Sin el `with` no corren los eventos de startup."""
    from fastapi.testclient import TestClient
    return TestClient(api.app, raise_server_exceptions=False)


# ── LOS OCHO, Y CÓMO SE LOS LLAMA ─────────────────────────────────
#
# Cada entrada es el pedido mínimo que llega hasta la puerta: el cuerpo tiene
# los campos que el endpoint valida ANTES de autenticar, para que un 400 no se
# confunda con un rechazo de credencial.

def _pedir(cliente, endpoint, headers):
    metodo, ruta, cuerpo = endpoint
    if metodo == "GET":
        return cliente.get(ruta, headers=headers)
    return cliente.post(ruta, json=cuerpo, headers=headers)


ENDPOINTS = {
    "crear_influencer": (
        "POST", "/api/influencers",
        {"name": "Inf Nuevo", "username": "infnuevo",
         "password": "unaclavelarga", "pct_ggr": 5, "pct_ventas": 2}),
    "listar_influencers": ("GET", "/api/influencers", None),
    "bloquear": (
        "POST", "/api/bloquear",
        {"tipo": "cliente", "objetivo": JUGADOR, "bloquear": True}),
    "configurar_cuenta": ("POST", f"/api/cuenta/{SUB}/configurar", {}),
    "liquidar_influencer": (
        "POST", f"/api/influencers/{INFLUENCER}/liquidar", {}),
    "influencer_detalle": (
        "GET", f"/api/influencers/{INFLUENCER}/detalle", None),
    "panel_influencer": ("GET", "/api/influencer/me/combos-ia", None),
    "generar_vinculo_cliente": (
        "POST", f"/api/cliente/{JUGADOR}/vincular-telegram", {}),
}

CREDENCIALES = {
    "agencia": {"Authorization": "Bearer t-agencia"},
    "admin": {"X-Admin-Key": CLAVE_ADMIN},
    "nada": {},
    "jugador": {"Authorization": "Bearer t-jugador"},
}


# EL CONTRATO, medido sobre el código de antes del refactor.
#
# Las tres primeras columnas son lo que ya pasaba y no se podía mover: si una
# cambia, a alguien se le cerró el panel. La cuarta es la única que el
# refactor altera, y abajo está el por qué de cada 403.
#
# `panel_influencer` es el raro de la tabla y está acá para que se vea: NO
# acepta la clave de admin. Cuelga de `_requiere_influencer`, que solo abre
# para una sesión de influencer, así que el admin sin Bearer recibe el mismo
# 401 que no traer nada. No se uniformó: ese endpoint es el panel propio del
# influencer y el admin tiene los suyos.
CONTRATO = {
    #                            agencia  admin   nada  jugador(antes→después)
    "crear_influencer":         (200,     200,    401,  (404, 403)),
    "listar_influencers":       (200,     200,    401,  (200, 403)),
    "bloquear":                 (200,     200,    401,  (403, 403)),
    "configurar_cuenta":        (200,     200,    401,  (403, 403)),
    "liquidar_influencer":      (200,     200,    401,  (403, 403)),
    "influencer_detalle":       (200,     200,    401,  (403, 403)),
    "panel_influencer":         (403,     401,    401,  (403, 403)),
    "generar_vinculo_cliente":  (200,     200,    401,  (403, 403)),
}


@pytest.mark.parametrize("nombre", sorted(ENDPOINTS))
def test_el_contrato_de_los_ocho_no_se_movio(nombre, conn, cliente, subtests):
    """Los tres casos que no se podían mover, uno por uno.

    Está parametrizado por endpoint y con un subtest por credencial para que
    el fallo diga cuál de las 24 combinaciones se rompió. Un `assert` por
    endpoint cortaría en la primera y esconderia las otras tres.
    """
    esperado = CONTRATO[nombre]
    for i, credencial in enumerate(("agencia", "admin", "nada")):
        with subtests.test(credencial=credencial):
            r = _pedir(cliente, ENDPOINTS[nombre], CREDENCIALES[credencial])
            assert r.status_code == esperado[i], \
                f"{nombre} con {credencial}: {r.status_code} ({r.text[:200]})"


@pytest.mark.parametrize("nombre", sorted(ENDPOINTS))
def test_el_token_de_jugador_queda_cerrado_a_proposito(nombre, conn, cliente):
    """El único caso que el refactor cambia, y la razón de todo esto.

    Antes esto daba 403 o 404 en casi todos —cerrado de casualidad, porque la
    consulta siguiente no encontraba nada— y 200 en `listar_influencers`, que
    le devolvía al jugador una lista vacía sin haberle negado la entrada. Esa
    lista vacía es la que muestra que la puerta estaba abierta: el jugador
    entró, la consulta no trajo nada, y la API le contestó 200.

    Ahora los ocho cortan con 403 ANTES de consultar nada, y el 403 lo pone la
    misma `exigir_sesion_de_agencia` que usa `requiere_agencia`.
    """
    r = _pedir(cliente, ENDPOINTS[nombre], CREDENCIALES["jugador"])
    assert r.status_code == 403, f"{nombre}: {r.status_code} ({r.text[:200]})"


@pytest.mark.parametrize("nombre", sorted(ENDPOINTS))
def test_el_token_de_terminal_tampoco_abre_ninguna(nombre, conn, cliente):
    """La terminal entra por la misma regla que el jugador, y por el mismo
    motivo: es una identidad de LOCAL, no de agencia.

    Una pantalla en el mostrador la toca cualquiera que pase. Si su token
    pasara por acá tendría de golpe el permiso de crear influencers, bloquear
    clientes y liquidar comisiones, y lo único que necesita es cashear.
    Está en la misma prueba que el jugador porque las dos las cierra el mismo
    `PREFIJOS_NO_AGENCIA`: si alguien saca una, caen las dos juntas.
    """
    r = _pedir(cliente, ENDPOINTS[nombre],
               {"Authorization": "Bearer t-terminal"})
    assert r.status_code == 403, f"{nombre}: {r.status_code} ({r.text[:200]})"


@pytest.mark.parametrize("nombre", sorted(ENDPOINTS))
def test_un_token_que_no_existe_sigue_siendo_401(nombre, conn, cliente):
    """El 403 del cruce tiene que distinguirse del 401 de no tener sesión.

    Son dos problemas distintos y el frontend hace dos cosas distintas: el 401
    es "no te pudimos identificar, pedí sesión nueva y repetí". Si el token de
    un jugador diera 401, volvería a entrar con su clave correcta y chocaría
    contra el mismo 401 para siempre.
    """
    r = _pedir(cliente, ENDPOINTS[nombre],
               {"Authorization": "Bearer t-no-existe"})
    assert r.status_code == 401, f"{nombre}: {r.status_code} ({r.text[:200]})"


def test_una_clave_de_admin_equivocada_no_entra_como_agencia(conn, cliente):
    """La clave mal no es "entrar sin token": cae al camino de la sesión, que
    sin Bearer corta con 401. Sin esto, un `es_admin` mal escrito —un `or` en
    vez de un `and`, una comparación con `==`— podría dejar pasar cualquier
    valor en la cabecera."""
    for nombre in sorted(ENDPOINTS):
        r = _pedir(cliente, ENDPOINTS[nombre], {"X-Admin-Key": "no-es-la-clave"})
        assert r.status_code == 401, f"{nombre}: {r.status_code}"


# Qué dependencia tiene que estar declarada en la firma de cada uno. Siete
# comparten la del par admin-o-agencia; `panel_influencer` tiene la suya porque
# NO acepta la clave de admin, y eso queda a la vista en esta tabla en vez de
# esconderse en el cuerpo de la función.
PUERTA = dict.fromkeys(
    ("crear_influencer", "listar_influencers", "bloquear", "configurar_cuenta",
     "liquidar_influencer", "influencer_detalle", "generar_vinculo_cliente"),
    "requiere_admin_o_agencia")
PUERTA["panel_influencer"] = "_requiere_influencer"


def _puertas_declaradas(api, metodo, ruta):
    """Las dependencias que FastAPI resolvería para esa ruta, por nombre.

    Se le pregunta al árbol que armó FastAPI y no al texto de la función: es la
    única fuente que dice qué se va a ejecutar de verdad antes del cuerpo.
    """
    for route in api.app.routes:
        if getattr(route, "path", None) != ruta:
            continue
        if metodo not in (getattr(route, "methods", None) or ()):
            continue
        nombres, pendientes = set(), [route.dependant]
        while pendientes:
            dep = pendientes.pop()
            if getattr(dep, "call", None) is not None:
                nombres.add(getattr(dep.call, "__name__", ""))
            pendientes.extend(dep.dependencies)
        return nombres
    raise AssertionError(f"no existe la ruta {metodo} {ruta}")


@pytest.mark.parametrize("nombre", sorted(ENDPOINTS))
def test_la_credencial_se_declara_en_la_firma(nombre, api):
    """El corazón del refactor, y lo único que evita que vuelva a pasar.

    Que hoy los ocho estén cerrados lo dicen las pruebas de arriba. Lo que dice
    ESTA es POR DÓNDE están cerrados: la credencial se resuelve en una
    dependencia declarada en la firma, no en veinte líneas adentro del cuerpo.

    La diferencia no es de estilo. Con el chequeo en el cuerpo, el que lee la
    función tiene que bajar a buscarlo para saber a quién le cree ese endpoint,
    y el que escribe el siguiente copia el de al lado sin poder ver qué está
    copiando. Así se multiplicó por ocho: ocho cuerpos, y ninguno de los ocho
    miraba el prefijo. Con la dependencia en la firma, un endpoint sin puerta se
    ve en la línea de la función y en esta tabla.

    Se le pregunta al árbol de dependencias que armó FastAPI, que es lo que se
    va a ejecutar, y no al texto del archivo: un `Depends` escrito con otro
    nombre, envuelto, o puesto en el router, se ve igual acá.
    """
    metodo, ruta, _ = ENDPOINTS[nombre]
    # La ruta con el parámetro tal como la declara el decorador, no la pedida.
    ruta = {
        "configurar_cuenta": "/api/cuenta/{code}/configurar",
        "liquidar_influencer": "/api/influencers/{code}/liquidar",
        "influencer_detalle": "/api/influencers/{code}/detalle",
        "generar_vinculo_cliente": "/api/cliente/{user_id}/vincular-telegram",
    }.get(nombre, ruta)

    assert PUERTA[nombre] in _puertas_declaradas(api, metodo, ruta), \
        f"{nombre} no declara {PUERTA[nombre]} en su firma"


def test_la_regla_compartida_es_la_que_los_cierra(conn, cliente, monkeypatch,
                                                  api, subtests):
    """Comprobación por mutación: anular la regla reabre el agujero.

    Con `exigir_sesion_de_agencia` reemplazada por una función que deja pasar
    todo, el token del jugador tiene que volver a comportarse como ANTES del
    refactor. Eso prueba dos cosas de una vez: que el 403 de hoy lo pone esa
    función compartida y no una copia local, y que la columna "antes" de la
    tabla del contrato era lo que decíamos.

    SOLO SE MIRA UN ENDPOINT, y conviene saber por qué son tan pocos.

    Seis de los ocho daban 403 antes del refactor y siguen dando 403 con la
    regla anulada: los frena la comparación contra la rama, que viene después.
    Su código de estado no distingue, así que meterlos acá sería una prueba que
    parece probar y no prueba nada. Lo que fija su puerta es
    `test_la_credencial_se_declara_en_la_firma`.

    `crear_influencer` daba 404 antes y hoy da 403 incluso con la regla anulada,
    porque ESTE CAMBIO LE CERRÓ DOS COSAS: el prefijo, y el default que le daba
    "ambos" al solicitante que no encontraba (ver
    `test_no_encontrar_al_solicitante_cierra_y_no_abre`). Con una anulada queda
    la otra, y eso es lo que uno quiere de dos chequeos independientes, pero
    significa que tampoco sirve para aislar la regla compartida.

    Queda `listar_influencers`, y es justo el que mostraba el agujero a la
    vista: contestaba 200 con una lista vacía. El jugador ENTRABA; lo único que
    lo dejaba sin datos era que la consulta no encontraba nada.
    """
    monkeypatch.setattr(api, "exigir_sesion_de_agencia", lambda code: code)

    ANTES = {"listar_influencers": 200}
    for nombre, esperado in ANTES.items():
        with subtests.test(endpoint=nombre):
            r = _pedir(cliente, ENDPOINTS[nombre], CREDENCIALES["jugador"])
            assert r.status_code == esperado, \
                (f"{nombre} con la regla anulada dio {r.status_code}: "
                 f"el 403 de hoy no lo pone la función compartida")


def test_ningun_endpoint_lee_la_cabecera_de_credencial_a_mano():
    """La prueba que evita que esto vuelva.

    Lo que multiplicó el agujero por ocho no fue un error de lógica: fue que la
    autenticación se escribía en el CUERPO, con esta línea,

        token = request.headers.get("Authorization","").replace("Bearer ","")

    y entonces la próxima persona copiaba el endpoint de al lado sin poder ver
    qué estaba copiando. Mientras eso se pueda escribir, vuelve. Así que lo que
    se fija acá no es que los ocho de hoy estén bien —eso lo fijan las pruebas
    de arriba— sino que NINGÚN endpoint del archivo pueda volver a leer a mano
    la cabecera que dice quién sos. La credencial entra por `Header(...)` en una
    dependencia, o no entra.

    Se lee el ÁRBOL y no el texto, por dos razones. Una: un `rg` contaría la
    línea que está citada como ejemplo en el docstring de
    `requiere_admin_o_agencia`, y para pasar la prueba habría que borrar la
    explicación de por qué la prueba existe. Dos: el texto se puede esquivar sin
    querer —comillas simples, otro espaciado, `headers["Authorization"]`,
    `"authorization"` en minúscula— y el árbol ve la lectura igual. De hecho
    esta prueba encontró tres lecturas que el barrido con `rg` no había visto,
    justamente por la minúscula.

    `X-Admin-Key` entra en la misma prohibición: era la otra mitad del baile de
    dos ramas, con su `hmac.compare_digest` copiado ocho veces, y ahora está una
    sola vez.

    LO QUE SÍ SE PERMITE, Y POR QUÉ. Pasar la cabecera CRUDA y sin interpretar a
    un guardia compartido —hoy `jugador_de_sesion`— no es el defecto: el que
    decide sigue siendo el guardia, que mira el prefijo y no miente. Tres
    endpoints del jugador lo necesitan porque primero prueban la identidad
    firmada de Telegram, que viene en el CUERPO, y solo si no hay caen a la
    sesión del navegador; eso no se puede declarar en la firma porque hay que
    leer el cuerpo para saber qué camino corresponde. Lo que se prohíbe es lo
    otro: leer la cabecera y resolver la identidad ahí mismo —recortar el
    `Bearer`, llamar a `sesion_buscar`, decidir si el code sirve—, que es
    exactamente la forma que se copió ocho veces.

    Las cabeceras que no son credenciales siguen libres: `origin` en los
    manejadores de error, por ejemplo.
    """
    import ast
    import pathlib

    ARCHIVO = pathlib.Path(__file__).resolve().parent.parent / "casino_api.py"
    PROHIBIDAS = {"authorization", "x-admin-key"}
    # Guardias compartidos que pueden recibir la cabecera cruda: miran el
    # prefijo ellos mismos, así que pasarles el valor no establece nada a mano.
    GUARDIAS = {"jugador_de_sesion"}

    def _es_headers(nodo):
        return isinstance(nodo, ast.Attribute) and nodo.attr == "headers"

    def _nombre_prohibido(nodo):
        return (isinstance(nodo, ast.Constant)
                and isinstance(nodo.value, str)
                and nodo.value.lower() in PROHIBIDAS)

    def _lectura(nodo):
        """La cabecera que lee este nodo, o None si no lee ninguna."""
        if (isinstance(nodo, ast.Call)
                and isinstance(nodo.func, ast.Attribute)
                and nodo.func.attr == "get"
                and _es_headers(nodo.func.value)
                and nodo.args and _nombre_prohibido(nodo.args[0])):
            return nodo.args[0].value
        if (isinstance(nodo, ast.Subscript)
                and _es_headers(nodo.value)
                and _nombre_prohibido(nodo.slice)):
            return nodo.slice.value
        return None

    arbol = ast.parse(ARCHIVO.read_text(encoding="utf-8"))

    # Primero las lecturas que van derecho a un guardia compartido: esas pasan.
    perdonadas = set()
    for nodo in ast.walk(arbol):
        if not isinstance(nodo, ast.Call):
            continue
        llamado = nodo.func.id if isinstance(nodo.func, ast.Name) else \
            getattr(nodo.func, "attr", "")
        if llamado in GUARDIAS:
            for arg in nodo.args:
                if _lectura(arg) is not None:
                    perdonadas.add(id(arg))

    encontradas = [(nodo.lineno, _lectura(nodo)) for nodo in ast.walk(arbol)
                   if _lectura(nodo) is not None and id(nodo) not in perdonadas]

    assert encontradas == [], (
        "alguien volvió a leer la credencial a mano en casino_api.py: "
        + ", ".join(f"línea {n} ({h})" for n, h in sorted(encontradas))
        + ". La credencial se declara en la firma, con una dependencia que la "
          "recibe por Header(...). Ver requiere_admin_o_agencia.")


@pytest.mark.parametrize("credencial", ["jugador", "terminal"])
def test_el_descarte_de_clase_corta_antes_de_consultar_la_base(
        credencial, conn, cliente):
    """Que corte no alcanza: tiene que cortar ANTES de ir a la base.

    Esta prueba existe porque sin ella el arreglo de `_requiere_influencer` no
    estaba probado por nada. Su código de estado no distingue: un token de
    jugador daba 403 antes del cambio ("Solo para influencers", porque
    `SELECT tipo FROM agencias WHERE code='cliente:701'` no devuelve fila) y da
    403 después ("Esta sesión no es de una agencia"). Se comprobó por mutación
    —sacarle el descarte de clase no ponía roja ninguna prueba— y esto es lo
    que cierra ese agujero en la red.

    Lo que sí distingue es QUÉ SE PREGUNTÓ. Un code con prefijo no es el code de
    ninguna agencia, así que no tiene por qué llegar nunca a una consulta: el
    descarte pasa primero y la base no se toca. Si volviera a pasar, la consulta
    aparece acá.

    Y no es solo prolijidad. Preguntarle a la base por `cliente:701` como si
    fuera una agencia es el primer paso del agujero que ya costó una fila sucia
    en `impresiones_log`: el que escriba el próximo endpoint va a copiar un
    camino donde ese code llega vivo hasta el SQL, y el siguiente SQL puede ser
    un INSERT.
    """
    token = {"jugador": "t-jugador", "terminal": "t-terminal"}[credencial]
    r = cliente.get("/api/influencer/me/combos-ia",
                    headers={"Authorization": f"Bearer {token}"})

    assert r.status_code == 403, r.text[:200]
    # La única consulta permitida es la que resuelve el token. Después de esa,
    # el descarte ya decidió.
    assert len(conn.consultas) == 1, conn.consultas
    assert conn.consultas[0].startswith(
        "SELECT agencia_code FROM agencia_sesiones"), conn.consultas


@pytest.mark.parametrize("cabecera", [
    "t-agencia",                 # el token pelado, sin el esquema
    "Token t-agencia",           # otro esquema
    "bearer=t-agencia",
    "Bearer",                    # el esquema sin token
    "Bearer ",
])
def test_un_authorization_mal_armado_no_autentica(cabecera, conn, cliente):
    """El `Bearer` se EXIGE, no se recorta, y acá se ve por qué importa.

    La línea de antes era `.replace("Bearer ","")`, que saca esa palabra de
    cualquier parte del valor y se queda con el resto. O sea que
    `Authorization: t-agencia` —el token pelado, sin esquema— autenticaba igual,
    porque no había nada que reemplazar y el valor entero pasaba como token.

    Ahora se pide el prefijo, como en `requiere_agencia`, `requiere_terminal` y
    `requiere_ventanilla`: una sola forma de leer la cabecera en todo el
    archivo. Se comprobó que los clientes mandan todos `Bearer ${token}`
    —`authHeaders` en `Agencia.jsx`, `cabeceraDeSesion` en `sesionTelegram.js`,
    `credencialTerminal.js`— así que no deja a nadie afuera; lo que deja de
    andar es un formato que nunca fue válido.

    Esta prueba también se agregó por la comprobación por mutación: volver al
    `.replace()` no ponía roja ninguna prueba, y un endurecimiento sin prueba
    es un endurecimiento que alguien revierte sin enterarse.
    """
    r = cliente.get("/api/influencers", headers={"Authorization": cabecera})
    assert r.status_code == 401, r.text[:200]


# ── EL DEFAULT QUE ABRÍA EN VEZ DE CERRAR ─────────────────────────

def test_no_encontrar_al_solicitante_cierra_y_no_abre(conn, cliente):
    """`crear_influencer` le daba el permiso MÁS AMPLIO al que no encontraba.

    La línea era:

        permiso = (quien.get("permiso") if quien else "ambos") or "ambos"

    o sea que una sesión cuya agencia no está en `agencias` —la cuenta se
    borró, o el code de la sesión no es de ninguna agencia— pasaba el chequeo
    de permisos como si tuviera todos. No hacía daño porque dos líneas más
    abajo el mismo code da 404 al buscar al padre, igual que el cruce de
    sesiones moría contra la consulta siguiente: cerrado por el orden de las
    consultas, no por una decisión.

    Lo que distingue el arreglo del accidente es CUÁL de los dos códigos sale.
    Un 404 dice "pasé permisos y no encontré al padre"; un 403 dice "el chequeo
    de permisos te paró". Por eso la prueba mira 403 y no "algo que rechace":
    con el default viejo esto daba 404, y el 404 llegaba después de haber
    aprobado los permisos.
    """
    # Una sesión válida de una agencia que no tiene fila: es lo que queda
    # cuando se borra la cuenta y su token sigue vivo.
    conn.poner_sesion("t-fantasma", "AGFANTASMA")

    r = _pedir(cliente, ENDPOINTS["crear_influencer"],
               {"Authorization": "Bearer t-fantasma"})

    assert r.status_code == 403, r.text[:200]
    assert not [e for e in conn.escrituras if "INSERT INTO agencias" in e[0]]


def test_un_permiso_que_no_alcanza_sigue_cerrando(conn, cliente):
    """El otro lado del mismo chequeo, que ya funcionaba y tiene que seguir.

    Está al lado del de arriba a propósito: un arreglo escrito al revés
    —cerrarle a todos— pasaría esa prueba y le sacaría a las agencias que sí
    tienen permiso la posibilidad de crear influencers."""
    conn.agencias[AGENCIA]["permiso"] = "solo_agencia"

    r = _pedir(cliente, ENDPOINTS["crear_influencer"],
               CREDENCIALES["agencia"])
    assert r.status_code == 403, r.text[:200]


def test_un_permiso_en_null_sigue_valiendo_ambos(conn, cliente):
    """El `or "ambos"` que SÍ se queda, y por qué no es el mismo defecto.

    Una fila que existe con `permiso` en NULL es una cuenta creada antes de que
    la columna existiera, y para esas el default del sistema es "ambos": lo
    mismo hacen `configurar_cuenta` y el listado de cuentas. Cambiar eso le
    cerraría la creación de influencers a todas las agencias viejas, que es un
    cambio de regla de negocio y no entraba en este refactor.

    Lo que se cerró es la fila que NO ESTÁ. Las dos cosas se parecían en una
    sola línea y por eso conviene que estén probadas por separado: si alguien
    "limpia" esto juntándolas otra vez, una de las dos pruebas cae."""
    conn.agencias[AGENCIA]["permiso"] = None

    r = _pedir(cliente, ENDPOINTS["crear_influencer"],
               CREDENCIALES["agencia"])
    assert r.status_code == 200, r.text[:200]


def test_el_admin_sigue_recibiendo_404_por_un_padre_que_no_existe(conn, cliente):
    """El camino del admin no se tocó: su `parent_code` sale del cuerpo y si
    esa agencia no existe el 404 sigue siendo el suyo.

    Sin esta prueba, cerrar el default de arriba podría haberse escrito un
    nivel más afuera y convertir ese 404 en un 403, que le diría al panel de
    admin "no tenés permiso" cuando lo que pasó es que escribió mal un code."""
    cuerpo = dict(ENDPOINTS["crear_influencer"][2], parent_code="NOEXISTE")
    r = cliente.post("/api/influencers", json=cuerpo,
                     headers=CREDENCIALES["admin"])
    assert r.status_code == 404, r.text[:200]


def test_un_code_de_agencia_que_contiene_cliente_sigue_entrando(conn, cliente):
    """Lo que decide es el PREFIJO, no que la palabra aparezca.

    Un `"cliente" in code` dejaría afuera a una agencia llamada `AGCLIENTES`,
    y el error se vería en producción como una agencia real que de golpe no
    puede entrar a su panel. Es el modo de fallar más caro de este refactor:
    cerrar el cruce es gratis, cerrarle la puerta a quien sí es agencia no.
    """
    conn.agencias["AGCLIENTES"] = _fila_agencia("AGCLIENTES", "AGCLIENTES")
    conn.poner_sesion("t-nombre", "AGCLIENTES")

    r = cliente.get("/api/influencers",
                    headers={"Authorization": "Bearer t-nombre"})
    assert r.status_code == 200
