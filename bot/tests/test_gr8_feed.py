"""El consumidor del feed de GR8, probado sin broker.

Cada prueba nombra el riesgo que cubre. Lo que NO se probó acá es la
conexión real: las credenciales de GR8 son del dueño y se están rotando.
"""

import asyncio
import json

import pytest

import gr8_feed
from gr8_feed import (
    COLAS_BASE,
    Config,
    EscrituraFallida,
    Gr8NoConfigurado,
    Lote,
    Muestreo,
    Recolector,
    config_del_entorno,
    espera_reconexion,
    minuto_de,
    nombres_de_colas,
    recortar_cuerpo,
    sin_secretos,
    url_para_log,
    vaciar,
)

URL = "amqps://iaqp:s3cr3ta@iaqp-prod-feed.gr8-mts.com:5671/integration"


def entorno(**extra):
    base = {"GR8_FEED_URL": URL, "APP_ENV": "production"}
    base.update(extra)
    return base


# --- Configuración -------------------------------------------------------


def test_sin_url_falla_cerrado_y_lo_dice():
    # Riesgo: un consumidor que arranca "bien" sin conectarse a nada y
    # esconde que las cuotas dejaron de llegar.
    with pytest.raises(Gr8NoConfigurado, match="GR8_FEED_URL"):
        config_del_entorno({"APP_ENV": "production"})
    with pytest.raises(Gr8NoConfigurado, match="GR8_FEED_URL"):
        config_del_entorno(entorno(GR8_FEED_URL="   "))


def test_url_sin_tls_se_rechaza():
    # Riesgo: mandar usuario y clave sin cifrar por internet.
    with pytest.raises(Gr8NoConfigurado, match="amqps"):
        config_del_entorno(entorno(GR8_FEED_URL="amqp://u:p@host:5672/integration"))


def test_app_env_ausente_o_raro_no_se_adivina():
    # Riesgo: leer las colas de producción desde staging por un entorno mal puesto.
    with pytest.raises(Gr8NoConfigurado, match="APP_ENV"):
        config_del_entorno({"GR8_FEED_URL": URL})
    with pytest.raises(Gr8NoConfigurado, match="APP_ENV"):
        config_del_entorno(entorno(APP_ENV="dev"))


def test_sufijo_int_solo_en_staging():
    # Riesgo: staging consumiendo las colas reales de producción (y
    # quitándole mensajes), o producción leyendo colas de prueba.
    assert config_del_entorno(entorno(APP_ENV="staging")).sufijo == "-INT"
    assert config_del_entorno(entorno(APP_ENV="production")).sufijo == ""


def test_las_nueve_colas_llevan_el_sufijo_en_staging():
    cfg = config_del_entorno(entorno(APP_ENV="staging"))
    assert len(cfg.colas) == 9
    assert all(c.endswith("-INT") for c in cfg.colas)
    assert cfg.colas[0] == "markets-queue-INT"
    produccion = config_del_entorno(entorno())
    assert produccion.colas == COLAS_BASE


def test_no_se_leen_las_colas_de_apuestas():
    # Riesgo: consumir `bet-*` le saca mensajes a quien sí las atiende.
    assert not any(c.startswith("bet-") for c in COLAS_BASE)


def test_el_sufijo_se_puede_cambiar_por_entorno():
    # El sufijo es configuración, no una constante: GR8 puede cambiar la convención.
    cfg = config_del_entorno(entorno(APP_ENV="staging", GR8_FEED_SUFIJO_COLAS="-TEST"))
    assert cfg.colas[1] == "market-results-queue-TEST"
    assert config_del_entorno(entorno(APP_ENV="staging", GR8_FEED_SUFIJO_COLAS="")).sufijo == ""


@pytest.mark.parametrize("valor", ["0", "-1", "abc", "501"])
def test_prefetch_invalido_se_rechaza(valor):
    # Riesgo: prefetch 0 significa SIN límite en AMQP, que es el auto-ack
    # de hecho contra el que GR8 advierte.
    with pytest.raises(Gr8NoConfigurado, match="PREFETCH"):
        config_del_entorno(entorno(GR8_FEED_PREFETCH=valor))


def test_el_prefetch_siempre_esta_acotado():
    assert 1 <= config_del_entorno(entorno()).prefetch <= gr8_feed.PREFETCH_MAXIMO
    assert config_del_entorno(entorno(GR8_FEED_PREFETCH="20")).prefetch == 20


def test_el_consumidor_nunca_usa_auto_ack():
    # Riesgo: auto-ack carga todo lo pendiente en la RAM del broker de GR8.
    # Se mira el código fuente porque es la única forma de fijar un
    # argumento sin broker contra el cual probarlo.
    from pathlib import Path

    fuente = Path(gr8_feed.__file__).with_name("gr8_consumidor.py").read_text()
    assert "no_ack=False" in fuente
    assert "no_ack=True" not in fuente
    assert "prefetch_count=cfg.prefetch" in fuente


def test_la_url_no_llega_al_registro():
    # Riesgo: la clave de GR8 escrita en los logs de Railway.
    assert "s3cr3ta" not in url_para_log(URL)
    assert url_para_log(URL) == "iaqp-prod-feed.gr8-mts.com:5671/integration"
    error = f"fallo conectando a {URL} con s3cr3ta"
    limpio = sin_secretos(error, URL)
    assert "s3cr3ta" not in limpio and "iaqp:" not in limpio


# --- Reconexión ----------------------------------------------------------


def test_la_espera_crece_y_tiene_tope():
    # Riesgo: martillar al broker caído, o esperar sin límite cuando volvió.
    esperas = [espera_reconexion(i) for i in range(10)]
    assert esperas[:4] == [1.0, 2.0, 4.0, 8.0]
    assert esperas == sorted(esperas)
    assert max(esperas) == gr8_feed.ESPERA_TOPE
    assert espera_reconexion(10_000) == gr8_feed.ESPERA_TOPE


