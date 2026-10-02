"""El consumidor del feed de GR8, probado sin broker.

Cada prueba nombra el riesgo que cubre. Lo que NO se probó acá es la
conexión real: las credenciales de GR8 son del dueño y se están rotando.
"""

import asyncio

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
