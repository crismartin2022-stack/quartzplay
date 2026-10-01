"""El sportsbook de Content360: una pantalla propia y un interruptor del admin.

El sportsbook llega como UNA fila del catálogo (integración content360, marca
"sports"). Lo que se prueba acá es dónde se ve y quién lo decide, y sobre todo
lo que el interruptor NO puede hacer: tocar la plata de una apuesta ya hecha.

Van contra una base en memoria. El SQL del catálogo no corre contra Postgres:
la base falsa aplica la exclusión leyendo los parámetros que la consulta le
pasa, así que lo que se verifica es que la consulta los manda y con qué
valores, no el motor.
"""

import asyncio
import importlib

import pytest
from fastapi import HTTPException

from test_content360_callbacks import FakeDB, credit, leer, pedir, proveedor
from test_runtime_config import settings
from test_wallet_setbalance import use_fake_pool

SPORTSBOOK = {"game_id": "1140", "titulo": "Sports", "marca": "sports",
              "imagen": None, "integracion": "content360", "es_vivo": False,
              "movil": True, "escritorio": True, "prioridad": 1,
              "activo": True}
SLOT = {"game_id": "201", "titulo": "Gates", "marca": "Pragmatic Play",
        "imagen": None, "integracion": "content360", "es_vivo": False,
        "movil": True, "escritorio": True, "prioridad": 1, "activo": True}


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


