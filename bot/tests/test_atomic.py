"""La parte de Atomic que no toca base ni red: el dinero, el sobre de
respuesta, cómo se lee un pedido y qué le mandamos a Atomic.

Cada prueba nombra el riesgo que cuida. El de las unidades es el más caro y
el más silencioso: un error de centavos no rompe nada, paga mal.
"""

import json
from decimal import Decimal

import pytest

import atomic
from atomic import (MontoInvalido, a_centavos, a_texto_decimal,
                    cuerpo_respuesta, interpretar)


# ── Dinero ─────────────────────────────────────────────────────

@pytest.mark.parametrize("valor,centavos", [
    (Decimal("10.07"), 1007),   # el caso que rompe el float: 10.07*100=1006.99..
    (Decimal("0.01"), 1),       # el mínimo
    (Decimal("0.1"), 10),
    (Decimal("0"), 0),
    (Decimal("123456789.99"), 12345678999),  # un monto grande
    ("10.07", 1007),
    (10.07, 1007),              # ya parseado como float: pasa por su texto
    (5, 500),
])
def test_la_conversion_a_centavos_es_exacta(valor, centavos):
    """Riesgo: `int(10.07 * 100)` da 1006 y el jugador cobra un centavo menos
    en cada ronda de ese importe, sin que nada falle a la vista."""
    assert a_centavos(valor) == centavos


@pytest.mark.parametrize("texto,ingenuo,correcto", [
    ("4.35", 434, 435), ("1.15", 114, 115), ("0.29", 28, 29),
])
def test_el_float_ingenuo_falla_con_estos_importes(texto, ingenuo, correcto):
    """Documenta por qué existe `a_centavos`. OJO: con 10.07, el ejemplo que
    citan el panel y el pedido, `int(10.07 * 100)` da 1007 en doble precisión
    (se verificó); el error real aparece con importes como estos."""
    assert int(float(texto) * 100) == ingenuo
    assert a_centavos(Decimal(texto)) == correcto


def test_el_json_del_pedido_se_lee_sin_perder_decimales():
    """Riesgo: leer el cuerpo con float y convertir después es tarde, el
    error ya está hecho. Se lee con `parse_float=Decimal`."""
    cuerpo = json.loads('{"amount": 10.07, "big": 999999999999.99}',
                        parse_float=Decimal)
    assert a_centavos(cuerpo["amount"]) == 1007
    assert a_centavos(cuerpo["big"]) == 99999999999999


@pytest.mark.parametrize("valor,centavos", [
    (Decimal("0.005"), 1),      # medio centavo: hacia arriba, no hacia el par
    (Decimal("0.004"), 0),
    (Decimal("2.675"), 268),    # el clásico que el float redondea a 2.67
])
def test_el_redondeo_es_medio_centavo_hacia_arriba(valor, centavos):
    assert a_centavos(valor) == centavos


@pytest.mark.parametrize("malo", [None, True, "", "abc", "NaN", "Infinity",
                                  "-1", Decimal("-0.01"), "1e99"])
def test_un_importe_roto_se_rechaza_no_se_interpreta(malo):
    """Riesgo: tratar un importe ilegible como 0 acredita o cobra mal sin
    dejar rastro."""
    with pytest.raises(MontoInvalido):
        a_centavos(malo)


@pytest.mark.parametrize("centavos,texto", [
    (1007, "10.07"), (1, "0.01"), (0, "0.00"), (100, "1.00"),
    (99999999999999, "999999999999.99"),
])
def test_de_centavos_a_texto_decimal_es_exacto(centavos, texto):
    assert a_texto_decimal(centavos) == texto


@pytest.mark.parametrize("centavos", [1007, 1, 0, 12345678999,
                                      99999999999999, 10**14])
def test_ida_y_vuelta_no_cambia_el_monto(centavos):
    """Riesgo: convertir de entrada y de salida con reglas distintas hace
    que el saldo que ve el jugador no sea el que tenemos."""
    assert a_centavos(a_texto_decimal(centavos)) == centavos


# ── El sobre de respuesta ──────────────────────────────────────

def test_respuesta_ok_tiene_la_forma_documentada():
    dato = json.loads(cuerpo_respuesta(1007, "ars"))
    assert dato == {"status": "ok", "balance": 10.07, "currency": "ARS"}


def test_el_saldo_sale_como_numero_json_no_como_texto():
    """Riesgo: un balance entre comillas lo lee mal el juego."""
    crudo = cuerpo_respuesta(1007, "ARS")
    assert '"balance":10.07' in crudo