def test_el_azar_solo_acorta_nunca_alarga():
    for i in range(8):
        assert espera_reconexion(i, azar=1.0) <= espera_reconexion(i)
        assert espera_reconexion(i, azar=1.0) >= 0.75 * espera_reconexion(i)


# --- Confirmar después de escribir ---------------------------------------


def _correr(coro):
    return asyncio.run(coro)


def test_se_confirma_despues_de_escribir_nunca_antes():
    # Riesgo: confirmar antes de escribir pierde el mensaje si la base cae
    # entre las dos cosas, y es lo que hace NO sobrevivible un failover.
    eventos = []
    lote = Lote()
    for i in range(3):
        lote.registrar("markets-queue", b"{}", f"m{i}", 1000.0)

    async def escribir(_):
        eventos.append("escribir")

    async def confirmar(m):
        eventos.append(f"ack {m}")

    _correr(vaciar(lote, escribir, confirmar))
    assert eventos == ["escribir", "ack m0", "ack m1", "ack m2"]


def test_si_la_escritura_falla_no_se_confirma_nada():
    # Riesgo: mensajes confirmados que nunca se escribieron.
    confirmados = []
    lote = Lote()
    lote.registrar("markets-queue", b"{}", "m0", 1000.0)

    async def escribir(_):
        raise EscrituraFallida("ConnectionDoesNotExistError")

    async def confirmar(m):
        confirmados.append(m)

    with pytest.raises(EscrituraFallida):
        _correr(vaciar(lote, escribir, confirmar))
    assert confirmados == []


def test_lo_que_llega_mientras_se_escribe_no_se_confirma_sin_escribir():
    # Riesgo: un mensaje que llega durante el `await` a la base y se
    # confirma con el lote anterior sin estar escrito.
    rec = Recolector()
    rec.actual.registrar("markets-queue", b"a", "m0", 1000.0)
    escritos, confirmados = [], []

    async def escribir(lote):
        escritos.extend(lote.pendientes)
        # llega otro mensaje mientras la base trabaja
        rec.actual.registrar("markets-queue", b"b", "m1", 1000.5)

    async def confirmar(m):
        confirmados.append(m)

    _correr(vaciar(rec.tomar(), escribir, confirmar))
    assert escritos == ["m0"]
    assert confirmados == ["m0"]
    assert rec.actual.pendientes == ["m1"]


def test_tras_un_fallo_el_lote_vuelve_con_lo_que_llego_despues():
    # Riesgo: perder la cuenta (o los mensajes pendientes) al reintentar.
    rec = Recolector()
    rec.actual.registrar("markets-queue", b"aaaa", "m0", 1000.0)
    fallido = rec.tomar()
    rec.actual.registrar("markets-queue", b"bb", "m1", 1010.0)
    rec.devolver(fallido)

    assert rec.actual.pendientes == ["m0", "m1"]
    cubo = rec.actual.cubos[("markets-queue", minuto_de(1000.0))]
    assert (cubo.mensajes, cubo.bytes, cubo.bytes_max) == (2, 6, 4)


def test_un_lote_vacio_no_escribe():
    llamadas = []

    async def escribir(_):
        llamadas.append(1)

    async def confirmar(_):
        pass

    _correr(vaciar(Lote(), escribir, confirmar))
    assert llamadas == []


# --- Contabilidad --------------------------------------------------------


def test_los_contadores_agrupan_por_cola_y_minuto():
    lote = Lote()
    lote.registrar("markets-queue", b"x" * 100, "a", 120.0)
    lote.registrar("markets-queue", b"x" * 300, "b", 150.0, reentregado=True)
    lote.registrar("markets-queue", b"x" * 50, "c", 181.0)  # otro minuto
    lote.registrar("scores-queue", b"x" * 10, "d", 125.0)

    m1 = lote.cubos[("markets-queue", minuto_de(120.0))]
    assert (m1.mensajes, m1.bytes, m1.bytes_max, m1.reentregados) == (2, 400, 300, 1)
    assert lote.cubos[("markets-queue", minuto_de(181.0))].mensajes == 1
    assert lote.cubos[("scores-queue", minuto_de(125.0))].bytes == 10
    assert len(lote) == 4


def test_el_minuto_es_el_inicio_en_utc():
    assert minuto_de(125.9).timestamp() == 120
    assert minuto_de(125.9).utcoffset().total_seconds() == 0


def test_la_muestra_se_corta_y_dice_el_tamano_original():
    # Riesgo: guardar cuerpos enteros de un feed continuo.
    grande = b"a" * (gr8_feed.MUESTRA_MAX_BYTES + 500)
    texto, cortado = recortar_cuerpo(grande)
    assert cortado and len(texto) == gr8_feed.MUESTRA_MAX_BYTES
    muestreo = Muestreo(cada=10.0)
    lote = Lote()
    lote.registrar("markets-queue", grande, "m", 1.0, muestreo=muestreo)
    lote.registrar("markets-queue", b"x", "m", 20.0, muestreo=muestreo)
    assert lote.muestras[0].bytes == len(grande) and lote.muestras[0].truncado
    assert len(lote.muestras[0].cuerpo) == gr8_feed.MUESTRA_MAX_BYTES


def test_cortar_un_caracter_a_la_mitad_no_tumba_la_muestra():
    texto, cortado = recortar_cuerpo("ñ".encode() * 10, maximo=5)
    assert cortado and isinstance(texto, str)


