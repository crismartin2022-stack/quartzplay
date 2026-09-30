"""Los callbacks de Atomic: el único punto donde Atomic mueve el saldo de un
jugador. Es donde se pierde plata si algo está mal, así que cada prueba
nombra el riesgo que cuida.

Van contra una base en memoria que emula las consultas de este camino y la
atomicidad de la transacción. NO se probó contra un Atomic real ni contra
Postgres: lo que se verifica es la lógica y la forma de las respuestas, no
la latencia ni el SQL contra un motor de verdad.
"""

import asyncio
import copy
import importlib
import json

import httpx
import pytest

import atomic
import registro_proveedores as rp
from test_runtime_config import settings
from test_wallet_setbalance import FakePool, use_fake_pool

CLIENTE_REAL = httpx.AsyncClient
IP_ATOMIC = "203.0.113.7"
CLAVE = "CLAVE-DE-ATOMIC"


@pytest.fixture
def api(monkeypatch):
    for key, value in settings().items():
        monkeypatch.setenv(key, value)
    import config
    config.get_runtime_settings.cache_clear()
    return importlib.reload(importlib.import_module("casino_api"))


# ── La base en memoria ─────────────────────────────────────────

class Transaccion:
    def __init__(self, db):
        self.db = db

    async def __aenter__(self):
        self.copia = copy.deepcopy(
            (self.db.users, self.db.movimientos, self.db.rounds))
        return self

    async def __aexit__(self, tipo, valor, tb):
        if tipo is not None:
            # Un error dentro de la transacción la deshace entera.
            self.db.users, self.db.movimientos, self.db.rounds = self.copia
        return False