def test_un_saldo_grande_no_sale_en_notacion_cientifica():
    """Riesgo: float imprime 1e+16 y Atomic lee un saldo distinto."""
    crudo = cuerpo_respuesta(10**17, "ARS")
    assert "e" not in crudo.split('"balance":')[1].split(",")[0].lower()


def test_el_error_de_fondos_tiene_la_forma_documentada():
    dato = json.loads(cuerpo_respuesta(50, "ARS", atomic.SALDO_INSUFICIENTE))
    assert dato == {"status": "error", "message": "INSUFFICIENT_FUNDS",
                    "balance": 0.5, "currency": "ARS"}


def test_solo_saldo_insuficiente_es_un_error_documentado():
    """Riesgo: creer que los demás strings son parte del contrato. Son
    nuestros y Atomic no los conoce."""
    assert atomic.SALDO_INSUFICIENTE not in atomic.ERRORES_PROPIOS
    assert atomic.ERRORES_PROPIOS.isdisjoint({atomic.SALDO_INSUFICIENTE})


# ── Qué método mueve plata ─────────────────────────────────────

@pytest.mark.parametrize("metodo,tipo", [("bet", "debito"), ("win", "credito")])
def test_bet_y_win_son_los_unicos_movimientos(metodo, tipo):
    assert interpretar({"method": metodo}).tipo == tipo


@pytest.mark.parametrize("metodo", ["round_info", "game_switch", "session_info"])
def test_los_informativos_no_mueven_plata(metodo):
    """Riesgo: tratar `round_info` como movimiento duplica cada apuesta.
    Lo aprendió el panel-multiskin a un costo alto."""
    assert interpretar({"method": metodo}).tipo is None
    assert metodo not in atomic.MUEVEN_PLATA
    assert metodo in atomic.INFORMATIVOS


def test_un_metodo_desconocido_no_esta_en_ninguna_lista():
    assert "rollback" not in atomic.METODOS


def test_se_lee_meta_en_bet_y_win():
    p = interpretar({"method": "win", "api_key": "K", "player_id": "7",
                     "amount": Decimal("1.50"),
                     "meta": {"transaction": " tx-1 ", "round_id": "R1",
                              "session_id": "S1", "symbol": "vs20olympgate",
                              "is_freespins": True}})
    assert (p.transaccion, p.ronda, p.session_id, p.simbolo) == (
        "tx-1", "R1", "S1", "vs20olympgate")
    assert p.es_freespin is True


def test_is_freespins_como_texto_falso_no_cuenta_como_verdadero():
    """Riesgo: `bool("false")` es True y un win normal se marcaría promo."""
    p = interpretar({"method": "win", "meta": {"is_freespins": "false"}})
    assert p.es_freespin is False


def test_session_info_trae_la_sesion_a_nivel_superior():
    p = interpretar({"method": "session_info", "session_id": "S9"})
    assert p.session_id == "S9" and p.transaccion is None


def test_meta_que_no_es_un_objeto_no_rompe():
    assert interpretar({"method": "bet", "meta": "basura"}).transaccion is None


@pytest.mark.parametrize("texto,esperado", [
    ("7", 7), ("123456", 123456), ("juan", None), ("", None), (None, None),
    ("-3", None), ("7.5", None), ("９", None),  # dígito de ancho completo
    ("9" * 30, None),
])
def test_el_jugador_es_solo_el_id_interno(texto, esperado):
    """Riesgo: aceptar el username abre un segundo camino de identidad,
    justo el que se decidió no usar."""
    assert atomic.jugador_id_de(texto) == esperado


# ── round_info: qué se compara al cerrar ───────────────────────

def test_ronda_que_cuadra_no_avisa():
    info = atomic.leer_ronda({"status": "finish", "bet_amount": "1.00",
                              "win_amount": "2.50"})
    assert atomic.ronda_que_no_cuadra(info, 100, 250) is None


def test_ronda_con_premio_sin_acreditar_avisa():
    """El caso que un humano tiene que encontrar: Atomic dice que pagó y
    nosotros no acreditamos."""
    info = atomic.leer_ronda({"status": "finish", "bet_amount": "1.00",
                              "win_amount": "2.50"})
    motivo = atomic.ronda_que_no_cuadra(info, 100, 0)
    assert "premio" in motivo and "250" in motivo


def test_ronda_abierta_no_se_compara():
    info = atomic.leer_ronda({"status": "start", "bet_amount": "1.00"})
    assert atomic.ronda_que_no_cuadra(info, 0, 0) is None