def _ventana(m, cola, tamanos, desde=0.0):
    """Ofrece mensajes de esos tamaños dentro de una ventana y cierra con uno
    chico de la siguiente. Devuelve la muestra de la ventana cerrada."""
    for i, t in enumerate(tamanos):
        assert m.ofrecer(cola, desde + i, t, b"a" * t) is None
    return m.ofrecer(cola, desde + m._cada, 1, b"a")


def test_la_ventana_guarda_el_mensaje_mas_grande_no_el_primero():
    m = Muestreo(cada=900.0)
    muestra = _ventana(m, "markets-queue", [10, 50, 30])
    assert muestra.bytes == 50 and muestra.mayor_de_ventana


def test_en_un_empate_se_queda_el_primero():
    m = Muestreo(cada=900.0)
    m.ofrecer("q", 0.0, 5, b"aaaaa")
    m.ofrecer("q", 1.0, 5, b"bbbbb")
    assert m.ofrecer("q", 900.0, 1, b"c").cuerpo == "aaaaa"


def test_no_hay_rafaga_inicial_una_muestra_por_ventana():
    # Riesgo medido: diez muestras con el mismo instante de recepción.
    m = Muestreo(cada=900.0)
    salidas = [m.ofrecer("q", 1000.0 + i, 10, b"a" * 10) for i in range(800)]
    assert all(x is None for x in salidas)
    # y al cerrar la ventana sale una sola, no diez
    assert m.ofrecer("q", 1900.0, 10, b"a" * 10) is not None
    assert m.ofrecer("q", 1901.0, 10, b"a" * 10) is None


def test_cada_cola_tiene_su_propia_ventana():
    m = Muestreo(cada=900.0)
    m.ofrecer("a", 0.0, 9, b"a" * 9)
    m.ofrecer("b", 500.0, 3, b"b" * 3)
    assert m.ofrecer("a", 900.0, 1, b"a").bytes == 9
    assert m.ofrecer("b", 900.0, 1, b"b") is None  # la de `b` sigue abierta


def test_la_ventana_siguiente_arranca_de_cero():
    # Riesgo: que el mayor de la ventana vieja tape a los de la nueva.
    m = Muestreo(cada=900.0)
    _ventana(m, "q", [1000])
    # el mensaje de 1 byte que cerró la ventana abrió la nueva; al cerrarla
    # sale ese, no el de 1000 de la anterior
    muestra = m.ofrecer("q", 1800.0, 7, b"a" * 7)
    assert muestra.bytes == 1


def test_el_mayor_se_guarda_cortado_y_marcado_por_cola_via_lote():
    muestreo = Muestreo(cada=10.0)
    lote = Lote()
    for t, ahora in ((100, 0.0), (gr8_feed.MUESTRA_MAX_BYTES + 1, 1.0), (200, 2.0), (1, 11.0)):
        lote.registrar("q", b"a" * t, "m", ahora, muestreo=muestreo)
    (muestra,) = lote.muestras
    assert muestra.truncado and muestra.mayor_de_ventana
    assert muestra.bytes == gr8_feed.MUESTRA_MAX_BYTES + 1
    assert len(muestra.cuerpo) == gr8_feed.MUESTRA_MAX_BYTES


def test_se_retiene_un_solo_candidato_por_cola_en_memoria():
    # Riesgo de RAM: acumular los grandes de la ventana. Solo vive el mayor.
    m = Muestreo(cada=900.0)
    for i in range(1, 50):
        m.ofrecer("q", float(i), i * 1000, b"a" * (i * 1000))
    assert len(m._mayor) == 1
    assert m._mayor["q"].bytes == 49_000
    # los mensajes chicos que llegan después no reemplazan ni suman
    m.ofrecer("q", 60.0, 10, b"a" * 10)
    assert len(m._mayor) == 1 and m._mayor["q"].bytes == 49_000


def test_lo_retenido_nunca_pasa_del_tope_aunque_el_mensaje_si():
    m = Muestreo(cada=900.0)
    m.ofrecer("q", 0.0, 5_000_000, b"a" * 5_000_000)
    assert len(m._mayor["q"].cuerpo) <= gr8_feed.MUESTRA_MAX_BYTES


# ── El tope de la muestra ──────────────────────────────────────

def test_sin_variable_vale_el_tope_de_siempre():
    assert gr8_feed.muestra_max_bytes({}) == gr8_feed.MUESTRA_MAX_BYTES_POR_DEFECTO


def test_se_puede_subir_para_capturar_un_mensaje_entero():
    """Un mensaje de `markets` pesa 62 KB: con el tope de siempre se ve el 6%
    de la estructura que hay que modelar."""
    assert gr8_feed.muestra_max_bytes({"GR8_FEED_MUESTRA_BYTES": "131072"}) == 131072


def test_el_tope_admite_un_mensaje_de_7_mb():
    # Máximo medido en `market-results`: con el tope viejo (1 MiB) no entraba.
    siete_mb = 7 * 1024 * 1024
    assert gr8_feed.MUESTRA_MAX_BYTES_TOPE > siete_mb
    valor = gr8_feed.muestra_max_bytes({"GR8_FEED_MUESTRA_BYTES": str(siete_mb)})
    assert valor == siete_mb
    texto, cortado = recortar_cuerpo(b"a" * siete_mb, maximo=valor)
    assert not cortado and len(texto) == siete_mb


def test_un_valor_absurdo_no_deja_sin_memoria_al_proceso():
    """El tope del tope existe porque son diez muestras por cola y nueve
    colas: el valor manda directo sobre el tamaño de la tabla."""
    enorme = str(gr8_feed.MUESTRA_MAX_BYTES_TOPE * 100)
    assert gr8_feed.muestra_max_bytes({"GR8_FEED_MUESTRA_BYTES": enorme}) == gr8_feed.MUESTRA_MAX_BYTES_TOPE


