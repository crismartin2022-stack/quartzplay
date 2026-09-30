"""Content360, la parte pura: la firma, el dinero, el sobre de respuesta, qué
hace cada tipo de movimiento, el lanzamiento y la lectura del catálogo.

Nada de esto se probó contra un Content360 real (todavía no hay credenciales):
se verifica la lógica y que la firma documentada se calcula como la documentan.
Que sea la que mandan en la práctica es justo lo que NO se sabe, y por eso
hay una prueba de que se pueden agregar otras formas.
"""

import hashlib
import hmac
import json
from decimal import Decimal

import pytest

import content360 as c


CLAVE = "CLAVE-SECRETA-DE-CONTENT360"


def firma(cadena, clave=CLAVE):
    """Calculada acá a mano, sin pasar por el módulo: si las dos coinciden no
    es un espejo."""
    return hmac.new(clave.encode(), cadena.encode(), hashlib.sha256).hexdigest()


def post(cuerpo_texto):
    f, err = c.firmable_de("POST", cuerpo_texto.encode(), "")
    assert err is None
    return f


def get(consulta):
    f, err = c.firmable_de("GET", b"", consulta)
    assert err is None
    return f


# ── La firma ───────────────────────────────────────────────────

def test_un_post_se_firma_sobre_el_json_ordenado_y_compacto_como_documentan():
    """Riesgo: rechazar el callback legítimo. Su documentación: claves
    ordenadas y JSON sin espacios. Las barras van escapadas porque el
    `json_encode` de PHP lo hace salvo que se le pida lo contrario."""
    cuerpo = ('{"user":"7","action":"debit","amount":10.07,"round":"R1",'
              '"game":"a/b","transaction":"T1"}')
    canonico = ('{"action":"debit","amount":10.07,"game":"a\\/b","round":"R1",'
                '"transaction":"T1","user":"7"}')

    r = c.validar_firma(post(cuerpo), firma(canonico), CLAVE)

    assert r.ok
    assert r.variante == "json:orden=1,unicode=crudo,barras=esc,num=tal_cual"


def test_un_get_se_firma_como_consulta_ordenada():
    consulta = "user=7&currency=ARS&action=balance&session_token=S1"
    canonico = "action=balance&currency=ARS&session_token=S1&user=7"

    r = c.validar_firma(get(consulta), firma(canonico), CLAVE)

    assert r.ok and r.variante == "query:orden=1"


def test_una_firma_equivocada_no_pasa():
    """Riesgo: aceptar un callback que cualquiera puede mandar a una URL
    pública y acreditarse plata."""
    f = post('{"action":"credit","amount":1000,"user":"7","transaction":"T9"}')

    assert not c.validar_firma(f, firma("otra cosa"), CLAVE).ok
    assert not c.validar_firma(f, "", CLAVE).ok
    assert not c.validar_firma(f, None, CLAVE).ok
    # La firma correcta con OTRA clave tampoco.
    canonico = '{"action":"credit","amount":1000,"transaction":"T9","user":"7"}'
    assert not c.validar_firma(f, firma(canonico, "otra-clave"), CLAVE).ok


def test_sin_clave_configurada_nada_pasa():
    """Riesgo: una fila sin clave que acepte cualquier firma (HMAC con clave
    vacía es calculable por cualquiera)."""
    f = post('{"action":"debit","user":"7"}')
    vacia = hmac.new(b"", b'{"action":"debit","user":"7"}',
                     hashlib.sha256).hexdigest()

    assert not c.validar_firma(f, vacia, "").ok


def test_la_firma_es_insensible_a_mayusculas_porque_el_hex_no_las_distingue():
    canonico = '{"action":"debit","user":"7"}'
    f = post('{"user":"7","action":"debit"}')

    assert c.validar_firma(f, firma(canonico).upper(), CLAVE).ok


def test_la_firma_sobre_el_cuerpo_tal_como_llego_tambien_se_acepta():
    """Riesgo central: su firma real no coincide con su documentación. Si
    firman el cuerpo que mandan, con sus espacios y su orden, eso tiene que
    pasar, y quedar registrado cuál fue la forma."""
    crudo = '{ "user": "7",  "action": "debit", "amount": 5 }'

    r = c.validar_firma(post(crudo), firma(crudo), CLAVE)

    assert r.ok and r.variante == "cuerpo_crudo"