class BaseCatalogo:
    """Emula lo que el catálogo y la config pública le piden a la base."""

    def __init__(self, interruptor=None, juegos=(SPORTSBOOK, SLOT)):
        self.config = {} if interruptor is None else {
            "sportsbook_c360_activo": interruptor}
        self.juegos = list(juegos)
        self.escrituras = []
        # (jugador, game_id, integración) de cada ronda ya jugada.
        self.rondas = []

    async def fetchval(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT valor FROM app_config WHERE clave=$1"):
            return self.config.get(args[0])
        if q.startswith("SELECT 1 FROM casino_rounds"):
            return 1 if tuple(args) in self.rondas else None
        raise AssertionError(f"fetchval inesperado: {q}")

    async def fetch(self, query, *args):
        q = " ".join(query.split())
        if "FROM casino_juegos j JOIN casino_integraciones" in q:
            # La exclusión del sportsbook, aplicada solo si la consulta la
            # lleva en el texto y con los parámetros que manda: si alguien
            # la saca o deja de pasarlos, esta base no excluye y las
            # pruebas de la grilla fallan.
            if "AND NOT (j.integracion = $5 AND j.marca = $6)" not in q:
                return list(self.juegos)
            integ, marca = args[4], args[5]
            return [j for j in self.juegos
                    if not (j["integracion"] == integ and j["marca"] == marca)]
        if q.startswith("SELECT marca FROM casino_proveedores"):
            return []
        if q.startswith("SELECT clave, valor FROM app_config"):
            return []
        raise AssertionError(f"fetch inesperado: {q}")

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT j.game_id, j.titulo, j.integracion"):
            for j in self.juegos:
                if (j["integracion"], j["marca"]) == args:
                    return {**j, "disponible": j["activo"]}
            return None
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def execute(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("INSERT INTO app_config"):
            self.config[args[0]] = args[1]
            self.escrituras.append(args)
            return "INSERT 0 1"
        raise AssertionError(f"execute inesperado: {q}")


@pytest.fixture
def base(api, monkeypatch):
    b = BaseCatalogo()
    use_fake_pool(api, monkeypatch, b)
    # El caché es del proceso: una prueba no puede heredar el de otra.
    api._cat_cache.update(data=None, ts=0.0, clave=None)
    api._cat_aux["ts"] = 0.0
    return b


def ids(respuesta):
    return [j["id"] for j in respuesta["juegos"]]


def correr(corutina):
    return asyncio.run(corutina)


class Pedido:
    def __init__(self, cuerpo):
        self.cuerpo = cuerpo

    async def json(self):
        return self.cuerpo


# ── El interruptor ─────────────────────────────────────────────

def test_la_bandera_arranca_apagada(api, base):
    """Riesgo: ofrecerle a un jugador con plata real un sportsbook que nadie
    verificó. Sin fila en app_config, está apagado."""
    assert correr(api.sportsbook_config_publica()) == {"activo": False}


@pytest.mark.parametrize("valor", ["false", "", "TRUE-ish", "1", "si", None])
def test_solo_la_palabra_true_lo_prende(api, base, valor):
    base.config["sportsbook_c360_activo"] = valor
    assert correr(api.sportsbook_config_publica()) == {"activo": False}


def test_prendido_la_config_publica_dice_que_juego_abrir(api, base):
    base.config["sportsbook_c360_activo"] = "true"

    r = correr(api.sportsbook_config_publica())

    assert r == {"activo": True, "juego": {
        "id": "1140", "titulo": "Sports", "integracion": "content360"}}


def test_prendido_pero_sin_el_juego_en_el_catalogo_no_ofrece_nada(api, base):
    """Riesgo: una entrada de menú que abre un juego que no existe."""
    base.config["sportsbook_c360_activo"] = "true"
    base.juegos = [SLOT]

    assert correr(api.sportsbook_config_publica()) == {"activo": False}


def test_la_config_publica_no_filtra_nada_de_admin(api, base):
    base.config["sportsbook_c360_activo"] = "true"

    r = correr(api.sportsbook_config_publica())

    assert set(r) == {"activo", "juego"}
    assert set(r["juego"]) == {"id", "titulo", "integracion"}


def test_el_admin_lo_prende_y_lo_apaga_guardando_texto(api, base):
    r = correr(api.admin_sportsbook_c360_set(Pedido({"activo": True})))
    assert r == {"ok": True, "activo": True}
    assert base.config["sportsbook_c360_activo"] == "true"
    assert correr(api.admin_sportsbook_c360()) == {"activo": True}

    correr(api.admin_sportsbook_c360_set(Pedido({"activo": False})))
    assert base.config["sportsbook_c360_activo"] == "false"

    # Algo que no sea el booleano verdadero no lo prende: "false" como
    # texto es verdadero para Python y no puede abrirlo por accidente.
    correr(api.admin_sportsbook_c360_set(Pedido({"activo": "false"})))
    assert base.config["sportsbook_c360_activo"] == "false"


# ── Apagado, pero para quien ya apostó ─────────────────────────

def test_apagado_el_que_ya_aposto_ve_la_entrada_apagada(api, base):
    """Riesgo: apagarlo el martes deja sin ninguna señal a quien apostó el
    lunes, y una apuesta deportiva se liquida días después. Tiene que
    seguir viendo la entrada (apagada) para leer el aviso."""
    base.config["sportsbook_c360_activo"] = "false"
    base.rondas.append((7, "1140", "content360"))

    r = correr(api.sportsbook_config_publica(user_id=7))

    assert r == {"activo": False, "con_historial": True}
    assert "juego" not in r, "apagado no puede entregar con qué abrirlo"


def test_apagado_el_que_nunca_aposto_no_ve_nada(api, base):
    base.config["sportsbook_c360_activo"] = "false"
    base.rondas.append((7, "1140", "content360"))   # otro jugador, no el 8

    assert correr(api.sportsbook_config_publica(user_id=8)) == {"activo": False}
    assert correr(api.sportsbook_config_publica()) == {"activo": False}


def test_las_rondas_de_otro_juego_no_cuentan_como_haber_apostado_ahi(api, base):
    base.config["sportsbook_c360_activo"] = "false"
    base.rondas.append((7, "201", "content360"))     # un slot
    base.rondas.append((7, "1140", "otro-proveedor"))  # mismo id, otro proveedor

    assert correr(api.sportsbook_config_publica(user_id=7)) == {"activo": False}


def test_apagado_intentar_abrir_el_juego_1140_no_lanza_la_sesion(
        api, base, monkeypatch):
    """La entrada apagada no es solo cosmética: el id del juego es público y
    sin esta puerta se podría abrir una apuesta nueva por la API."""

    class BaseSesion(BaseCatalogo):
        async def fetchrow(self, query, *args):
            q = " ".join(query.split())
            if q.startswith("SELECT id, username, moneda"):
                return {"id": 7, "username": "juan", "moneda": "ARS",
                        "bloqueado": False, "creado_por": "AG-01"}
            if q.startswith("SELECT j.*, i.url"):
                return {**SPORTSBOOK, "url": "https://c360.example",
                        "api_code": "69", "api_secret": "clave",
                        "api_secret_cifrado": None, "monedas": "ARS",
                        "adaptador": "content360",
                        "proveedores_con_el_juego": 1}
            if q.startswith("SELECT motivo FROM casino_proveedores"):
                return None
            return await super().fetchrow(query, *args)

    sesion = BaseSesion()
    use_fake_pool(api, monkeypatch, sesion)

    async def productos(conn, agencia):
        return {"casino"}

    lanzados = []

    async def lanzar(pool, u, j, game_id, body):
        lanzados.append(game_id)
        return {"url": "https://c360.example/juego"}

    monkeypatch.setattr(api, "_productos_de", productos)
    monkeypatch.setattr(api, "_lanzar_content360", lanzar)
    pedido = Pedido({"user_id": 7, "game_id": "1140",
                     "integracion": "content360"})

    sesion.config["sportsbook_c360_activo"] = "false"
    with pytest.raises(HTTPException) as e:
        correr(api.casino_sesion(pedido))
    assert e.value.status_code == 403
    assert lanzados == []

    # Prendido, la misma pedida abre: la puerta es el interruptor, no otra cosa.
    sesion.config["sportsbook_c360_activo"] = "true"
    assert correr(api.casino_sesion(pedido)) == {"url": "https://c360.example/juego"}
    assert lanzados == ["1140"]


# ── La grilla del casino ───────────────────────────────────────

def test_prendido_el_sportsbook_sale_de_la_grilla_del_casino(api, base):
    base.config["sportsbook_c360_activo"] = "true"

    r = correr(api.casino_juegos(user_id=0, vivo=0, movil=1))

    assert ids(r) == ["201"]
    assert "sports" not in r["marcas"]


def test_apagado_no_aparece_en_ningun_lado(api, base):
    """El dueño lo apaga y desaparece de la grilla Y del menú: ni como slot
    ni como pantalla."""
    base.config["sportsbook_c360_activo"] = "false"

    grilla = correr(api.casino_juegos(user_id=0, vivo=0, movil=1))
    buscado = correr(api.casino_juegos(user_id=0, vivo=0, movil=1,
                                       buscar="sports"))

    assert ids(grilla) == ["201"]
    assert ids(buscado) == []
    assert correr(api.sportsbook_config_publica()) == {"activo": False}


def test_el_interruptor_no_cambia_la_grilla_asi_que_el_cache_no_puede_mentir(
        api, base):
    """Riesgo: que apagar el interruptor deje el sportsbook a la vista hasta
    que venza el caché del catálogo (300 s). La grilla es la misma con el
    interruptor en cualquier estado, y se prueba CON el caché caliente."""
    base.config["sportsbook_c360_activo"] = "true"
    primera = correr(api.casino_juegos(user_id=0, vivo=0, movil=1))

    base.config["sportsbook_c360_activo"] = "false"
    segunda = correr(api.casino_juegos(user_id=0, vivo=0, movil=1))

    assert ids(primera) == ids(segunda) == ["201"]


# ── Lo delicado: apagar no puede romper una apuesta viva ───────

class BaseConInterruptor(FakeDB):
    """La base de los callbacks con `app_config` a la vista: si el callback
    mirara el interruptor, lo vería apagado y esta prueba lo atraparía."""

    def __init__(self):
        super().__init__()
        self.config = {"sportsbook_c360_activo": "false"}
        self.lecturas_de_config = 0
        # La apuesta se hizo ayer: su sesión ya no existe.
        self.sesiones = []

    async def fetchval(self, query, *args):
        q = " ".join(query.split())
        if q.startswith("SELECT valor FROM app_config"):
            self.lecturas_de_config += 1
            return self.config.get(args[0])
        return await super().fetchval(query, *args)


@pytest.fixture
def db_apagada(api, monkeypatch):
    base = BaseConInterruptor()
    use_fake_pool(api, monkeypatch, base)
    api.db_prov = {"content360": proveedor()}

    async def prov(codigo):
        return api.db_prov.get(codigo)

    monkeypatch.setattr(api, "_proveedor", prov)
    api._c360_variantes_vistas.clear()
    api._c360_acciones_vistas.clear()
    return base


def test_con_el_interruptor_apagado_el_premio_de_una_apuesta_vieja_se_acredita(
        api, db_apagada):
    """Riesgo, y es el que un cambio futuro va a cometer: una apuesta
    deportiva se liquida días después. El dueño apagó el sportsbook, la
    sesión del jugador ya no existe, y Content360 manda el `credit` del
    premio. Tiene que acreditarse igual: rechazarlo le quita al jugador
    plata que ya ganó. El interruptor esconde la entrada; no gobierna
    callbacks."""
    saldo_antes = db_apagada.users[7]["balance"]
    # `session_token` de una sesión que ya no existe, como llega días después.
    premio = credit(250.0, tx="LIQ-DIAS-DESPUES", ronda="DEP-1",
                    session_token="SES-DE-AYER")

    r = pedir(api, "credit", premio)

    assert r.status_code == 200 and leer(r)["code"] == 0
    assert db_apagada.users[7]["balance"] == saldo_antes + 25_000
    assert [m["tipo"] for m in db_apagada.movimientos] != []
    assert db_apagada.lecturas_de_config == 0, (
        "el callback no puede consultar el interruptor del sportsbook")


def test_con_el_interruptor_apagado_un_credito_sin_sesion_tambien_paga(
        api, db_apagada):
    premio = credit(10.0, tx="LIQ-SIN-SESION", ronda="DEP-2")
    premio.pop("session_token")
    saldo_antes = db_apagada.users[7]["balance"]

    r = pedir(api, "credit", premio)

    assert leer(r)["code"] == 0
    assert db_apagada.users[7]["balance"] == saldo_antes + 1_000