def test_un_error_de_tipeo_no_frena_la_observacion():
    """Dejar de medir por una variable mal escrita es peor que medir de
    menos, así que cualquier cosa rara vuelve al valor de siempre."""
    for basura in ("", "  ", "mucho", "0", "-1", "12.5"):
        assert gr8_feed.muestra_max_bytes({"GR8_FEED_MUESTRA_BYTES": basura}) \
            == gr8_feed.MUESTRA_MAX_BYTES_POR_DEFECTO, f"falló con {basura!r}"


# ── La taxonomía: deportes, categorías y torneos (G3) ──────────
#
# Los cuerpos de ejemplo tienen la forma REAL medida sobre las 30 muestras de
# estas tres colas (mismos campos, mismo formato de id: "Bandy" en deportes y
# 32 hex en las otras dos). Lo único recortado son los mapas de nombres, que
# en el feed traen hasta 41 idiomas y no aportan nada a la prueba.


def _cuerpo(obj) -> bytes:
    return json.dumps(obj).encode()


DEPORTE = {
    "id": "Bandy",
    "name": {"pl": "Bandy", "ru": "Хоккей с мячем", "es": "Bandy", "en": "Bandy"},
    "nameMobile": {},
    "timestamp": "2026-10-02T12:34:10.3527363Z",
    "sourceTimestamp": "2026-10-02T12:34:10.3041244Z",
    "dataVersion": 46,
    "slug": "bandy",
}

CATEGORIA = {
    "id": "b70e95fbab014e50a84ea378a0fc538f",
    "name": {"en": "Trinidad and Tobago", "ru": "Тринидад и Тобаго"},
    "nameMobile": {},
    "dataVersion": 10,
    "slug": "trinidad-and-tobago",
    "labels": {"iconCode": "TTO", "isCybersport": "False", "isActive": "True"},
    "sport": "Basketball",
    "metadataSport": 0,
}

TORNEO = {
    "id": "0ff594c47b2d4dd3afad0ba938b9da96",
    "categoryId": "79491576917246a3869da73d52f2ffd5",
    "name": {"ru": "Мадрид Челленджер", "en": "Madrid Challenger"},
    "nameMobile": {},
    "dataVersion": 2,
    "isInternational": False,
    "gender": "None",
    "stage": None,
    "slug": "madrid-challenger",
    "labels": {"isCybersport": "False", "isActive": "False"},
    "sport": "Basketball",
    "metadataSport": 3,
}


# --- Qué cola trae qué -----------------------------------------------------


def test_solo_estas_tres_colas_se_interpretan():
    # Riesgo: empezar a interpretar `markets` (62 KB y 20/s) por accidente,
    # que es justo lo que esta unidad NO toca.
    assert gr8_feed.clase_de_cola("sports-queue") == "deporte"
    assert gr8_feed.clase_de_cola("categories-queue") == "categoria"
    assert gr8_feed.clase_de_cola("tournaments-queue") == "torneo"
    for otra in ("markets-queue", "market-results-queue", "events-queue",
                 "scores-queue", "event-free-form-templates-queue",
                 "line-items-dependency-pairs-queue"):
        assert gr8_feed.clase_de_cola(otra) is None, otra
    assert len(gr8_feed.COLAS_TAXONOMIA) == 3
    # y las tres que se interpretan son de verdad colas del feed
    assert set(gr8_feed.COLAS_TAXONOMIA) <= set(COLAS_BASE)


def test_el_sufijo_del_entorno_no_esconde_la_cola():
    # Riesgo medido: el sufijo real es `-int` en minúscula, no `-INT`. Si la
    # clase se decidiera por igualdad exacta, en staging no se interpretaría
    # nada y la tabla quedaría vacía sin un solo error en el registro.
    for sufijo in ("-int", "-INT", "-TEST", ""):
        assert gr8_feed.clase_de_cola(f"tournaments-queue{sufijo}") == "torneo"
        assert gr8_feed.clase_de_cola(f"markets-queue{sufijo}") is None


# --- Un mensaje llena su fila ---------------------------------------------


def test_un_mensaje_de_deporte_llena_su_fila():
    fila = gr8_feed.interpretar_taxonomia("deporte", _cuerpo(DEPORTE))
    assert (fila.clase, fila.id, fila.data_version) == ("deporte", "Bandy", 46)
    assert (fila.nombre, fila.nombre_idioma) == ("Bandy", "es")
    assert fila.slug == "bandy"
    # un deporte no tiene padre
    assert fila.deporte_id is None and fila.categoria_id is None


def test_un_mensaje_de_categoria_llena_su_fila_con_su_deporte():
    fila = gr8_feed.interpretar_taxonomia("categoria", _cuerpo(CATEGORIA))
    assert fila.id == "b70e95fbab014e50a84ea378a0fc538f"
    assert fila.deporte_id == "Basketball"
    assert (fila.nombre, fila.nombre_idioma) == ("Trinidad and Tobago", "en")
    assert fila.data_version == 10


def test_un_mensaje_de_torneo_llena_su_fila_con_categoria_y_deporte():
    fila = gr8_feed.interpretar_taxonomia("torneo", _cuerpo(TORNEO))
    assert fila.id == "0ff594c47b2d4dd3afad0ba938b9da96"
    assert fila.categoria_id == "79491576917246a3869da73d52f2ffd5"
    assert fila.deporte_id == "Basketball"
    assert (fila.nombre, fila.nombre_idioma) == ("Madrid Challenger", "en")


def test_el_id_del_deporte_no_es_un_guid():
    # Riesgo: validar la forma del id y perder los 39 deportes, cuyo id es
    # el nombre en inglés y no un guid como en las otras dos colas.
    assert gr8_feed.interpretar_taxonomia("deporte", _cuerpo(DEPORTE)).id == "Bandy"