class FakeDB:
    def __init__(self, saldo=100_000, moneda="ARS", bloqueado=False):
        self.users = {7: {"balance": saldo, "moneda": moneda,
                          "bloqueado": bloqueado, "creado_por": "AG-01"},
                      8: {"balance": 5_000, "moneda": "ARS",
                          "bloqueado": False, "creado_por": "AG-01"}}
        self.sesiones = [{"sesion_ext": "SES-1", "user_id": 7, "moneda": "ARS",
                          "game_id": "vs20olympgate",
                          "game_titulo": "Gates of Olympus",
                          "agencia_code": "AG-01", "integracion": "atomic"}]
        self.movimientos = []
        self.rounds = []
        self.sentencias = []
        self.fallar_al_registrar = False

    def transaction(self):
        return Transaccion(self)

    # -- lecturas
    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT u.id, u.balance"):
            u = self.users.get(args[0])
            if u is None:
                return None
            s = next((x for x in reversed(self.sesiones)
                      if x["sesion_ext"] == args[1]), None)
            fila = {"id": args[0], **u,
                    "ses_user": s["user_id"] if s else None,
                    "ses_moneda": s["moneda"] if s else None,
                    "ses_juego": s["game_id"] if s else None,
                    "ses_titulo": s["game_titulo"] if s else None,
                    "ses_agencia": s["agencia_code"] if s else None}
            if "AS debitos" in q:
                prov, ronda = args[2], args[3]
                for clave, tipo in (("debitos", "debito"), ("creditos", "credito")):
                    fila[clave] = sum(m["monto"] for m in self.movimientos
                                      if m["proveedor"] == prov
                                      and m["ronda"] == ronda
                                      and m["tipo"] == tipo)
            return fila
        if q.startswith("SELECT balance, moneda FROM users"):
            u = self.users.get(args[0])
            return {"balance": u["balance"], "moneda": u["moneda"]} if u else None
        if q.startswith("SELECT saldo_post FROM casino_movimientos WHERE ref=$1"):
            return next(({"saldo_post": m["saldo_post"]} for m in self.movimientos
                         if m["ref"] == args[0]), None)
        if q.startswith("SELECT saldo_post FROM casino_movimientos WHERE proveedor=$1"):
            prov, ronda, tipo, monto, _ = args
            return next(({"saldo_post": m["saldo_post"]} for m in self.movimientos
                         if (m["proveedor"], m["ronda"], m["tipo"], m["monto"])
                         == (prov, ronda, tipo, monto)), None)
        if q.startswith("UPDATE users SET balance = balance - $2"):
            u = self.users[args[0]]
            if u["balance"] < args[1]:
                return None
            u["balance"] -= args[1]
            return {"balance": u["balance"]}
        if q.startswith("UPDATE users SET balance = balance + $2"):
            u = self.users[args[0]]
            u["balance"] += args[1]
            return {"balance": u["balance"]}
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def fetchval(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT balance FROM users WHERE id=$1"):
            return self.users[args[0]]["balance"]
        raise AssertionError(f"fetchval inesperado: {q}")

    # -- escrituras
    async def execute(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT pg_advisory_xact_lock"):
            return "SELECT 1"
        if q.startswith("WITH mov AS"):
            if self.fallar_al_registrar:
                raise RuntimeError("la base cortó la conexión")
            (ref, uid, tipo, monto, previo, post, juego, prov, ronda, etiqueta,
             stake, premio, ggr, game_id, titulo, agencia, sesion) = args
            self.movimientos.append({
                "ref": ref, "jugador_id": uid, "tipo": tipo, "monto": monto,
                "saldo_previo": previo, "saldo_post": post, "juego": juego,
                "proveedor": prov, "ronda": ronda})
            self.rounds.append({
                "user_id": uid, "game": etiqueta, "provider": prov,
                "stake": stake, "win": premio, "ggr": ggr, "external_tx": ref,
                "game_id": game_id, "game_titulo": titulo,
                "agencia_code": agencia, "sesion": sesion, "integracion": prov})
            return "INSERT 0 1"
        if q.startswith("UPDATE casino_sesiones SET ultimo_uso"):
            return "UPDATE 1"
        if q.startswith("INSERT INTO casino_sesiones"):
            if "SELECT $1::text" in q:   # la variante sin sesión vieja
                _, ext, uid, agencia, juego, titulo, moneda, integ = args
                if any(s["sesion_ext"] == ext for s in self.sesiones):
                    return "INSERT 0 0"
                self.sesiones.append({
                    "sesion_ext": ext, "user_id": uid, "moneda": moneda,
                    "game_id": juego, "game_titulo": titulo,
                    "agencia_code": agencia, "integracion": integ})
                return "INSERT 0 1"
            _, nueva, juego, vieja, uid = args
            origen = next((s for s in reversed(self.sesiones)
                           if s["sesion_ext"] == vieja and s["user_id"] == uid), None)
            if origen is None or any(s["sesion_ext"] == nueva for s in self.sesiones):
                return "INSERT 0 0"
            self.sesiones.append({**origen, "sesion_ext": nueva,
                                  "game_id": juego or origen["game_id"]})
            return "INSERT 0 1"
        raise AssertionError(f"execute inesperado: {q}")

    def tocaron_el_saldo(self):
        return [q for q in self.sentencias if q.startswith("UPDATE users")]


# ── El cliente ─────────────────────────────────────────────────

def proveedor(**cambios):
    datos = dict(codigo="atomic", adaptador="atomic", activa=True,
                 url="https://atomic.example/api", api_code="PARTNER-1",
                 api_secret=CLAVE, monedas=("ARS",),
                 ips_permitidas=("203.0.113.0/24",), origen="base")
    datos.update(cambios)
    return rp.Proveedor(**datos)


@pytest.fixture
def db(api, monkeypatch):
    base = FakeDB()
    use_fake_pool(api, monkeypatch, base)

    async def prov(codigo):
        return proveedor() if codigo in ("atomic",) else None

    monkeypatch.setattr(api, "_proveedor", prov)
    return base


def pedir(api, cuerpo, ip=IP_ATOMIC, ruta="/api/slots/atomic/callback", crudo=None):
    """Manda el cuerpo como texto JSON tal cual, para que un `10.07` llegue
    como `10.07` y no como el float que Python ya redondeó."""
    contenido = crudo if crudo is not None else json.dumps(cuerpo)

    async def _post():
        transport = httpx.ASGITransport(app=api.app, raise_app_exceptions=False)
        async with CLIENTE_REAL(transport=transport,
                                base_url="http://testserver") as c:
            return await c.post(ruta, content=contenido, headers={
                "content-type": "application/json", "x-forwarded-for": ip})
    return asyncio.run(_post())


def bet(monto, tx="tx-1", ronda="R1", sesion="SES-1", **extra):
    return {"method": "bet", "api_key": CLAVE, "player_id": "7",
            "amount": monto,
            "meta": {"transaction": tx, "round_id": ronda,
                     "session_id": sesion, "symbol": "vs20olympgate",
                     "time": "2026-09-30T12:00:00Z"}, **extra}


def win(monto, tx="tx-2", ronda="R1", sesion="SES-1", freespin=False):
    meta = {"transaction": tx, "round_id": ronda, "session_id": sesion,
            "symbol": "vs20olympgate", "time": "2026-09-30T12:00:01Z"}
    if freespin:
        meta["is_freespins"] = True
    return {"method": "win", "api_key": CLAVE, "player_id": "7",
            "amount": monto, "meta": meta}


def leer(respuesta):
    return json.loads(respuesta.content)


# ── Lo que NO debe mover plata ─────────────────────────────────

def test_session_info_devuelve_el_saldo_y_no_mueve_nada(api, db):
    r = pedir(api, {"method": "session_info", "api_key": CLAVE,
                    "player_id": "7", "session_id": "SES-1"})

    assert r.status_code == 200
    assert leer(r) == {"status": "ok", "balance": 1000.0, "currency": "ARS"}
    assert db.tocaron_el_saldo() == [] and db.movimientos == []


@pytest.mark.parametrize("estado", ["start", "finish"])
def test_round_info_no_mueve_plata(api, db, estado):
    """Riesgo: tratar `round_info` como movimiento duplica cada apuesta. Es
    lo que el panel-multiskin aprendió a un costo alto. Lleva `bet_amount`
    y `win_amount` igual que bet y win, y por eso engaña."""
    cuerpo = {"method": "round_info", "api_key": CLAVE, "player_id": "7",
              "status": estado, "round_id": "R1", "session_id": "SES-1",
              "bet_amount": 5.0, "bet_type": "normal", "bonus_buy": False,
              "bonus_trigger": False}
    if estado == "finish":
        cuerpo.update({"win_amount": 12.5, "multiplier": 2.5, "has_win": True})

    r = pedir(api, cuerpo)

    assert r.status_code == 200
    assert leer(r) == {"status": "ok", "balance": 1000.0, "currency": "ARS"}
    assert db.users[7]["balance"] == 100_000
    assert db.tocaron_el_saldo() == [] and db.movimientos == [] and db.rounds == []


def test_game_switch_no_mueve_plata_y_registra_la_sesion_nueva(api, db):
    """Riesgo: tras cambiar de juego en el mini-lobby, el `win` siguiente
    llega con la sesión nueva; si no está registrada se ve desconocida."""
    r = pedir(api, {"method": "game_switch", "api_key": CLAVE, "player_id": "7",
                    "old_session_id": "SES-1", "new_session_id": "SES-2",
                    "new_game": "vs10bbbonanza"})

    assert r.status_code == 200 and leer(r)["status"] == "ok"
    assert db.tocaron_el_saldo() == [] and db.movimientos == []
    nueva = next(s for s in db.sesiones if s["sesion_ext"] == "SES-2")
    assert nueva["user_id"] == 7 and nueva["game_id"] == "vs10bbbonanza"


def test_game_switch_repetido_no_duplica_la_sesion(api, db):
    cuerpo = {"method": "game_switch", "api_key": CLAVE, "player_id": "7",
              "old_session_id": "SES-1", "new_session_id": "SES-2",
              "new_game": "vs10bbbonanza"}
    pedir(api, cuerpo)
    pedir(api, cuerpo)

    assert sum(s["sesion_ext"] == "SES-2" for s in db.sesiones) == 1


# ── bet y win ──────────────────────────────────────────────────

def test_bet_descuenta_y_registra_movimiento_y_jugada(api, db):
    r = pedir(api, bet(10.5))

    assert leer(r) == {"status": "ok", "balance": 989.5, "currency": "ARS"}
    assert db.users[7]["balance"] == 98_950
    (mov,) = db.movimientos
    assert (mov["ref"], mov["proveedor"], mov["ronda"], mov["tipo"], mov["monto"]) == (
        "atomic:tx-1", "atomic", "R1", "debito", 1050)
    assert (mov["saldo_previo"], mov["saldo_post"]) == (100_000, 98_950)
    (jugada,) = db.rounds
    assert (jugada["stake"], jugada["win"], jugada["ggr"]) == (1050, 0, 1050)
    assert jugada["game_id"] == "vs20olympgate" and jugada["agencia_code"] == "AG-01"
    assert jugada["sesion"] == "SES-1" and jugada["integracion"] == "atomic"


def test_win_acredita(api, db):
    r = pedir(api, win(25.25))

    assert leer(r)["balance"] == 1025.25
    assert db.users[7]["balance"] == 102_525
    assert db.movimientos[0]["tipo"] == "credito"
    assert (db.rounds[0]["stake"], db.rounds[0]["win"], db.rounds[0]["ggr"]) == (
        0, 2525, -2525)


def test_un_win_de_giro_gratis_sin_apuesta_se_acepta(api, db):
    """Los giros gratis se pagan con un `win` sin apuesta previa: es
    esperado, no un error, y el GGR de esa ronda queda negativo. No hay que
    'arreglarlo'."""
    r = pedir(api, win(40.0, tx="fs-1", ronda="RF", freespin=True))

    assert leer(r)["status"] == "ok"
    assert db.users[7]["balance"] == 104_000
    assert db.rounds[0]["game"] == "freespin"
    assert db.rounds[0]["ggr"] < 0
    assert not any(m["tipo"] == "debito" for m in db.movimientos)


@pytest.mark.parametrize("texto,centavos", [
    ("10.07", 1007),                 # el ejemplo que citan el panel y el pedido
    ("0.01", 1),                     # el mínimo
    ("4.35", 435),                   # el que de verdad rompe con float
    ("123456789.99", 12_345_678_999),  # un monto grande
])
def test_el_importe_decimal_del_pedido_se_cobra_exacto(api, db, texto, centavos):
    """Riesgo: el más caro y el más silencioso. El importe se manda como
    número JSON sin comillas; un error de un centavo por giro no rompe nada,
    paga mal."""
    db.users[7]["balance"] = 100_000_000_000
    crudo = ('{"method":"bet","api_key":"%s","player_id":"7","amount":%s,'
             '"meta":{"transaction":"tx-x","round_id":"R","session_id":"SES-1"}}'
             % (CLAVE, texto))

    r = pedir(api, None, crudo=crudo)

    assert leer(r)["status"] == "ok"
    assert db.movimientos[0]["monto"] == centavos
    assert db.users[7]["balance"] == 100_000_000_000 - centavos


def test_el_saldo_de_respuesta_es_exacto_con_montos_grandes(api, db):
    db.users[7]["balance"] = 123_456_789_012
    r = pedir(api, {"method": "session_info", "api_key": CLAVE,
                    "player_id": "7", "session_id": "SES-1"})

    assert b'"balance":1234567890.12' in r.content


# ── Idempotencia ───────────────────────────────────────────────

@pytest.mark.parametrize("cuerpo", [bet(10.0, tx="dup"), win(10.0, tx="dup")])
def test_una_transaccion_repetida_devuelve_el_mismo_saldo_y_no_mueve_nada(api, db, cuerpo):
    """Riesgo central: el reintento de Atomic (timeout ~1000 ms, un
    reintento) descuenta o acredita dos veces."""
    primera = pedir(api, cuerpo)
    segunda = pedir(api, cuerpo)

    assert leer(segunda) == leer(primera)
    assert len(db.movimientos) == 1 and len(db.rounds) == 1
    assert db.users[7]["balance"] == leer(primera)["balance"] * 100


def test_un_reintento_con_id_nuevo_pero_misma_ronda_tampoco_cobra_dos_veces(api, db):
    """El segundo control de la etapa 0, cableado: no sabemos si Atomic
    reutiliza el id al reintentar."""
    pedir(api, bet(10.0, tx="uuid-A", ronda="R9"))
    r = pedir(api, bet(10.0, tx="uuid-B", ronda="R9"))

    assert len(db.movimientos) == 1
    assert leer(r)["balance"] == 990.0


@pytest.mark.parametrize("metodo", ["bet", "win"])
def test_sin_transaccion_se_rechaza_y_no_se_inventa_una_clave(api, db, metodo):
    """Riesgo: un `uniqid()` de respaldo hace que cada reintento parezca un
    pedido nuevo. El panel lo sacó por eso."""
    cuerpo = bet(10.0) if metodo == "bet" else win(10.0)
    del cuerpo["meta"]["transaction"]

    r = pedir(api, cuerpo)

    assert r.status_code == 200
    assert leer(r) == {"status": "error", "message": "INVALID_TRANSACTION",
                       "balance": 1000.0, "currency": "ARS"}
    assert db.tocaron_el_saldo() == [] and db.movimientos == []


def test_dos_transacciones_distintas_no_se_confunden(api, db):
    pedir(api, bet(10.0, tx="a", ronda="R1"))
    pedir(api, bet(10.0, tx="b", ronda="R2"))

    assert len(db.movimientos) == 2 and db.users[7]["balance"] == 98_000


# ── Moneda ─────────────────────────────────────────────────────

def test_una_moneda_distinta_a_la_del_jugador_se_rechaza(api, db):
    """Riesgo: devolver pesos que el proveedor lee como euros multiplica la
    plata del cliente por mil."""
    r = pedir(api, {**bet(10.0), "currency": "EUR"})

    assert leer(r)["message"] == "CURRENCY_MISMATCH"
    assert leer(r)["currency"] == "ARS"
    assert db.tocaron_el_saldo() == []


def test_la_moneda_de_la_sesion_tiene_que_ser_la_del_jugador(api, db):
    """bet y win no mandan currency: el único ancla es la sesión con que se
    lanzó el juego."""
    db.sesiones[0]["moneda"] = "COP"

    r = pedir(api, bet(10.0))

    assert leer(r)["message"] == "CURRENCY_MISMATCH"
    assert db.tocaron_el_saldo() == []


def test_un_jugador_con_moneda_que_el_proveedor_no_tiene_se_rechaza(api, db, monkeypatch):
    db.users[7]["moneda"] = "COP"
    db.sesiones[0]["moneda"] = "COP"

    r = pedir(api, bet(10.0))

    assert leer(r)["message"] == "CURRENCY_MISMATCH"
    assert db.tocaron_el_saldo() == []


# ── Errores de negocio ─────────────────────────────────────────

def test_saldo_insuficiente_responde_con_la_forma_documentada_y_http_200(api, db):
    db.users[7]["balance"] = 500

    r = pedir(api, bet(10.0))

    assert r.status_code == 200
    assert leer(r) == {"status": "error", "message": "INSUFFICIENT_FUNDS",
                       "balance": 5.0, "currency": "ARS"}
    assert db.users[7]["balance"] == 500 and db.movimientos == []


def test_apostar_todo_el_saldo_exacto_se_permite(api, db):
    db.users[7]["balance"] = 1000

    r = pedir(api, bet(10.0))

    assert leer(r)["status"] == "ok" and db.users[7]["balance"] == 0


def test_una_sesion_de_otro_jugador_se_rechaza(api, db):
    """Riesgo: un session_id ajeno cobra o paga en la cuenta equivocada."""
    db.sesiones[0]["user_id"] = 8

    r = pedir(api, bet(10.0))

    assert leer(r)["message"] == "SESSION_MISMATCH"
    assert db.tocaron_el_saldo() == []


def test_una_sesion_desconocida_se_acepta_y_se_avisa(api, db, caplog):
    """Rechazar un `win` por no conocer la sesión le quita al jugador un
    premio que ya ganó."""
    with caplog.at_level("WARNING"):
        r = pedir(api, win(10.0, sesion="SES-DESCONOCIDA"))

    assert leer(r)["status"] == "ok" and len(db.movimientos) == 1
    assert "sesión desconocida" in caplog.text


def test_un_jugador_bloqueado_no_apuesta_pero_cobra_su_premio(api, db):
    """Una ronda ya empezada se liquida aunque la cuenta se bloquee."""
    db.users[7]["bloqueado"] = True

    apuesta = pedir(api, bet(10.0))
    premio = pedir(api, win(10.0))

    assert leer(apuesta)["message"] == "PLAYER_BLOCKED"
    assert leer(premio)["status"] == "ok"
    assert [m["tipo"] for m in db.movimientos] == ["credito"]


@pytest.mark.parametrize("player_id", ["999", "juanito", "", None, "7 "])
def test_el_jugador_es_solo_el_id_interno(api, db, player_id):
    """Riesgo: aceptar el username abre un segundo camino de identidad."""
    cuerpo = bet(10.0)
    cuerpo["player_id"] = player_id
    if player_id == "7 ":  # con espacio: se recorta y vale
        assert leer(pedir(api, cuerpo))["status"] == "ok"
        return

    r = pedir(api, cuerpo)

    assert r.status_code == 200 and leer(r)["message"] == "PLAYER_NOT_FOUND"
    assert db.tocaron_el_saldo() == []


@pytest.mark.parametrize("monto", ["abc", -5, None, "1e99"])
def test_un_importe_invalido_se_rechaza_sin_mover_plata(api, db, monto):
    cuerpo = bet(10.0)
    cuerpo["amount"] = monto

    r = pedir(api, cuerpo)

    assert leer(r)["message"] == "INVALID_REQUEST"
    assert db.tocaron_el_saldo() == []


def test_un_importe_cero_no_mueve_ni_registra_nada(api, db):
    r = pedir(api, win(0))

    assert leer(r)["status"] == "ok" and db.movimientos == []


def test_un_metodo_desconocido_da_error_con_http_200(api, db):
    r = pedir(api, {"method": "rollback", "api_key": CLAVE, "player_id": "7",
                    "amount": 10.0, "meta": {"transaction": "t"}})

    assert r.status_code == 200
    assert leer(r)["message"] == "UNKNOWN_METHOD"
    assert db.tocaron_el_saldo() == []


def test_no_se_construye_un_rollback(api):
    """Atomic confirmó por escrito que no existe y que es deliberado."""
    assert "rollback" not in atomic.METODOS
    assert not any("rollback" in r.path for r in api.app.routes
                   if "atomic" in r.path)


# ── Quién puede llamar ─────────────────────────────────────────

def test_una_ip_fuera_de_la_lista_recibe_403_y_no_toca_nada(api, db):
    r = pedir(api, bet(10.0), ip="198.51.100.9")

    assert r.status_code == 403
    assert db.sentencias == []


def test_una_lista_vacia_rechaza_todo(api, db, monkeypatch):
    async def sin_ips(codigo):
        return proveedor(ips_permitidas=())
    monkeypatch.setattr(api, "_proveedor", sin_ips)

    assert pedir(api, bet(10.0)).status_code == 403


def test_una_api_key_incorrecta_no_mueve_plata(api, db):
    cuerpo = bet(10.0)
    cuerpo["api_key"] = "otra"

    r = pedir(api, cuerpo)

    assert r.status_code == 200 and leer(r)["message"] == "INVALID_API_KEY"
    assert db.sentencias == []


def test_una_fila_que_no_es_atomic_no_atiende_estos_callbacks(api, db, monkeypatch):
    async def otra(codigo):
        return proveedor(adaptador="neoluck")
    monkeypatch.setattr(api, "_proveedor", otra)

    assert pedir(api, bet(10.0)).status_code == 403


def test_cada_fila_tiene_su_propia_url_y_su_propia_clave(api, db, monkeypatch):
    """El sandbox (`atomic_test`) no puede leerse con la clave de producción."""
    async def dos(codigo):
        if codigo == "atomic_test":
            return proveedor(codigo="atomic_test", api_secret="CLAVE-TEST")
        return proveedor()
    monkeypatch.setattr(api, "_proveedor", dos)

    con_clave_de_produccion = pedir(
        api, bet(10.0), ruta="/api/slots/atomic/callback/atomic_test")
    assert leer(con_clave_de_produccion)["message"] == "INVALID_API_KEY"

    cuerpo = bet(10.0)
    cuerpo["api_key"] = "CLAVE-TEST"
    ok = pedir(api, cuerpo, ruta="/api/slots/atomic/callback/atomic_test")
    assert leer(ok)["status"] == "ok"
    assert db.movimientos[0]["ref"] == "atomic_test:tx-1"


@pytest.mark.parametrize("crudo", ["no es json", "[1,2]", "", "{"])
def test_un_cuerpo_ilegible_da_error_con_http_200(api, db, crudo):
    r = pedir(api, None, crudo=crudo)

    assert r.status_code == 200 and leer(r)["message"] == "INVALID_REQUEST"


# ── Rondas a medias ────────────────────────────────────────────

def test_un_win_que_falla_deja_un_aviso_para_que_alguien_lo_ajuste(api, db, caplog):
    """No hay rollback: la ronda la corrige una persona. Si el log no la
    nombra, nadie la encuentra."""
    db.fallar_al_registrar = True

    with caplog.at_level("ERROR"):
        r = pedir(api, win(30.0, tx="tx-perdido", ronda="R-PERDIDA"))

    assert r.status_code == 200
    assert leer(r)["message"] == "INTERNAL_ERROR"
    assert "RONDA A MEDIAS" in caplog.text
    assert "R-PERDIDA" in caplog.text and "tx-perdido" in caplog.text
    assert db.users[7]["balance"] == 100_000, "el crédito no puede quedar a medias"
    assert db.movimientos == []


def test_un_bet_que_falla_no_deja_el_saldo_tocado(api, db):
    db.fallar_al_registrar = True

    r = pedir(api, bet(10.0))

    assert leer(r)["message"] == "INTERNAL_ERROR"
    assert db.users[7]["balance"] == 100_000


def test_un_win_rechazado_por_validacion_tambien_se_avisa(api, db, caplog):
    db.sesiones[0]["user_id"] = 8
    with caplog.at_level("ERROR"):
        pedir(api, win(10.0, ronda="R-AJENA"))

    assert "RONDA A MEDIAS" in caplog.text and "R-AJENA" in caplog.text


def test_el_cierre_de_una_ronda_que_no_cuadra_deja_un_aviso(api, db, caplog):
    """Atomic dice que pagó 25.00 y nosotros no acreditamos nada."""
    pedir(api, bet(10.0, ronda="R5"))
    with caplog.at_level("WARNING"):
        r = pedir(api, {"method": "round_info", "api_key": CLAVE,
                        "player_id": "7", "status": "finish", "round_id": "R5",
                        "session_id": "SES-1", "bet_amount": 10.0,
                        "win_amount": 25.0, "has_win": True})

    assert leer(r)["status"] == "ok"
    assert "no cuadra al cerrar" in caplog.text
    assert len(db.movimientos) == 1, "avisar no corrige: lo corrige una persona"


def test_el_cierre_de_una_ronda_que_cuadra_no_avisa(api, db, caplog):
    pedir(api, bet(10.0, ronda="R6"))
    pedir(api, win(25.0, tx="w6", ronda="R6"))
    with caplog.at_level("WARNING"):
        pedir(api, {"method": "round_info", "api_key": CLAVE, "player_id": "7",
                    "status": "finish", "round_id": "R6", "session_id": "SES-1",
                    "bet_amount": 10.0, "win_amount": 25.0})

    assert "no cuadra" not in caplog.text


# ── El camino caliente ─────────────────────────────────────────

def test_un_bet_lee_al_jugador_y_a_la_sesion_en_un_solo_viaje(api, db):
    """Atomic corta cerca de 1000 ms y `round_info` no se puede apagar, así
    que cada bet compite con el doble de llamadas. Jugador y sesión salen de
    la misma consulta."""
    pedir(api, bet(10.0))

    lecturas = [q for q in db.sentencias if q.startswith("SELECT u.id")]
    assert len(lecturas) == 1
    assert not any(q.startswith("SELECT") and "casino_sesiones" in q
                   and not q.startswith("SELECT u.id") for q in db.sentencias)


def test_round_info_al_iniciar_es_una_sola_consulta(api, db):
    pedir(api, {"method": "round_info", "api_key": CLAVE, "player_id": "7",
                "status": "start", "round_id": "R1", "session_id": "SES-1"})

    assert len(db.sentencias) == 1