def test_un_get_firmado_como_json_ordenado_tambien_pasa():
    """Es lo que el panel observó en sus callbacks reales aunque Content360
    insista en que el GET va como consulta."""
    canonico = '{"action":"balance","currency":"ARS","user":"7"}'

    r = c.validar_firma(get("user=7&action=balance&currency=ARS"),
                        firma(canonico), CLAVE)

    assert r.ok and r.variante.startswith("json:orden=1")


def test_se_puede_agregar_una_canonicalizacion_nueva_sin_tocar_el_validador():
    """Riesgo: descubrir con tráfico real una forma que nadie previó y tener
    que reescribir el validador. Agregar una es una función y una línea."""
    f = post('{"action":"debit","user":"7","amount":5}')
    rara = ("valores con guion bajo",
            lambda fm: "_".join(str(v) for _, v in sorted(fm.datos.items())))
    firmada = firma("debit_5_7")

    assert not c.validar_firma(f, firmada, CLAVE).ok
    r = c.validar_firma(f, firmada, CLAVE, registro=c.CANONICALIZACIONES + [rara])
    assert r.ok and r.variante == "valores con guion bajo"


def test_una_canonicalizacion_rota_no_tumba_a_las_demas():
    canonico = '{"action":"debit","user":"7"}'

    def rota(_):
        raise RuntimeError("bug")

    registro = [("rota", rota)] + c.CANONICALIZACIONES
    assert c.validar_firma(post(canonico), firma(canonico), CLAVE, registro).ok


def test_un_rechazo_deja_con_que_diagnosticar_y_no_expone_firmas_completas():
    """Riesgo: rechazar sin poder saber qué forma mandaron. El log necesita la
    firma recibida, el cuerpo y qué se calculó; los HMAC calculados salen
    truncados porque completos serían firmas reusables."""
    f = post('{"action":"debit","user":"7"}')
    recibida = firma("ninguna de las formas")
    r = c.validar_firma(f, recibida, CLAVE)

    linea = c.diagnostico_firma(f, recibida, r)

    assert not r.ok and len(r.probadas) >= 4
    assert recibida in linea and '"action":"debit"' in linea
    assert "json:orden=1" in linea
    completos = [firma(cadena) for cadena in
                 ['{"action":"debit","user":"7"}']]
    assert not any(h in linea for h in completos)
    assert CLAVE not in linea


def test_la_forma_documentada_se_prueba_primero_segun_el_metodo():
    """Las dos que tienen que acertar van primero: no se pagan veinte HMAC
    por apuesta."""
    assert c.canonicalizaciones_para(get("a=1"))[0][0] == "query:orden=1"
    assert c.canonicalizaciones_para(post('{"a":1}'))[0][0].startswith("json:")


def test_un_cuerpo_que_no_es_json_no_es_firmable():
    f, err = c.firmable_de("POST", b"no es json", "")
    assert err and f.datos == {}
    f, err = c.firmable_de("POST", b"[1,2]", "")
    assert err


# ── Las piezas de la canonicalización, contra lo que hace PHP ──

def test_http_build_query_se_comporta_como_el_de_php():
    """Riesgo: firmar el lanzamiento con una codificación distinta. Esperados
    tomados del comportamiento de PHP: espacio como '+', tilde codificada,
    booleanos como 1/0, nulos omitidos."""
    datos = {"b": "x y", "a": True, "f": False, "n": None, "t": "~",
             "u": "a&b=c", "e": "é"}

    assert c.construir_consulta(datos) == \
        "a=1&b=x+y&e=%C3%A9&f=0&t=%7E&u=a%26b%3Dc"


def test_http_build_query_anida_como_php():
    assert c.construir_consulta({"extra": {"k": "v", "z": [1, 2]}}) == \
        "extra%5Bk%5D=v&extra%5Bz%5D%5B0%5D=1&extra%5Bz%5D%5B1%5D=2"