# --- El orden: `dataVersion`, no `sourceDataVersion` ----------------------


def test_el_orden_se_decide_con_dataversion():
    # Riesgo: usar `sourceDataVersion` como en `markets` y `events`. Acá no
    # viene (0 de 30 muestras), y los dos campos van desfasados: confundirlos
    # es pisar un dato nuevo con uno viejo.
    fila = gr8_feed.interpretar_taxonomia(
        "torneo", _cuerpo({**TORNEO, "dataVersion": 7, "sourceDataVersion": 999}))
    assert fila.data_version == 7


def test_sin_dataversion_el_mensaje_no_se_guarda_con_version_inventada():
    # Riesgo: poner 0 cuando falta. Con 0 guardado, el próximo mensaje
    # cualquiera le gana, y la puerta de versión deja de servir.
    for roto in ({k: v for k, v in TORNEO.items() if k != "dataVersion"},
                 {**TORNEO, "dataVersion": None},
                 {**TORNEO, "dataVersion": "2"},
                 {**TORNEO, "dataVersion": 2.5},
                 {**TORNEO, "dataVersion": True}):
        with pytest.raises(gr8_feed.MensajeIlegible):
            gr8_feed.interpretar_taxonomia("torneo", _cuerpo(roto))


def test_una_version_menor_no_pisa_a_una_mayor_dentro_del_lote():
    # Riesgo medido: la ráfaga de arranque trajo el MISMO torneo siete veces
    # en el mismo instante. Si gana el último en llegar, queda el viejo.
    lote = Lote()
    for v in (9, 2, 5):
        lote.registrar("tournaments-queue-int",
                       _cuerpo({**TORNEO, "dataVersion": v,
                                "name": {"en": f"v{v}"}}),
                       f"m{v}", 1000.0)
    (fila,) = lote.taxonomia.values()
    assert fila.data_version == 9 and fila.nombre == "v9"
    # los tres mensajes se cuentan y se confirman igual: lo que no se guarda
    # es la FILA vieja, no el mensaje.
    assert len(lote.pendientes) == 3
    assert lote.cubos[("tournaments-queue-int", minuto_de(1000.0))].mensajes == 3


def test_una_version_igual_tampoco_pisa():
    # Estrictamente mayor: una republicación idéntica no tiene que reescribir.
    lote = Lote()
    lote.registrar("tournaments-queue", _cuerpo({**TORNEO, "dataVersion": 4,
                                                 "name": {"en": "primero"}}), "a", 0.0)
    lote.registrar("tournaments-queue", _cuerpo({**TORNEO, "dataVersion": 4,
                                                 "name": {"en": "segundo"}}), "b", 0.0)
    (fila,) = lote.taxonomia.values()
    assert fila.nombre == "primero"


def test_cada_entidad_es_una_fila_aunque_vengan_mezcladas():
    lote = Lote()
    lote.registrar("sports-queue", _cuerpo(DEPORTE), "a", 0.0)
    lote.registrar("categories-queue", _cuerpo(CATEGORIA), "b", 0.0)
    lote.registrar("tournaments-queue", _cuerpo(TORNEO), "c", 0.0)
    lote.registrar("tournaments-queue", _cuerpo({**TORNEO, "id": "otro",
                                                 "dataVersion": 1}), "d", 0.0)
    assert sorted(c for c, _ in lote.taxonomia) == ["categoria", "deporte",
                                                    "torneo", "torneo"]
    assert len(lote.taxonomia) == 4


def test_el_lote_que_se_reintenta_conserva_la_version_mas_alta():
    # Riesgo: tras un fallo de la base, juntar los dos lotes y quedarse con
    # la versión equivocada porque el orden del merge decide.
    rec = Recolector()
    rec.actual.registrar("tournaments-queue", _cuerpo({**TORNEO, "dataVersion": 8}),
                         "m0", 1000.0)
    fallido = rec.tomar()
    rec.actual.registrar("tournaments-queue", _cuerpo({**TORNEO, "dataVersion": 3}),
                         "m1", 1010.0)
    rec.devolver(fallido)
    (fila,) = rec.actual.taxonomia.values()
    assert fila.data_version == 8
    assert rec.actual.pendientes == ["m0", "m1"]


# --- La regla de respaldo del idioma --------------------------------------


def test_el_respaldo_elige_espanol_cuando_esta():
    assert gr8_feed.elegir_nombre({"en": "Basketball", "es": "Baloncesto"}) \
        == ("Baloncesto", "es")


def test_el_respaldo_elige_ingles_cuando_no_hay_espanol():
    # Medido: `categories.name` trae `es` 0 de 10 veces. Sin este respaldo,
    # las categorías no tendrían nombre.
    assert gr8_feed.elegir_nombre({"ru": "Тринидад", "en": "Trinidad"}) \
        == ("Trinidad", "en")


def test_sin_espanol_ni_ingles_se_toma_la_primera_que_haya():
    # Un nombre en un idioma cualquiera es mejor que ninguno. CASO NUNCA
    # OBSERVADO: en las 30 muestras reales `en` vino siempre. Se prueba
    # sintético a propósito, y que pase no demuestra que GR8 lo mande.
    assert gr8_feed.elegir_nombre({"ko": "밴디", "ja": "バンディ"}) == ("밴디", "ko")


def test_un_nombre_vacio_no_le_gana_al_respaldo():
    # Riesgo: `es` presente pero en blanco deja la pantalla sin texto y
    # además tapa al inglés, que sí tenía algo.
    assert gr8_feed.elegir_nombre({"es": "   ", "en": "Madrid"}) == ("Madrid", "en")
    assert gr8_feed.elegir_nombre({"es": "", "en": "", "it": "Madrid"}) == ("Madrid", "it")