def test_ronda_de_giro_gratis_no_espera_apuesta():
    """Los giros gratis no tienen apuesta contra nuestro saldo."""
    info = atomic.leer_ronda({"status": "finish", "bet_amount": "1.00",
                              "bet_type": "freespin", "win_amount": "3.00"})
    assert atomic.ronda_que_no_cuadra(info, 0, 300) is None


def test_un_importe_roto_en_round_info_no_falla():
    info = atomic.leer_ronda({"status": "finish", "win_amount": "x"})
    assert info.premio_centavos is None


# ── Lo que le mandamos a Atomic ────────────────────────────────

def test_el_lanzamiento_manda_idioma_y_el_id_interno():
    p = atomic.payload_lanzamiento(
        partner="P1", api_key="K", simbolo="vs20olympgate", estudio="pragmatic",
        moneda="ars", jugador_id=42, idioma=None)
    assert p["lang"] == "es", "sin lang, Atomic abre el juego en ruso"
    assert p["player_id"] == "42"
    assert p["currency"] == "ARS"
    assert p["gametype"] == "real"
    assert "freespins" not in p


@pytest.mark.parametrize("entrada,esperado", [
    (None, "es"), ("", "es"), ("es-AR", "es"), ("EN", "en"), ("1", "es"),
    ("  pt ", "pt"),
])
def test_idioma(entrada, esperado):
    assert atomic.idioma_de(entrada) == esperado


def test_demo_y_giros_gratis_viajan_si_se_piden():
    p = atomic.payload_lanzamiento(
        partner="P", api_key="K", simbolo="s", estudio="e", moneda="COP",
        jugador_id=1, idioma="es", demo=True, freespins={"count": 5})
    assert p["gametype"] == "demo" and p["freespins"] == {"count": 5}


def test_el_catalogo_lee_el_provider_code_anidado():
    juegos = atomic.extraer_juegos({"slots": [
        {"symbol": "vs20olympgate", "name": "Gates of Olympus",
         "provider_code": {"provider_code": "Pragmatic Play"},
         "rtp": "96.5", "imageurl": "http://i/1.png", "status": 1},
        {"symbol": "hk1", "name": "Hack", "rtp": "",
         "provider_code": {"provider_name": "Hacksaw-Gaming"}},
    ]})
    assert [j.simbolo for j in juegos] == ["vs20olympgate", "hk1"]
    assert juegos[0].estudio == "pragmaticplay"
    assert juegos[1].estudio == "hacksawgaming"
    assert juegos[0].rtp == 96.5 and juegos[1].rtp is None
    assert juegos[0].imagen == "http://i/1.png"


def test_el_catalogo_descarta_los_deshabilitados_y_los_sin_simbolo():
    """Riesgo: ofrecer un juego que Atomic no puede abrir."""
    juegos = atomic.extraer_juegos({"slots": [
        {"symbol": "a", "status": False},
        {"symbol": "b", "status": "0"},
        {"name": "sin símbolo"},
        "basura",
        {"symbol": "c"},
    ]})
    assert [j.simbolo for j in juegos] == ["c"]


@pytest.mark.parametrize("basura", [None, [], "x", {"games": []}, {"slots": "x"}])
def test_un_catalogo_irreconocible_da_lista_vacia(basura):
    assert atomic.extraer_juegos(basura) == []


def test_giros_gratis_solo_con_metodos_conocidos():
    ok = atomic.payload_accion("freespins_set", partner="P", api_key="K",
                               count=5, amount="0.50")
    assert ok["method"] == "freespins_set" and ok["amount"] == "0.50"
    with pytest.raises(ValueError):
        atomic.payload_accion("freespins_add", partner="P", api_key="K")


@pytest.mark.parametrize("http,texto,ok,desconocido", [
    (200, '{"status":"ok"}', True, False),
    (200, '{"status":"error","message":"X"}', False, False),
    (404, "", False, False),                 # rechazo: no cambió nada
    (503, "", False, True),                  # pudo haberse aplicado
    (200, "<html>", False, True),
    (None, "", False, True),                 # timeout
])
def test_una_accion_fallida_dice_si_pudo_aplicarse(http, texto, ok, desconocido):
    """Riesgo: `freespins_set` reemplaza; reintentar a ciegas tras un
    resultado desconocido puede pisar giros vivos."""
    r = atomic.clasificar_accion(http, texto)
    assert (r.ok, r.desconocido) == (ok, desconocido)