def test_json_php_escapa_barras_y_ordena_y_no_pone_espacios():
    assert c.json_php({"b": 1, "a": "x/y"}) == '{"a":"x\\/y","b":1}'
    assert c.json_php({"a": "x/y"}, barras_escapadas=False) == '{"a":"x/y"}'
    assert c.json_php({"b": 1, "a": 2}, ordenar=False) == '{"b":1,"a":2}'


def test_json_php_unicode_y_arreglo_vacio():
    assert c.json_php({"n": "Señor"}) == '{"n":"Señor"}'
    assert c.json_php({"n": "Señor"}, unicode_crudo=False) == '{"n":"Se\\u00f1or"}'
    # Un arreglo vacío de PHP se serializa como lista.
    assert c.json_php({"extra": {}}) == '{"extra":[]}'


def test_json_php_conserva_los_decimales_exactos():
    f = post('{"amount":10.50,"x":0.1}')
    assert c.json_php(f.datos) == '{"amount":10.50,"x":0.1}'
    assert c.json_php(f.datos, numeros="php") == '{"amount":10.5,"x":0.1}'
    assert c.json_php(post('{"a":10.0}').datos, numeros="php") == '{"a":10.0}'


# ── El dinero ──────────────────────────────────────────────────

@pytest.mark.parametrize("texto,centavos", [
    ("4.35", 435), ("1.15", 115), ("0.29", 29), ("10.07", 1007),
    ("0.01", 1), ("0", 0), ("1234567.89", 123456789),
])
def test_los_importes_que_rompen_el_float_se_convierten_exactos(texto, centavos):
    """Riesgo: pagar un centavo de menos. `int(4.35 * 100)` da 434, y eso no
    falla: paga mal y se descubre cuando alguien cobra. El cuerpo se lee con
    Decimal, como hace el endpoint."""
    leido = json.loads(f'{{"amount":{texto}}}', parse_float=Decimal)["amount"]

    assert c.a_centavos(leido) == centavos


def test_el_float_de_python_efectivamente_falla_en_estos_casos():
    """Documenta POR QUÉ existe el Decimal: si alguna vez esto deja de ser
    cierto, la prueba de arriba dejó de demostrar algo."""
    assert int(4.35 * 100) == 434
    assert int(1.15 * 100) == 114
    assert int(0.29 * 100) == 28


def test_un_importe_invalido_se_rechaza():
    for malo in (None, "abc", "-1", float("nan"), True, "1e999999"):
        with pytest.raises(c.MontoInvalido):
            c.a_centavos(malo)


# ── El sobre de respuesta ──────────────────────────────────────

def test_el_saldo_sale_como_numero_json_exacto():
    cuerpo = c.cuerpo_respuesta(c.OK, centavos=1007, transaccion="content360:T1")

    assert '"balance":10.07' in cuerpo
    assert json.loads(cuerpo) == {
        "code": 0, "description": "Success",
        "data": {"balance": 10.07, "transaction": "content360:T1"}}


def test_las_respuestas_de_error_llevan_el_codigo_y_opcionalmente_el_saldo():
    assert json.loads(c.cuerpo_respuesta(c.FIRMA_INVALIDA)) == {
        "code": 4, "description": "Invalid signature"}
    assert json.loads(c.cuerpo_respuesta(c.SALDO_INSUFICIENTE, centavos=500)) == {
        "code": 1, "description": "Insufficient balance",
        "data": {"balance": 5.0}}


def test_los_codigos_son_los_documentados():
    assert (c.OK, c.SALDO_INSUFICIENTE, c.JUGADOR_INEXISTENTE, c.NO_PROCESABLE,
            c.FIRMA_INVALIDA, c.ERROR_INTERNO) == (0, 1, 2, 3, 4, 99)


# ── Qué hace cada tipo ─────────────────────────────────────────

def pedido(accion, cuerpo):
    p, err = c.interpretar(accion, cuerpo)
    assert err is None
    return p


def test_la_direccion_del_dinero_sale_del_endpoint_y_el_tipo_dice_que_es():
    assert pedido("debit", {"type": "bet"}).efecto.signo == -1
    assert pedido("credit", {"type": "win"}).efecto.signo == 1
    # Sin `type`: bet en debit, win en credit (como hace el panel).
    assert pedido("debit", {}).tipo == "bet"
    assert pedido("credit", {}).tipo == "win"