def test_no_se_inventa_un_nombre_cuando_no_hay_ninguno():
    for vacio in ({}, None, {"es": ""}, {"es": None}, [], "Bandy", {"es": 5}):
        assert gr8_feed.elegir_nombre(vacio) is None, vacio


def test_sin_nombre_la_fila_existe_igual_y_lo_dice():
    # Riesgo: descartar la entidad por no tener nombre y romper el enganche
    # de todos sus eventos. La fila va, con el idioma en None para poder
    # contarlas.
    fila = gr8_feed.interpretar_taxonomia(
        "torneo", _cuerpo({**TORNEO, "name": {}}))
    assert fila.nombre is None and fila.nombre_idioma is None
    assert fila.id == TORNEO["id"] and fila.categoria_id == TORNEO["categoryId"]


def test_el_slug_nunca_se_usa_como_nombre():
    # Riesgo: rellenar con el slug es inventar un nombre, y además es texto
    # técnico: "madrid-challenger" no es algo que un jugador deba leer.
    fila = gr8_feed.interpretar_taxonomia("torneo", _cuerpo({**TORNEO, "name": {}}))
    assert fila.slug == "madrid-challenger"
    assert fila.nombre != fila.slug


def test_la_columna_de_idioma_dice_la_verdad():
    # Riesgo: anotar siempre "es" y no poder medir la cobertura. Es la razón
    # por la que la columna existe: sin ella, la cobertura se descubre cuando
    # un jugador ve una categoría en inglés.
    casos = {
        "es": {"es": "Baloncesto", "en": "Basketball"},
        "en": {"en": "Trinidad and Tobago", "ru": "Тринидад"},
        "ko": {"ko": "밴디"},
    }
    for esperado, nombres in casos.items():
        fila = gr8_feed.interpretar_taxonomia(
            "categoria", _cuerpo({**CATEGORIA, "name": nombres}))
        assert fila.nombre_idioma == esperado
        assert fila.nombre == nombres[esperado]


def test_la_cobertura_de_espanol_se_puede_contar_con_la_columna():
    # La consulta que mide la puerta, hecha en memoria: tres entidades, una
    # con español. La columna tiene que dar 1 de 3, no 3 de 3.
    nombres = [{"es": "Fútbol", "en": "Football"}, {"en": "Cricket"}, {"ru": "Бокс"}]
    idiomas = [gr8_feed.interpretar_taxonomia(
        "deporte", _cuerpo({**DEPORTE, "id": f"d{i}", "name": n})).nombre_idioma
        for i, n in enumerate(nombres)]
    assert idiomas.count("es") == 1
    assert idiomas == ["es", "en", "ru"]


# --- Lo que no se entiende se cuenta, no se traga ni tumba nada -----------


@pytest.mark.parametrize("cuerpo", [
    b"",                       # medido: hay mensajes de longitud cero
    b"   ",
    b"{no es json",
    b"[]",                     # JSON válido pero no un objeto
    b'"Bandy"',
    b"{}",                     # sin id ni versión
    b'{"dataVersion": 3}',     # sin id
    b'{"id": "  "}',           # id en blanco
])
def test_un_mensaje_ilegible_se_cuenta_aparte(cuerpo):
    # Riesgo: tragarlo en un try/except mudo. Si GR8 cambia el esquema,
    # desaparecerían torneos y nadie sabría cuántos.
    lote = Lote()
    lote.registrar("tournaments-queue-int", cuerpo, "m", 1000.0)
    cubo = lote.cubos[("tournaments-queue-int", minuto_de(1000.0))]
    assert cubo.descartados == 1
    assert lote.taxonomia == {}
    # y se cuenta como mensaje recibido igual: llegó, aunque no se entienda
    assert cubo.mensajes == 1


def test_un_mensaje_ilegible_se_confirma_igual():
    # Riesgo: no confirmarlo. El broker lo devuelve para siempre y esa cola
    # no vuelve a avanzar nunca: un solo mensaje raro congela la taxonomía.
    lote = Lote()
    lote.registrar("tournaments-queue", b"{roto", "m", 0.0)
    assert lote.pendientes == ["m"]


def test_lo_ilegible_no_arrastra_a_lo_bueno():
    lote = Lote()
    lote.registrar("tournaments-queue", b"{roto", "a", 0.0)
    lote.registrar("tournaments-queue", _cuerpo(TORNEO), "b", 0.0)
    lote.registrar("tournaments-queue", b"", "c", 0.0)
    assert len(lote.taxonomia) == 1
    assert lote.cubos[("tournaments-queue", minuto_de(0.0))].descartados == 2
    assert lote.pendientes == ["a", "b", "c"]


def test_los_descartes_se_suman_al_reintentar_el_lote():
    rec = Recolector()
    rec.actual.registrar("sports-queue", b"{roto", "a", 0.0)
    fallido = rec.tomar()
    rec.actual.registrar("sports-queue", b"{roto", "b", 0.0)
    rec.devolver(fallido)
    assert rec.actual.cubos[("sports-queue", minuto_de(0.0))].descartados == 2


def test_una_cola_que_no_es_taxonomia_no_se_intenta_interpretar():
    # Riesgo: contar como descarte el 100% de `markets`, que no se interpreta
    # en esta unidad, y dejar la cuenta de descartes inservible.
    lote = Lote()
    lote.registrar("markets-queue-int", b"{esto no es json", "m", 0.0)
    assert lote.cubos[("markets-queue-int", minuto_de(0.0))].descartados == 0
    assert lote.taxonomia == {}


# --- El camino de observación sigue intacto -------------------------------


