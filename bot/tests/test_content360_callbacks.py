"""Los callbacks de Content360: el único punto donde Content360 mueve el saldo
de un jugador. Es donde se pierde plata si algo está mal, así que cada prueba
nombra el riesgo que cuida.

Van contra una base en memoria que emula las consultas de este camino y la
atomicidad de la transacción. NO se probó contra un Content360 real ni contra
Postgres: lo que se verifica es la lógica y la forma de las respuestas, no la
latencia (ellos cortan a los 3 s) ni el SQL contra un motor de verdad. La firma
se calcula como la documentan; que sea la que mandan de verdad es lo que
queda por verificar con tráfico.
"""

import asyncio
import copy
import hashlib
import hmac
import importlib
import json
import logging

import httpx
import pytest

import content360 as c360
import registro_proveedores as rp
from test_runtime_config import settings
from test_wallet_setbalance import use_fake_pool

CLIENTE_REAL = httpx.AsyncClient
CLAVE = "CLAVE-DE-CONTENT360"


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
            self.db.users, self.db.movimientos, self.db.rounds = self.copia
        return False


class FakeDB:
    def __init__(self, saldo=100_000, moneda="ARS", bloqueado=False):
        self.users = {7: {"balance": saldo, "moneda": moneda,
                          "bloqueado": bloqueado, "creado_por": "AG-01"},
                      8: {"balance": 5_000, "moneda": "ARS",
                          "bloqueado": False, "creado_por": "AG-01"}}
        self.sesiones = [{"sesion_ext": "SES-1", "user_id": 7, "moneda": "ARS",
                          "game_id": "777", "game_titulo": "Ruleta en vivo",
                          "agencia_code": "AG-01", "integracion": "content360"}]
        self.movimientos = []
        self.rounds = []
        self.juegos = {}
        self.sentencias = []
        self.fallar_al_registrar = False

    def transaction(self):
        return Transaccion(self)

    async def fetchrow(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT u.id, u.balance"):
            u = self.users.get(args[0])
            if u is None:
                return None
            s = next((x for x in reversed(self.sesiones)
                      if x["sesion_ext"] == args[1]), None)
            return {"id": args[0], **u,
                    "ses_user": s["user_id"] if s else None,
                    "ses_moneda": s["moneda"] if s else None,
                    "ses_juego": s["game_id"] if s else None,
                    "ses_titulo": s["game_titulo"] if s else None,
                    "ses_agencia": s["agencia_code"] if s else None}
        if q.startswith("SELECT saldo_post FROM casino_movimientos WHERE ref=$1"):
            return next(({"saldo_post": m["saldo_post"]} for m in self.movimientos
                         if m["ref"] == args[0]), None)
        if q.startswith("UPDATE users SET balance = balance - $2"):
            u = self.users[args[0]]
            if "AND balance >= $2" in q and u["balance"] < args[1]:
                return None
            u["balance"] -= args[1]
            return {"balance": u["balance"]}
        if q.startswith("UPDATE users SET balance = balance + $2"):
            u = self.users[args[0]]
            u["balance"] += args[1]
            return {"balance": u["balance"]}
        raise AssertionError(f"fetchrow inesperado: {q}")

    async def fetch(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT tipo, COALESCE(SUM(monto),0) AS total"):
            prov, ronda, uid = args
            tot = {}
            for m in self.movimientos:
                if (m["proveedor"], m["ronda"], m["jugador_id"]) == (prov, ronda, uid):
                    tot[m["tipo"]] = tot.get(m["tipo"], 0) + m["monto"]
            return [{"tipo": t, "total": v} for t, v in tot.items()]
        raise AssertionError(f"fetch inesperado: {q}")

    async def fetchval(self, query, *args):
        q = " ".join(query.split())
        self.sentencias.append(q)
        if q.startswith("SELECT balance FROM users WHERE id=$1"):
            return self.users[args[0]]["balance"]
        raise AssertionError(f"fetchval inesperado: {q}")

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
        if q.startswith("INSERT INTO casino_juegos"):
            integ, gid, titulo, marca, imagen, vivo, _, activo, sabe = args
            previo = self.juegos.get((integ, gid))
            if previo is None:
                self.juegos[(integ, gid)] = dict(
                    titulo=titulo, marca=marca, imagen=imagen, es_vivo=vivo,
                    activo=activo)
            else:
                previo.update(
                    titulo=titulo, activo=activo,
                    marca=marca if marca is not None else previo["marca"],
                    imagen=imagen if imagen is not None else previo["imagen"],
                    es_vivo=vivo if sabe else previo["es_vivo"])
            return "INSERT 0 1"
        raise AssertionError(f"execute inesperado: {q}")

    def tocaron_el_saldo(self):
        return [q for q in self.sentencias if q.startswith("UPDATE users")]


# ── El cliente ─────────────────────────────────────────────────

def proveedor(**cambios):
    datos = dict(codigo="content360", adaptador="content360", activa=True,
                 url="https://c360.example", api_code="69", api_secret=CLAVE,
                 monedas=("ARS",), ips_permitidas=(), origen="base")
    datos.update(cambios)
    return rp.Proveedor(**datos)


@pytest.fixture
def db(api, monkeypatch):
    base = FakeDB()
    use_fake_pool(api, monkeypatch, base)
    api.db_prov = {"content360": proveedor()}

    async def prov(codigo):
        return api.db_prov.get(codigo)

    monkeypatch.setattr(api, "_proveedor", prov)
    api._c360_variantes_vistas.clear()
    return base


def firmar(cadena, clave=CLAVE):
    return hmac.new(clave.encode(), cadena.encode(), hashlib.sha256).hexdigest()


def canonico_json(cuerpo_texto):
    """La forma documentada, calculada aparte del módulo: claves ordenadas,
    sin espacios, barras escapadas."""
    datos = json.loads(cuerpo_texto)
    return json.dumps(dict(sorted(datos.items())), separators=(",", ":"),
                      ensure_ascii=False).replace("/", "\\/")


def pedir(api, endpoint, cuerpo=None, *, crudo=None, firma="auto", ip=None,
          codigo=None, consulta=None, clave=CLAVE):
    """POST con el cuerpo como texto JSON tal cual, para que un `4.35` llegue
    como `4.35` y no como el float que Python ya redondeó. `consulta` hace un
    GET firmado como consulta ordenada."""
    if endpoint == "balance":
        consulta = consulta if consulta is not None else {}
        texto = "&".join(f"{k}={v}" for k, v in sorted(consulta.items()))
        url = "/api/slots/content360/" + (f"{codigo}/" if codigo else "") + "balance"
        firma_real = firmar(texto, clave) if firma == "auto" else firma
        pedido = lambda cli: cli.get(url, params=consulta,
                                     headers=_cab(firma_real, ip))
    else:
        contenido = crudo if crudo is not None else json.dumps(cuerpo)
        firma_real = (firmar(canonico_json(contenido), clave)
                      if firma == "auto" else firma)
        url = "/api/slots/content360/" + (f"{codigo}/" if codigo else "") + endpoint
        pedido = lambda cli: cli.post(url, content=contenido,
                                      headers={**_cab(firma_real, ip),
                                               "content-type": "application/json"})

    async def _enviar():
        transport = httpx.ASGITransport(app=api.app, raise_app_exceptions=False)
        async with CLIENTE_REAL(transport=transport,
                                base_url="http://testserver") as cli:
            return await pedido(cli)
    return asyncio.run(_enviar())


def _cab(firma, ip):
    cab = {}
    if firma is not None:
        cab["x-content-key"] = firma
    if ip:
        cab["x-forwarded-for"] = ip
    return cab


def debit(monto, tx="tx-1", ronda="R1", tipo="bet", **extra):
    return {"action": "debit", "user": "7", "amount": monto, "round": ronda,
            "transaction": tx, "currency": "ARS", "game": "777", "type": tipo,
            "session_token": "SES-1", **extra}


def credit(monto, tx="tx-2", ronda="R1", tipo="win", **extra):
    return {**debit(monto, tx, ronda, tipo), "action": "credit", **extra}


def leer(r):
    return json.loads(r.content)


# ── La firma ───────────────────────────────────────────────────

def test_un_debit_bien_firmado_se_aplica_y_una_firma_equivocada_da_codigo_4(api, db):
    """Riesgo: aceptar un callback que cualquiera puede mandar a una URL
    pública y acreditarse plata; y rechazar el legítimo."""
    malo = pedir(api, "debit", debit(10.0), firma="0" * 64)
    assert malo.status_code == 200
    assert leer(malo)["code"] == 4
    assert db.tocaron_el_saldo() == [] and db.movimientos == []

    bueno = pedir(api, "debit", debit(10.0))
    assert bueno.status_code == 200 and leer(bueno)["code"] == 0
    assert db.users[7]["balance"] == 99_000


def test_sin_cabecera_de_firma_es_codigo_4(api, db):
    r = pedir(api, "debit", debit(10.0), firma=None)

    assert r.status_code == 200 and leer(r)["code"] == 4
    assert db.movimientos == []


def test_la_firma_con_otra_clave_se_rechaza(api, db):
    r = pedir(api, "credit", credit(1000.0), clave="clave-de-otro")

    assert leer(r)["code"] == 4
    assert db.users[7]["balance"] == 100_000


def test_un_rechazo_por_firma_deja_el_diagnostico_en_el_log(api, db, caplog):
    """Riesgo: rechazar callbacks reales sin poder saber qué forma de firma
    mandaron. El log lleva la firma recibida, el cuerpo y qué se calculó."""
    with caplog.at_level(logging.WARNING):
        pedir(api, "debit", debit(10.0, tx="TX-DIAG"), firma="ab" * 32)

    texto = "\n".join(caplog.messages)
    assert "firma inválida en debit" in texto
    assert "ab" * 32 in texto and "TX-DIAG" in texto
    assert "prefijos_calculados=[json:orden=1" in texto
    assert CLAVE not in texto


def test_la_primera_firma_valida_de_cada_forma_queda_registrada(api, db, caplog):
    with caplog.at_level(logging.WARNING):
        pedir(api, "debit", debit(1.0, tx="a"))
        pedir(api, "debit", debit(1.0, tx="b"))

    avisos = [m for m in caplog.messages if "primera firma válida" in m]
    assert len(avisos) == 1 and "json:orden=1" in avisos[0]


def test_una_firma_sobre_el_cuerpo_crudo_tambien_pasa(api, db):
    """Su firma real no coincide con la documentada: si firman el cuerpo
    tal como lo mandan, con espacios, tiene que pasar."""
    crudo = json.dumps(debit(2.5, tx="CRUDO"), indent=2)

    r = pedir(api, "debit", crudo=crudo, firma=firmar(crudo))

    assert leer(r)["code"] == 0
    assert db.users[7]["balance"] == 99_750


# ── balance ────────────────────────────────────────────────────

def test_balance_devuelve_el_saldo_sin_mover_nada(api, db):
    r = pedir(api, "balance", consulta={"action": "balance", "user": "7",
                                        "currency": "ARS"})

    assert r.status_code == 200
    assert leer(r) == {"code": 0, "description": "Success",
                       "data": {"balance": 1000.0}}
    assert db.tocaron_el_saldo() == [] and db.movimientos == []


def test_balance_de_un_jugador_que_no_existe_es_codigo_2(api, db):
    for user in ("999", "juanito", ""):
        r = pedir(api, "balance", consulta={"action": "balance", "user": user,
                                            "currency": "ARS"})
        assert r.status_code == 200 and leer(r)["code"] == 2


def test_balance_con_firma_mala_es_200_con_codigo_4(api, db):
    r = pedir(api, "balance", consulta={"user": "7"}, firma="1" * 64)

    assert r.status_code == 200 and leer(r)["code"] == 4


# ── notification: el catálogo, NO plata ────────────────────────

def notificacion(**cambios):
    datos = {"action": "notification", "id": 555, "name": "Roulette Live",
             "image": "http://i/5.png", "brand_id": 9, "status": 1,
             "categories": ["Live Casino"]}
    datos.update(cambios)
    return datos


def test_notification_no_mueve_plata(api, db):
    """Riesgo: tratar `notification` como un movimiento. Es el catálogo: un
    upsert por `id`, sin tocar saldos ni movimientos."""
    r = pedir(api, "notification", notificacion())

    assert r.status_code == 200 and leer(r) == {"code": 0, "description": "Success"}
    assert db.tocaron_el_saldo() == []
    assert db.movimientos == [] and db.rounds == []
    assert db.users[7]["balance"] == 100_000


def test_notification_es_un_upsert_por_id_y_marca_lo_que_es_en_vivo(api, db):
    pedir(api, "notification", notificacion())
    pedir(api, "notification", notificacion(name="Roulette Live 2"))

    assert list(db.juegos) == [("content360", "555")]
    juego = db.juegos[("content360", "555")]
    assert juego["titulo"] == "Roulette Live 2"
    assert juego["es_vivo"] is True and juego["activo"] is True


def test_notification_sin_categorias_no_pisa_lo_que_ya_era_en_vivo(api, db):
    """Riesgo: una notificación pobre convierte una mesa en vivo en slot."""
    pedir(api, "notification", notificacion())
    pedir(api, "notification", notificacion(categories=[]))

    assert db.juegos[("content360", "555")]["es_vivo"] is True


def test_notification_con_status_cero_apaga_el_juego(api, db):
    pedir(api, "notification", notificacion())
    pedir(api, "notification", notificacion(status=0))

    assert db.juegos[("content360", "555")]["activo"] is False


def test_notification_con_firma_mala_no_guarda_nada(api, db):
    r = pedir(api, "notification", notificacion(), firma="f" * 64)

    assert r.status_code == 200 and leer(r)["code"] == 1
    assert db.juegos == {}


def test_notification_sin_id_se_rechaza(api, db):
    r = pedir(api, "notification", {"action": "notification", "name": "x"})

    assert r.status_code == 200 and leer(r)["code"] == 1
    assert db.juegos == {}


# ── debit / credit ─────────────────────────────────────────────

def test_una_apuesta_descuenta_y_registra_movimiento_y_jugada(api, db):
    r = pedir(api, "debit", debit(10.07, tx="T1"))

    assert leer(r) == {"code": 0, "description": "Success",
                       "data": {"balance": 989.93,
                                "transaction": "content360:T1"}}
    assert db.users[7]["balance"] == 98_993
    m = db.movimientos[0]
    assert (m["tipo"], m["monto"], m["proveedor"], m["ronda"]) == \
        ("debito", 1007, "content360", "R1")
    assert db.rounds[0]["stake"] == 1007 and db.rounds[0]["ggr"] == 1007
    assert db.rounds[0]["sesion"] == "SES-1"


@pytest.mark.parametrize("texto,centavos", [("4.35", 435), ("1.15", 115),
                                           ("0.29", 29)])
def test_los_importes_que_rompen_el_float_se_cobran_exactos(api, db, texto, centavos):
    """Riesgo: cobrar un centavo de menos. `int(4.35*100)` da 434 y no falla:
    cobra mal. Llega como texto JSON, como lo manda el proveedor."""
    crudo = ('{"action":"debit","user":"7","amount":' + texto +
             ',"round":"R1","transaction":"tx-f","currency":"ARS","game":"777"}')

    r = pedir(api, "debit", crudo=crudo)

    assert leer(r)["code"] == 0
    assert db.users[7]["balance"] == 100_000 - centavos
    assert db.movimientos[0]["monto"] == centavos


def test_un_premio_acredita_y_su_ggr_es_la_apuesta_menos_el_premio(api, db):
    pedir(api, "debit", debit(10.0, tx="b"))
    r = pedir(api, "credit", credit(25.5, tx="w"))

    assert leer(r)["data"]["balance"] == 1015.5
    assert sum(x["ggr"] for x in db.rounds) == 1000 - 2550


def test_los_giros_gratis_son_un_premio_sin_apuesta(api, db):
    """El GGR negativo es lo esperado, no un error de cálculo."""
    pedir(api, "credit", credit(5.0, tx="fs", tipo="free_spins"))

    assert db.rounds[0]["game"] == "freespin"
    assert db.rounds[0]["stake"] == 0 and db.rounds[0]["ggr"] == -500


def test_una_transaccion_repetida_devuelve_el_mismo_saldo_y_no_mueve_nada(api, db):
    """Riesgo: cobrar dos veces cuando Content360 reintenta (lo hace, con la
    misma `transaction`)."""
    primera = pedir(api, "debit", debit(10.0, tx="T-REP"))
    segunda = pedir(api, "debit", debit(10.0, tx="T-REP"))

    assert leer(primera) == leer(segunda)
    assert db.users[7]["balance"] == 99_000
    assert len(db.movimientos) == 1 and len(db.tocaron_el_saldo()) == 1


def test_un_premio_repetido_no_se_paga_dos_veces(api, db):
    pedir(api, "credit", credit(50.0, tx="W-REP"))
    pedir(api, "credit", credit(50.0, tx="W-REP"))

    assert db.users[7]["balance"] == 105_000 and len(db.movimientos) == 1


def test_la_clave_de_idempotencia_lleva_el_prefijo_del_proveedor(api, db):
    """La clave lleva el prefijo del proveedor."""
    pedir(api, "debit", debit(1.0, tx="IGUAL"))
    assert db.movimientos[0]["ref"] == "content360:IGUAL"


def test_dos_apuestas_iguales_en_la_misma_ronda_se_cobran_las_dos(api, db):
    """Riesgo: el segundo control de idempotencia (mismo monto y tipo en la
    misma ronda con un id nuevo) leería la segunda como un reintento y no la
    cobraría. Content360 reintenta con la MISMA `transaction`, así que ese
    control acá solo puede hacer daño."""
    pedir(api, "debit", debit(5.0, tx="mano-1", ronda="BJ-1"))
    pedir(api, "debit", debit(5.0, tx="mano-2", ronda="BJ-1"))

    assert db.users[7]["balance"] == 99_000 and len(db.movimientos) == 2


def test_sin_saldo_es_codigo_1_y_no_deja_rastro(api, db):
    """Riesgo: dejar jugar a crédito, o dejar un movimiento a medias."""
    db.users[7]["balance"] = 500

    r = pedir(api, "debit", debit(10.0, tx="caro"))

    assert r.status_code == 200
    assert leer(r)["code"] == 1 and leer(r)["data"]["balance"] == 5.0
    assert db.users[7]["balance"] == 500
    assert db.movimientos == [] and db.rounds == []


def test_un_jugador_bloqueado_no_apuesta_pero_cobra_su_premio(api, db):
    db.users[7]["bloqueado"] = True

    apuesta = pedir(api, "debit", debit(10.0, tx="b"))
    premio = pedir(api, "credit", credit(10.0, tx="w"))

    assert leer(apuesta)["code"] == 2
    assert leer(premio)["code"] == 0 and db.users[7]["balance"] == 101_000


def test_un_jugador_inexistente_es_codigo_2(api, db):
    for user in ("999", "juanito", ""):
        r = pedir(api, "debit", {**debit(1.0), "user": user})
        assert r.status_code == 200 and leer(r)["code"] == 2


def test_la_moneda_del_pedido_tiene_que_ser_la_del_jugador(api, db):
    """Riesgo: mover pesos como si fueran otra moneda multiplica la plata."""
    r = pedir(api, "debit", {**debit(10.0), "currency": "EUR"})

    assert leer(r)["code"] == 3
    assert db.users[7]["balance"] == 100_000


def test_una_sesion_de_otro_jugador_se_rechaza(api, db):
    db.sesiones.append({**db.sesiones[0], "sesion_ext": "AJENA", "user_id": 8})

    r = pedir(api, "debit", {**debit(1.0), "session_token": "AJENA"})

    assert leer(r)["code"] == 3 and db.movimientos == []


def test_una_sesion_desconocida_se_acepta_para_no_quitarle_un_premio(api, db):
    r = pedir(api, "credit", {**credit(10.0), "session_token": "NUEVA"})

    assert leer(r)["code"] == 0 and db.users[7]["balance"] == 101_000


def test_un_pedido_sin_transaction_no_se_aplica(api, db):
    """No se inventa una clave de idempotencia: una que cambia en cada
    intento no protege de nada."""
    cuerpo = debit(10.0)
    del cuerpo["transaction"]

    r = pedir(api, "debit", cuerpo)

    assert leer(r)["code"] == 3 and db.tocaron_el_saldo() == []


@pytest.mark.parametrize("cambios", [
    {"amount": "abc"}, {"amount": -5}, {"amount": None}, {"type": "inventado"},
])
def test_un_importe_o_tipo_invalido_es_codigo_3_y_no_mueve_plata(api, db, cambios):
    r = pedir(api, "debit", {**debit(1.0), **cambios})

    assert r.status_code == 200 and leer(r)["code"] == 3
    assert db.tocaron_el_saldo() == []


def test_un_tipo_en_el_endpoint_equivocado_no_se_aplica(api, db):
    """Riesgo: un `win` por el endpoint de débito cobraría un premio."""
    r = pedir(api, "debit", debit(10.0, tipo="win"))
    assert leer(r)["code"] == 3 and db.users[7]["balance"] == 100_000

    r = pedir(api, "credit", credit(10.0, tipo="bet"))
    assert leer(r)["code"] == 3 and db.users[7]["balance"] == 100_000


def test_un_action_que_contradice_el_endpoint_no_se_aplica(api, db):
    r = pedir(api, "debit", {**debit(10.0), "action": "credit"})

    assert leer(r)["code"] == 3 and db.tocaron_el_saldo() == []


# ── rollback y conciliación ────────────────────────────────────

def test_un_rollback_de_una_ronda_que_no_existe_es_codigo_3(api, db):
    """Riesgo: acreditar plata por revertir algo que nunca nos llegó. Es lo
    que documentan: código 3."""
    r = pedir(api, "credit", credit(10.0, tx="rb", ronda="NUNCA", tipo="rollback"))

    assert r.status_code == 200 and leer(r)["code"] == 3
    assert db.users[7]["balance"] == 100_000 and db.movimientos == []


def test_un_rollback_devuelve_la_apuesta_y_el_reporte_queda_en_cero(api, db):
    pedir(api, "debit", debit(10.0, tx="b", ronda="R9"))

    r = pedir(api, "credit", credit(10.0, tx="rb", ronda="R9", tipo="rollback"))

    assert leer(r)["code"] == 0 and db.users[7]["balance"] == 100_000
    assert [m["tipo"] for m in db.movimientos] == ["debito", "devolucion"]
    assert sum(x["ggr"] for x in db.rounds) == 0
    assert sum(x["stake"] for x in db.rounds) == 0


def test_dos_rollbacks_de_la_misma_apuesta_con_transaction_distinta_devuelven_una_vez(api, db):
    """Riesgo: la idempotencia por `transaction` no los ve como repetidos."""
    pedir(api, "debit", debit(10.0, tx="b", ronda="R9"))
    pedir(api, "credit", credit(10.0, tx="rb-1", ronda="R9", tipo="rollback"))

    segundo = pedir(api, "credit", credit(10.0, tx="rb-2", ronda="R9",
                                          tipo="refund"))

    assert leer(segundo)["code"] == 3
    assert db.users[7]["balance"] == 100_000


def test_un_rollback_no_puede_devolver_mas_de_lo_apostado(api, db):
    pedir(api, "debit", debit(10.0, tx="b", ronda="R9"))

    r = pedir(api, "credit", credit(50.0, tx="rb", ronda="R9", tipo="rollback"))

    assert leer(r)["code"] == 3 and db.users[7]["balance"] == 99_000


def test_un_rollback_de_la_ronda_de_otro_jugador_no_cuenta(api, db):
    db.users[8]["balance"] = 5_000
    pedir(api, "debit", {**debit(10.0, tx="b", ronda="AJENA"), "user": "8",
                         "session_token": "x"})

    r = pedir(api, "credit", credit(10.0, tx="rb", ronda="AJENA",
                                    tipo="rollback"))   # jugador 7

    assert leer(r)["code"] == 3 and db.users[7]["balance"] == 100_000


def test_un_rollback_repetido_con_la_misma_transaction_no_devuelve_dos_veces(api, db):
    pedir(api, "debit", debit(10.0, tx="b", ronda="R9"))
    pedir(api, "credit", credit(10.0, tx="rb", ronda="R9", tipo="rollback"))
    pedir(api, "credit", credit(10.0, tx="rb", ronda="R9", tipo="rollback"))

    assert db.users[7]["balance"] == 100_000 and len(db.movimientos) == 2


def test_un_rollback_por_debit_anula_un_premio_ya_pagado(api, db):
    pedir(api, "debit", debit(10.0, tx="b", ronda="R9"))
    pedir(api, "credit", credit(30.0, tx="w", ronda="R9"))

    r = pedir(api, "debit", debit(30.0, tx="void", ronda="R9", tipo="rollback"))

    assert leer(r)["code"] == 0 and db.users[7]["balance"] == 99_000
    assert db.movimientos[-1]["tipo"] == "anulacion_premio"
    assert sum(x["ggr"] for x in db.rounds) == 1000   # solo queda la apuesta


def test_anular_un_premio_que_nunca_se_pago_es_codigo_3(api, db):
    r = pedir(api, "debit", debit(30.0, tx="void", ronda="NADA", tipo="rollback"))

    assert leer(r)["code"] == 3 and db.users[7]["balance"] == 100_000


def test_la_conciliacion_se_aplica_aunque_no_alcance_el_saldo(api, db):
    """Riesgo: rechazar una apuesta que ellos dieron por hecha. Su
    documentación: se procesa incondicionalmente."""
    db.users[7]["balance"] = 100

    r = pedir(api, "debit", debit(10.0, tx="conc", tipo="conciliation"))

    assert leer(r)["code"] == 0
    assert db.users[7]["balance"] == -900


def test_la_conciliacion_de_algo_ya_aplicado_no_lo_duplica(api, db):
    """Content360 reintenta con la misma `transaction` y solo cambia el
    `type`. Si el original se aplicó, la conciliación devuelve lo guardado."""
    pedir(api, "credit", credit(20.0, tx="MISMA"))
    saldo = db.users[7]["balance"]

    r = pedir(api, "credit", credit(20.0, tx="MISMA", tipo="conciliation"))

    assert leer(r)["code"] == 0 and db.users[7]["balance"] == saldo
    assert len(db.movimientos) == 1


def test_la_conciliacion_de_algo_que_fallo_lo_aplica(api, db):
    db.fallar_al_registrar = True
    assert leer(pedir(api, "credit", credit(20.0, tx="CAIDO")))["code"] == 99
    assert db.users[7]["balance"] == 100_000, "la transacción se deshizo"

    db.fallar_al_registrar = False
    r = pedir(api, "credit", credit(20.0, tx="CAIDO", tipo="conciliation"))

    assert leer(r)["code"] == 0 and db.users[7]["balance"] == 102_000


def test_un_premio_que_no_se_pudo_acreditar_deja_aviso_en_rojo(api, db, caplog):
    """Riesgo: un premio perdido que nadie encuentra."""
    db.fallar_al_registrar = True
    with caplog.at_level(logging.ERROR):
        r = pedir(api, "credit", credit(20.0, tx="CAIDO"))

    assert leer(r)["code"] == 99
    assert any("PREMIO SIN ACREDITAR" in m and "CAIDO" in m
               for m in caplog.messages)


# ── Siempre HTTP 200 ───────────────────────────────────────────

def test_toda_respuesta_es_http_200_incluso_los_errores_y_la_basura(api, db):
    """Riesgo: un 4xx o 5xx lo leen como falla de red y disparan reintentos."""
    db.users[7]["balance"] = 100
    casos = [
        pedir(api, "debit", debit(10.0), firma="0" * 64),
        pedir(api, "debit", debit(10.0, tx="caro")),                 # sin saldo
        pedir(api, "debit", {**debit(10.0), "user": "999"}),         # sin jugador
        pedir(api, "credit", credit(1.0, ronda="NUNCA", tipo="rollback")),
        pedir(api, "debit", crudo="no es json", firma=firmar("no es json")),
        pedir(api, "debit", crudo="[1,2]", firma=firmar("[1,2]")),
        pedir(api, "debit", crudo="", firma=None),
        pedir(api, "notification", {"x": 1}),
        pedir(api, "balance", consulta={}),
        pedir(api, "debit", debit(10.0), codigo="no-existe"),
    ]

    assert [r.status_code for r in casos] == [200] * len(casos)
    assert all("code" in leer(r) for r in casos)


def test_una_fila_que_no_es_de_este_adaptador_responde_sin_procesar(api, db):
    api.db_prov["atomic"] = proveedor(codigo="atomic", adaptador="atomic")

    r = pedir(api, "debit", debit(10.0), codigo="atomic")

    assert r.status_code == 200 and leer(r)["code"] == 99
    assert db.tocaron_el_saldo() == []


def test_un_proveedor_apagado_no_atiende_callbacks(api, db):
    api.db_prov["content360"] = proveedor(activa=False)

    r = pedir(api, "debit", debit(10.0))

    assert leer(r)["code"] == 99 and db.tocaron_el_saldo() == []


def test_el_sandbox_usa_su_propia_clave(api, db):
    """Riesgo: un pedido de pruebas firmado con la clave de producción (o al
    revés)."""
    api.db_prov["content360_test"] = proveedor(codigo="content360_test",
                                              api_secret="CLAVE-DE-PRUEBAS")

    con_prod = pedir(api, "debit", debit(1.0), codigo="content360_test")
    con_test = pedir(api, "debit", debit(1.0, tx="t2"), codigo="content360_test",
                     clave="CLAVE-DE-PRUEBAS")

    assert leer(con_prod)["code"] == 4 and leer(con_test)["code"] == 0
    assert db.movimientos[0]["proveedor"] == "content360_test"


# ── La lista de IP, que acá es opcional ────────────────────────

def test_sin_ip_cargadas_la_firma_es_la_unica_defensa(api, db):
    """Content360 aceptó trabajar sin filtro de IP: con la lista vacía el
    callback firmado pasa desde cualquier origen (a diferencia de Atomic)."""
    r = pedir(api, "debit", debit(1.0), ip="198.51.100.9")

    assert leer(r)["code"] == 0


def test_con_ip_cargadas_una_ip_ajena_se_corta_aunque_la_firma_sea_buena(api, db):
    api.db_prov["content360"] = proveedor(ips_permitidas=("203.0.113.0/24",))

    fuera = pedir(api, "debit", debit(1.0), ip="198.51.100.9")
    dentro = pedir(api, "debit", debit(1.0, tx="t2"), ip="203.0.113.7")

    assert fuera.status_code == 403 and db.movimientos[0]["ref"] == "content360:t2"
    assert leer(dentro)["code"] == 0


# ── Las URLs que Content360 ya tiene registradas ─────────────────

def test_responden_las_rutas_viejas_de_wallet(api):
    """Riesgo real, no hipotético: esas URLs se le pasaron a Content360 como
    propuesta antes de que existiera este código, ellos las dieron de alta, y
    el código terminó escuchando en otras. Un callback a una ruta que no
    existe es un 404 y una apuesta que nunca se cobra.

    Y ojo con el último: ellos lo llaman `notify`, nosotros `notification`.
    """
    rutas = {r.path for r in api.app.routes if hasattr(r, "path")}
    for ruta in ("/api/wallet/c360/balance", "/api/wallet/c360/debit",
                 "/api/wallet/c360/credit", "/api/wallet/c360/notify"):
        assert ruta in rutas, f"falta {ruta}"


def test_las_rutas_nuevas_siguen_estando(api):
    """El alias no reemplaza: las dos formas tienen que convivir mientras
    Content360 no migre."""
    rutas = {r.path for r in api.app.routes if hasattr(r, "path")}
    assert "/api/slots/content360/balance" in rutas
    assert "/api/slots/content360/{codigo}/debit" in rutas