def test_un_tipo_en_el_endpoint_equivocado_no_se_aplica():
    """Riesgo: un `win` por el endpoint de débito cobraría un premio en lugar
    de pagarlo. Lo que no está en la tabla no se aplica: no hay un signo
    que se pueda suponer sin arriesgar plata."""
    assert pedido("debit", {"type": "win"}).efecto is None
    assert pedido("credit", {"type": "bet"}).efecto is None
    assert pedido("credit", {"type": "inventado"}).efecto is None


def test_un_action_del_cuerpo_que_contradice_el_endpoint_se_rechaza():
    p, err = c.interpretar("debit", {"action": "credit", "type": "win"})
    assert p is None and err
    assert c.interpretar("debit", {"action": "DEBIT"})[1] is None


def test_todos_los_tipos_documentados_tienen_efecto():
    credito = ["win", "free_spins", "jackpot", "tournament", "rollback",
               "refund", "conciliation"]
    debito = ["bet", "purchase", "rollback", "tournament", "conciliation"]
    for t in credito:
        assert pedido("credit", {"type": t}).efecto is not None, t
    for t in debito:
        assert pedido("debit", {"type": t}).efecto is not None, t


def test_la_conciliacion_se_aplica_sin_exigir_saldo():
    """Riesgo: rechazar una apuesta que ellos dieron por hecha. Su
    documentación: se procesa incondicionalmente."""
    assert pedido("debit", {"type": "conciliation"}).efecto.exige_saldo is False
    assert pedido("debit", {"type": "bet"}).efecto.exige_saldo is True


def test_el_rollback_de_una_apuesta_es_una_devolucion_y_el_de_un_premio_lo_resta():
    devolucion = pedido("credit", {"type": "rollback"}).efecto
    anulacion = pedido("debit", {"type": "rollback"}).efecto

    assert (devolucion.tipo, devolucion.signo, devolucion.revierte) == \
        ("devolucion", 1, "debito")
    assert (anulacion.tipo, anulacion.signo, anulacion.revierte) == \
        ("anulacion_premio", -1, "credito")


def test_solo_las_acciones_que_empiezan_valor_se_bloquean():
    """Un jugador bloqueado no apuesta pero cobra lo que ya ganó."""
    assert pedido("debit", {"type": "bet"}).efecto.bloqueable
    assert not pedido("credit", {"type": "win"}).efecto.bloqueable
    assert not pedido("credit", {"type": "refund"}).efecto.bloqueable


def test_el_asiento_de_reportes_cuadra_con_el_saldo():
    """El GGR es apuesta - premio. Una devolución resta apuesta y un premio
    anulado resta premio; así el reporte cuadra sin tocar sus consultas."""
    e = lambda accion, tipo: c.EFECTOS[(accion, tipo)]

    assert c.asiento(e("debit", "bet"), 500) == (500, 0)
    assert c.asiento(e("credit", "win"), 900) == (0, 900)
    assert c.asiento(e("credit", "refund"), 500) == (-500, 0)
    assert c.asiento(e("debit", "rollback"), 900) == (0, -900)
    # Apuesta 500, devuelta entera: GGR neto 0.
    neto = sum(s - w for s, w in (c.asiento(e("debit", "bet"), 500),
                                  c.asiento(e("credit", "refund"), 500)))
    assert neto == 0


# ── El rollback ────────────────────────────────────────────────

def test_un_rollback_de_una_ronda_sin_movimientos_no_se_puede_procesar():
    """Riesgo: aceptar revertir lo que nunca nos llegó, que acreditaría plata
    de la nada. Es el código 3 que documentan."""
    refund = c.EFECTOS[("credit", "rollback")]

    assert c.rollback_permitido(refund, 500, {}) is not None
    assert c.rollback_permitido(refund, 500, {"credito": 900}) is not None


def test_un_rollback_dentro_de_lo_apostado_pasa():
    refund = c.EFECTOS[("credit", "rollback")]
    assert c.rollback_permitido(refund, 500, {"debito": 500}) is None