def test_la_observacion_sigue_contando_y_muestreando_la_taxonomia():
    # Riesgo: el cambio que más duele. Si mañana hay que volver a mirar qué
    # llega, ese mecanismo no puede haberse roto.
    muestreo = Muestreo(cada=10.0)
    lote = Lote()
    cuerpo = _cuerpo(TORNEO)
    lote.registrar("tournaments-queue-int", cuerpo, "a", 1000.0,
                   muestreo=muestreo)
    lote.registrar("tournaments-queue-int", cuerpo + b" " * 50, "b", 1001.0,
                   reentregado=True, muestreo=muestreo)
    # un tercero del minuto siguiente, que además cierra la ventana de muestreo
    lote.registrar("tournaments-queue-int", _cuerpo({**TORNEO, "dataVersion": 99}),
                   "c", 1070.0, muestreo=muestreo)

    cubo = lote.cubos[("tournaments-queue-int", minuto_de(1000.0))]
    assert cubo.mensajes == 2
    assert cubo.bytes == len(cuerpo) * 2 + 50
    assert cubo.bytes_max == len(cuerpo) + 50
    assert cubo.reentregados == 1
    assert cubo.descartados == 0
    # el minuto siguiente es su propio cubo, como siempre
    assert lote.cubos[("tournaments-queue-int", minuto_de(1070.0))].mensajes == 1
    # y la muestra sigue siendo la mayor de la ventana, con el cuerpo crudo
    (muestra,) = lote.muestras
    assert muestra.bytes == len(cuerpo) + 50 and muestra.mayor_de_ventana
    assert muestra.cuerpo.startswith("{")
    # la interpretación es ADEMÁS, no EN LUGAR DE
    assert len(lote.taxonomia) == 1


def test_la_observacion_de_las_otras_seis_colas_no_cambio():
    lote = Lote()
    lote.registrar("markets-queue", b"x" * 100, "a", 120.0)
    lote.registrar("markets-queue", b"x" * 300, "b", 150.0, reentregado=True)
    lote.registrar("scores-queue", b"x" * 10, "d", 125.0)
    m1 = lote.cubos[("markets-queue", minuto_de(120.0))]
    assert (m1.mensajes, m1.bytes, m1.bytes_max, m1.reentregados) == (2, 400, 300, 1)
    assert lote.cubos[("scores-queue", minuto_de(125.0))].bytes == 10
    assert lote.taxonomia == {} and m1.descartados == 0


def test_la_taxonomia_se_escribe_antes_de_confirmar():
    # Riesgo: confirmar un torneo que no se escribió. El broker no lo
    # devuelve y ese torneo no vuelve hasta la próxima republicación de GR8.
    eventos = []
    lote = Lote()
    lote.registrar("tournaments-queue", _cuerpo(TORNEO), "m", 0.0)

    async def escribir(l):
        eventos.append(f"escribir {len(l.taxonomia)} filas")

    async def confirmar(m):
        eventos.append(f"ack {m}")

    _correr(vaciar(lote, escribir, confirmar))
    assert eventos == ["escribir 1 filas", "ack m"]


def test_si_falla_la_escritura_de_la_taxonomia_no_se_confirma_nada():
    confirmados = []
    lote = Lote()
    lote.registrar("sports-queue", _cuerpo(DEPORTE), "m", 0.0)

    async def escribir(_):
        raise EscrituraFallida("UniqueViolationError")

    async def confirmar(m):
        confirmados.append(m)

    with pytest.raises(EscrituraFallida):
        _correr(vaciar(lote, escribir, confirmar))
    assert confirmados == []


# --- Lo que se le manda a la base -----------------------------------------


def _sentencias():
    import gr8_consumidor

    return gr8_consumidor


def test_las_tres_escrituras_tienen_la_puerta_de_version():
    # Riesgo: que una de las tres se olvide la puerta y pise un nombre nuevo
    # con uno viejo. Se mira el SQL porque es donde vive la regla.
    c = _sentencias()
    for sql in (c._UPSERT_DEPORTE, c._UPSERT_CATEGORIA, c._UPSERT_TORNEO):
        assert "ON CONFLICT (id) DO UPDATE" in sql
        assert "WHERE EXCLUDED.data_version > t.data_version" in sql
        # estrictamente mayor, nunca >=
        assert ">= t.data_version" not in sql


def test_los_parametros_van_en_el_orden_de_las_columnas():
    # Riesgo: un upsert con los parámetros corridos guarda el nombre en el
    # slug, el idioma en el nombre, o la categoría del torneo en su deporte.
    # No tira un solo error: queda una taxonomía cruzada en silencio, que es
    # el mismo defecto que cruza local con visitante.
    #
    # Se comprueba COLUMNA POR COLUMNA, todas, y no una muestra: cada columna
    # de la tabla tiene que recibir el atributo del mismo nombre. Mirar solo
    # algunas es dejar justo el par que se puede cruzar sin que se note
    # (`categoria_id` y `deporte_id`, los dos TEXT y los dos opcionales).
    c = _sentencias()
    for clase, cuerpo in (("deporte", DEPORTE), ("categoria", CATEGORIA),
                          ("torneo", TORNEO)):
        fila = gr8_feed.interpretar_taxonomia(clase, _cuerpo(cuerpo))
        sql, args = c.sentencia_taxonomia(fila)
        columnas = sql.split("(", 2)[1].split(")")[0].replace("\n", " ")
        columnas = [x.strip() for x in columnas.split(",")]
        # `actualizado_at` lo pone la base con now(), no viaja como parámetro
        assert columnas[-1] == "actualizado_at", clase
        assert len(args) == len(columnas) - 1, clase
        for columna, valor in zip(columnas, args):
            esperado = getattr(fila, columna)
            assert valor == esperado, f"{clase}.{columna}: {valor!r} != {esperado!r}"
        assert f"${len(args)}" in sql and f"${len(args) + 1}" not in sql


def test_el_torneo_guarda_su_categoria_y_su_deporte_sin_cruzarlos():
    # Riesgo: `categoryId` y `sport` son los dos TEXT y los dos opcionales,
    # así que cruzarlos no rompe nada: deja torneos colgados de una categoría
    # que no existe y el catálogo vacío sin un error.
    c = _sentencias()
    fila = gr8_feed.interpretar_taxonomia("torneo", _cuerpo(TORNEO))
    sql, args = c.sentencia_taxonomia(fila)
    assert "gr8_torneo" in sql
    columnas = [x.strip() for x in
                sql.split("(", 2)[1].split(")")[0].replace("\n", " ").split(",")]
    valores = dict(zip(columnas, args))
    assert valores["categoria_id"] == TORNEO["categoryId"]
    assert valores["deporte_id"] == "Basketball"


def test_la_categoria_guarda_su_deporte():
    c = _sentencias()
    fila = gr8_feed.interpretar_taxonomia("categoria", _cuerpo(CATEGORIA))
    sql, args = c.sentencia_taxonomia(fila)
    assert "gr8_categoria" in sql and "Basketball" in args


def test_una_clase_desconocida_no_se_adivina():
    c = _sentencias()
    fila = gr8_feed.Taxonomia(clase="mercado", id="x", data_version=1,
                              nombre=None, nombre_idioma=None, slug=None)
    with pytest.raises(ValueError, match="mercado"):
        c.sentencia_taxonomia(fila)


def test_el_contador_de_descartes_viaja_a_la_base():
    # Riesgo: contar los descartes en memoria y no escribirlos, que es igual
    # a no contarlos.
    c = _sentencias()
    assert "descartados" in c._UPSERT_CUBO
    assert "t.descartados + EXCLUDED.descartados" in c._UPSERT_CUBO
    assert "$7" in c._UPSERT_CUBO


# --- El SQL y la migración dicen lo mismo ---------------------------------


def _migraciones_gr8():
    from pathlib import Path

    raiz = Path(gr8_feed.__file__).resolve().parents[1]
    return sorted((raiz / "supabase" / "migrations").glob("*_gr8_*.sql"))


def _columnas_de_la_migracion() -> dict[str, set[str]]:
    """Las columnas de las tablas de GR8, leídas de TODAS sus migraciones.

    Es la única forma de comprobar sin base de datos que el código y el
    esquema hablan de las mismas columnas. Un `nombre_idioma` escrito
    `idioma_nombre` en uno de los dos lados no falla en ninguna prueba: falla
    en producción, en el primer lote, y deja de confirmar mensajes.

    Se leen todas las migraciones de GR8 y no solo la de esta unidad porque
    `gr8_obs_minuto` nace en una anterior y esta le agrega una columna: el
    esquema real es la suma, igual que en la base.
    """
    import re

    tablas: dict[str, set[str]] = {}
    for archivo in _migraciones_gr8():
        sql = re.sub(r"--[^\n]*", "", archivo.read_text())  # fuera comentarios
        for tabla, cuerpo in re.findall(
                r"CREATE TABLE IF NOT EXISTS public\.(\w+)\s*\((.*?)\n\);", sql, re.S):
            columnas = tablas.setdefault(tabla, set())
            for linea in cuerpo.split(","):
                palabras = linea.split()
                if palabras and palabras[0].isidentifier():
                    columnas.add(palabras[0])
        for tabla, columna in re.findall(
                r"ALTER TABLE public\.(\w+)\s+ADD COLUMN IF NOT EXISTS (\w+)", sql):
            tablas.setdefault(tabla, set()).add(columna)
    return tablas


def test_la_migracion_crea_las_tres_tablas():
    tablas = _columnas_de_la_migracion()
    assert {"gr8_deporte", "gr8_categoria", "gr8_torneo"} <= set(tablas)


def test_cada_upsert_nombra_solo_columnas_que_existen():
    import re

    c = _sentencias()
    tablas = _columnas_de_la_migracion()
    sentencias = (c._UPSERT_DEPORTE, c._UPSERT_CATEGORIA, c._UPSERT_TORNEO,
                  c._UPSERT_CUBO)
    for sql in sentencias:
        tabla = re.search(r"INSERT INTO public\.(\w+)", sql).group(1)
        columnas = [x.strip() for x in
                    sql.split("(", 2)[1].split(")")[0].replace("\n", " ").split(",")]
        faltan = set(columnas) - tablas.get(tabla, set())
        assert not faltan, f"{tabla}: el código nombra columnas que no existen: {faltan}"
    # y la columna nueva de observación está en la migración
    assert "descartados" in tablas["gr8_obs_minuto"]


def test_las_tres_columnas_del_idioma_existen_en_las_tres_tablas():
    # Riesgo: olvidarse `nombre_idioma` en una de las tres y no poder medir
    # la cobertura justo en la que menos español trae.
    tablas = _columnas_de_la_migracion()
    for tabla in ("gr8_deporte", "gr8_categoria", "gr8_torneo"):
        assert {"nombre", "nombre_idioma", "data_version"} <= tablas[tabla], tabla


def test_la_taxonomia_no_tiene_claves_ajenas_entre_si():
    # Riesgo medido: las tres colas llegan desordenadas entre sí (de 3
    # `categoryId` distintos de torneos, 1 tenía su categoría observada). Con
    # clave ajena, el torneo que llega antes que su categoría se rechaza y no
    # vuelve hasta la próxima republicación de GR8.
    from pathlib import Path

    raiz = Path(gr8_feed.__file__).resolve().parents[1]
    sql = (raiz / "supabase" / "migrations" / "20261002210000_gr8_taxonomia.sql").read_text()
    assert "REFERENCES" not in sql.upper()