def test_dos_rollbacks_con_transaction_distinta_no_devuelven_dos_veces():
    """Riesgo: la idempotencia por `transaction` no ve el segundo rollback
    como repetido; el tope por ronda sí."""
    refund = c.EFECTOS[("credit", "rollback")]

    assert c.rollback_permitido(refund, 500, {"debito": 500,
                                              "devolucion": 500}) is not None
    # Dos apuestas de 500 en la misma ronda: se pueden devolver las dos.
    assert c.rollback_permitido(refund, 500, {"debito": 1000,
                                              "devolucion": 500}) is None


def test_anular_un_premio_no_puede_pasar_de_lo_pagado():
    void = c.EFECTOS[("debit", "rollback")]
    assert c.rollback_permitido(void, 900, {"credito": 900}) is None
    assert c.rollback_permitido(void, 901, {"credito": 900}) is not None
    assert c.rollback_permitido(void, 100, {"credito": 900,
                                            "anulacion_premio": 850}) is not None


def test_lo_que_no_revierte_nada_siempre_pasa():
    assert c.rollback_permitido(c.EFECTOS[("debit", "bet")], 500, {}) is None


# ── Identidad y contexto ───────────────────────────────────────

def test_el_jugador_es_el_id_interno_y_nunca_el_username():
    assert c.jugador_id_de("42") == 42
    for malo in ("juanito", "", None, "4 2", "-4", "١٢", "9" * 30):
        assert c.jugador_id_de(malo) is None


def test_el_contexto_se_rechaza_por_moneda_y_por_sesion_ajena():
    """Riesgo: devolver pesos que el otro lado lee como otra moneda."""
    fila = {"id": 7, "moneda": "ARS", "ses_user": 7}

    assert c.validar_contexto(None, fila, ("ARS",)) is None
    assert c.validar_contexto("ARS", fila, ("ARS",)) is None
    assert c.validar_contexto("EUR", fila, ("ARS",)) is not None
    assert c.validar_contexto(None, fila, ("COP",)) is not None
    assert c.validar_contexto(None, {**fila, "ses_user": 8}, ("ARS",)) is not None
    # Sesión desconocida: se acepta, para no quitarle un premio al jugador.
    assert c.validar_contexto(None, {**fila, "ses_user": None}, ("ARS",)) is None
    assert c.validar_contexto(None, None, ("ARS",)) == "jugador"


# ── El lanzamiento ─────────────────────────────────────────────

def lanzamiento(**cambios):
    datos = dict(juego="1234", client_id="69", sesion="sTOKEN", usuario_id=42,
                 username="juanito", moneda="ars", idioma=None)
    datos.update(cambios)
    return c.consulta_lanzamiento(**datos)


def test_el_lanzamiento_manda_el_id_interno_el_idioma_y_demo_como_uno_o_cero():
    """Riesgos: el username en `user` (puede cambiar y deja rondas huérfanas)
    y un booleano escrito distinto al firmar y al enviar."""
    q = lanzamiento()

    assert q["user"] == "42" and q["username"] == "juanito"
    assert q["language"] == "es_ES" and q["currency"] == "ARS"
    assert q["game"] == 1234 and q["client_id"] == 69
    assert q["demo"] == "0"
    assert lanzamiento(demo=True)["demo"] == "1"
    assert "return_url" not in q


def test_el_username_se_recorta_a_treinta():
    """Más largo lo rechazan con 422."""
    assert len(lanzamiento(username="x" * 80)["username"]) == 30


def test_un_juego_que_no_es_entero_no_se_lanza():
    with pytest.raises(ValueError):
        lanzamiento(juego="slot-abc")


def test_el_lanzamiento_se_firma_sobre_la_consulta_exacta_que_se_envia():
    q = lanzamiento(return_url="https://app.example/casino?x=1&y=2")

    consulta, hmac_hex = c.consulta_firmada(q, CLAVE)

    assert hmac_hex == firma(consulta)
    # Ordenada y codificada como http_build_query.
    assert consulta.startswith("client_id=69&currency=ARS&demo=0&game=1234&")
    assert "return_url=https%3A%2F%2Fapp.example%2Fcasino%3Fx%3D1%26y%3D2" in consulta


def test_idioma_y_url_de_retorno():
    assert c.idioma_de("en") == "en_US" and c.idioma_de("pt-BR") == "pt_BR"
    assert c.idioma_de("xx") == "es_ES" and c.idioma_de("") == "es_ES"
    assert c.url_de_retorno("https://a.example/x") == "https://a.example/x"
    assert c.url_de_retorno("javascript:alert(1)") is None
    assert c.url_de_retorno("//evil.example") is None
    assert c.url_de_retorno("https://a.example/" + "x" * 600) is None


# ── El catálogo y lo que es "en vivo" ──────────────────────────

def catalogo_de(marcas):
    return {"status": "OK", "data": {"brands": marcas}}


def test_en_vivo_se_decide_por_igualdad_de_categoria_y_no_por_subcadena():
    """Riesgo: una mesa en vivo escondida entre los slots (o un slot en la
    pestaña en vivo) por adivinar con palabras. 'live' dentro de 'alive' o
    'deliver' no es en vivo."""
    assert c.es_vivo(["Live Casino"])
    assert c.es_vivo(["live-casino"]) and c.es_vivo(["LIVE_CASINO"])
    assert c.es_vivo(["slots", "Live"])
    assert not c.es_vivo(["slots"]) and not c.es_vivo([])
    assert not c.es_vivo(["alive"]) and not c.es_vivo(["deliver"])
    assert not c.es_vivo(["live slots"])   # no es una categoría en vivo conocida


def test_las_categorias_pueden_venir_como_objetos_o_texto():
    assert c.es_vivo([{"name": "Live"}]) and c.es_vivo("live")
    assert c.categorias_de([{"slug": "live_casino"}, None, "  "]) == ["live casino"]


def test_el_tipo_de_la_marca_tambien_cuenta():
    assert c.es_vivo([], tipo_marca="Live")
    assert not c.es_vivo([], tipo_marca="slots")


def test_la_lista_de_categorias_en_vivo_se_puede_cambiar():
    """Riesgo: no saber qué palabra usa Content360. Se cambia sin tocar código."""
    assert not c.es_vivo(["mesa"])
    assert c.es_vivo(["mesa"], vivas=frozenset({"mesa"}))


def test_el_catalogo_se_lee_de_marcas_y_juegos_y_cuenta_las_categorias():
    datos = catalogo_de([
        {"brand_name": "Evolution Gaming", "brand_type": "Live", "brand_games": [
            {"id": 101, "name": "Ruleta", "image": "http://i/1.png"},
            {"id": 102, "name": "Blackjack", "categories": ["Live", "Cards"]}]},
        {"brand_name": "Pragmatic-Play", "brand_type": "slots", "brand_games": [
            {"id": 201, "name": "Gates", "categories": ["slots"], "status": 0},
            {"name": "sin id"}]},
    ])

    cat = c.extraer_juegos(datos)

    por_id = {j.id: j for j in cat.juegos}
    assert sorted(por_id) == ["101", "102", "201"]
    assert por_id["101"].es_vivo, "la marca es Live y el juego no trae categorías"
    assert por_id["102"].es_vivo and por_id["101"].marca == "evolutiongaming"
    assert not por_id["201"].es_vivo and por_id["201"].marca == "pragmaticplay"
    assert por_id["201"].activo is False and por_id["101"].activo is True
    assert cat.categorias["live"] == 1 and cat.tipos_marca["live"] == 1


def test_un_catalogo_que_no_se_reconoce_da_vacio_y_no_inventa():
    for raro in (None, [], {}, {"data": {"brands": "x"}}, {"games": [1]}):
        assert c.extraer_juegos(raro).juegos == []


# ── notification ───────────────────────────────────────────────

def test_notification_es_un_juego_del_catalogo():
    j = c.juego_de_notificacion({
        "action": "notification", "id": 555, "name": "Roulette Live",
        "image": "http://i/5.png", "brand_id": 9, "status": 1,
        "categories": ["Live Casino"]})

    assert (j.id, j.titulo, j.es_vivo, j.activo) == ("555", "Roulette Live", True, True)
    assert j.marca is None, "brand_id es un número: no se inventa un nombre"


def test_notification_con_status_cero_apaga_el_juego_y_sin_id_no_es_nada():
    assert c.juego_de_notificacion({"id": 1, "status": 0}).activo is False
    assert c.juego_de_notificacion({"name": "sin id"}) is None
