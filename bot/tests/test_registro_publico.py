"""La parte del registro público que decide, probada sin red.

Normalizar un teléfono, generar y comparar un código, y frenar al que abusa
son las tres cosas que, si fallan, cuestan plata o cuentas ajenas. Ninguna
necesita Twilio ni Google para probarse.
"""

import pytest

from registro_publico import (
    FrenoActivado,
    LIMITE_POR_IP,
    LIMITE_POR_TELEFONO,
    LIMITE_RAFAGA_REGISTROS,
    LIMITE_REGISTROS_POR_IP,
    PAISES,
    PAISES_LATAM,
    TelefonoInvalido,
    codigo_coincide,
    generar_codigo,
    hash_codigo,
    normalizar_email,
    normalizar_telefono,
    paises_disponibles,
    revisar_limite,
)

SECRETO = "un-secreto-de-servidor"


# ── Teléfonos ────────────────────────────────────────────────────

@pytest.mark.parametrize("escrito", [
    "0991234567",          # como lo escribe la gente en Ecuador
    "991234567",
    "+593991234567",
    "593 99 123 4567",
    "(099) 123-4567",
    "00593991234567",
])
def test_un_numero_de_ecuador_llega_siempre_al_mismo_formato(escrito):
    assert normalizar_telefono(escrito, "EC") == "+593991234567"


@pytest.mark.parametrize("escrito", [
    "011 15 2345-6789",      # como lo escribe la gente en Argentina
    "11 15 2345-6789",
    "+5491123456789",
    "9 11 2345 6789",
])
def test_un_celular_argentino_llega_siempre_al_mismo_formato(escrito):
    """El 9 después del código de país no es un capricho: sin él, ni el SMS
    ni el WhatsApp llegan. Es el error que tuvo la primera versión de esto."""
    assert normalizar_telefono(escrito, "AR") == "+5491123456789"


def test_un_fijo_se_rechaza_porque_no_puede_recibir_el_codigo():
    """Un fijo argentino es un número válido, pero mandarle un SMS es tirar
    plata y dejar a la persona esperando."""
    with pytest.raises(TelefonoInvalido, match="celular"):
        normalizar_telefono("11 2345-6789", "AR")


def test_venezuela_se_normaliza_igual():
    assert normalizar_telefono("0412-1234567", "VE") == "+584121234567"


@pytest.mark.parametrize("malo,pais", [
    ("", "EC"),
    ("12345", "EC"),            # corto
    ("99123456789", "EC"),      # largo
    ("no-es-un-numero", "AR"),
    ("911234567", "ES"),        # país no habilitado (no es Latinoamérica)
])
def test_un_numero_que_no_sirve_se_rechaza_con_motivo(malo, pais):
    with pytest.raises(TelefonoInvalido):
        normalizar_telefono(malo, pais)


@pytest.mark.parametrize("escrito,pais,esperado", [
    ("11961234567", "BR", "+5511961234567"),   # celular de Brasil
    ("3001234567", "CO", "+573001234567"),     # celular de Colombia
    ("5512345678", "MX", "+525512345678"),     # celular de México (CDMX)
])
def test_los_nuevos_paises_latam_tambien_normalizan(escrito, pais, esperado):
    """Ampliar `PAISES` a toda la región no sirve de nada si la
    normalización de esos países no funciona: cada uno tiene sus propias
    reglas de móvil, y `phonenumbers` es quien las conoce."""
    assert normalizar_telefono(escrito, pais) == esperado


def test_ecuador_argentina_y_venezuela_van_primero_en_el_selector():
    """Son los mercados de lanzamiento: tienen que aparecer arriba del
    selector de país, no perdidos en el orden alfabético del resto."""
    primeros = [codigo for codigo, _, _ in PAISES_LATAM[:3]]
    assert primeros == ["EC", "AR", "VE"]


def test_el_resto_de_los_paises_va_alfabetico_por_nombre():
    resto = [nombre for _, nombre, _ in PAISES_LATAM[3:]]
    assert resto == sorted(resto)


def test_paises_disponibles_es_lo_que_sirve_el_endpoint():
    """Sin bandera: eso lo dibuja la pantalla, no el backend."""
    paises = paises_disponibles()

    assert paises[0] == {"codigo": "EC", "nombre": "Ecuador", "indicativo": "+593"}
    assert all(set(p) == {"codigo", "nombre", "indicativo"} for p in paises)
    assert len(paises) == len(PAISES) == len(PAISES_LATAM)


def test_el_mismo_numero_escrito_distinto_es_el_mismo_numero():
    """Es lo que hace que el índice único signifique algo: si no, la misma
    persona abre dos cuentas escribiendo el número de otra forma."""
    formas = ["0991234567", "+593 99 123 4567", "593991234567"]
    normalizados = {normalizar_telefono(f, "EC") for f in formas}
    assert len(normalizados) == 1


# ── Correos ──────────────────────────────────────────────────────

def test_el_correo_se_guarda_en_minusculas_y_sin_espacios():
    assert normalizar_email("  Juan.Perez@Gmail.com ") == "juan.perez@gmail.com"


@pytest.mark.parametrize("malo", ["", "sinarroba", "@solo", "termina@"])
def test_un_correo_invalido_se_rechaza(malo):
    with pytest.raises(ValueError):
        normalizar_email(malo)


# ── Códigos ──────────────────────────────────────────────────────

def test_el_codigo_tiene_seis_digitos():
    for _ in range(50):
        codigo = generar_codigo()
        assert len(codigo) == 6 and codigo.isdigit()


def test_dos_codigos_seguidos_no_son_iguales():
    assert len({generar_codigo() for _ in range(30)}) > 20


def test_el_codigo_correcto_coincide():
    codigo = generar_codigo()
    guardado = hash_codigo(codigo, "+593991234567", SECRETO)

    assert codigo_coincide(guardado, codigo, "+593991234567", SECRETO)


def test_el_codigo_no_sirve_para_otro_telefono():
    """El hash va atado al número: robarlo de otra fila no alcanza."""
    codigo = generar_codigo()
    guardado = hash_codigo(codigo, "+593991234567", SECRETO)

    assert not codigo_coincide(guardado, codigo, "+541123456789", SECRETO)


def test_un_codigo_equivocado_no_pasa():
    guardado = hash_codigo("123456", "+593991234567", SECRETO)

    assert not codigo_coincide(guardado, "123457", "+593991234567", SECRETO)


def test_el_codigo_no_queda_guardado_en_claro():
    codigo = "123456"
    guardado = hash_codigo(codigo, "+593991234567", SECRETO)

    assert codigo not in guardado


# ── El freno ─────────────────────────────────────────────────────

def test_debajo_del_limite_se_deja_pasar():
    revisar_limite(LIMITE_POR_TELEFONO.cuantos - 1, LIMITE_POR_TELEFONO)


def test_al_llegar_al_limite_se_frena_con_un_mensaje_para_la_persona():
    with pytest.raises(FrenoActivado) as e:
        revisar_limite(LIMITE_POR_TELEFONO.cuantos, LIMITE_POR_TELEFONO)

    assert "código" in str(e.value).lower()


def test_el_limite_por_ip_es_mas_holgado_que_el_del_telefono():
    """Detrás de una misma conexión puede haber una oficina entera; detrás
    de un mismo número, no."""
    assert LIMITE_POR_IP.cuantos > LIMITE_POR_TELEFONO.cuantos


def test_el_tope_diario_de_registros_deja_entrar_a_un_barrio_entero():
    """En Ecuador, Argentina y Venezuela la mayoría entra por datos móviles
    con CGNAT: mucha gente real comparte una IP pública. Un tope bajo rebota
    jugadores y no nos enteramos, porque el que se frustra no reclama."""
    assert LIMITE_REGISTROS_POR_IP.cuantos >= 20
    assert LIMITE_REGISTROS_POR_IP.en_minutos == 60 * 24


def test_la_rafaga_se_corta_antes_que_el_tope_diario():
    """Es el freno que de verdad ataja al bot: registra rápido. Una familia
    registra despacio, así que nunca lo toca."""
    assert LIMITE_RAFAGA_REGISTROS.cuantos < LIMITE_REGISTROS_POR_IP.cuantos
    assert LIMITE_RAFAGA_REGISTROS.en_minutos < LIMITE_REGISTROS_POR_IP.en_minutos

    revisar_limite(LIMITE_RAFAGA_REGISTROS.cuantos - 1, LIMITE_RAFAGA_REGISTROS)
    with pytest.raises(FrenoActivado):
        revisar_limite(LIMITE_RAFAGA_REGISTROS.cuantos, LIMITE_RAFAGA_REGISTROS)


def test_el_mensaje_de_la_rafaga_dice_que_es_cuestion_de_esperar():
    """"Demasiadas cuentas" suena a puerta cerrada. Si solo hay que esperar
    unos minutos, decilo: el jugador vuelve."""
    with pytest.raises(FrenoActivado) as e:
        revisar_limite(LIMITE_RAFAGA_REGISTROS.cuantos, LIMITE_RAFAGA_REGISTROS)

    assert "esperá" in str(e.value).lower()


# ── El candado del retiro ────────────────────────────────────────

from datetime import datetime, timezone

from registro_publico import (
    MOTIVO_SIN_VERIFICAR,
    estado_de_verificacion,
    puede_retirar,
)

AHORA = datetime(2026, 9, 24, 12, 0, tzinfo=timezone.utc)


def test_el_que_se_registro_solo_y_no_verifico_no_puede_retirar():
    puede, motivo = puede_retirar("web", None)

    assert puede is False
    assert motivo == MOTIVO_SIN_VERIFICAR


def test_el_que_se_registro_solo_y_verifico_si_puede_retirar():
    puede, motivo = puede_retirar("web", AHORA)

    assert puede is True and motivo == ""


def test_al_jugador_de_una_agencia_no_se_le_cambian_las_reglas():
    """Lo avaló alguien al darlo de alta: no se le exige verificar para
    cobrar algo que ya podía cobrar ayer."""
    puede, _ = puede_retirar("agencia", None)

    assert puede is True


@pytest.mark.parametrize("origen", [None, "telegram", "admin"])
def test_los_jugadores_de_antes_siguen_retirando(origen):
    puede, _ = puede_retirar(origen, None)

    assert puede is True


def test_el_estado_dice_claramente_que_puede_y_que_no():
    """Es lo que alimenta la marca del perfil y el aviso al iniciar sesión.
    Lo arma el servidor para que la pantalla no invente su propia versión."""
    estado = estado_de_verificacion("web", None)

    assert estado["puede_jugar"] is True
    assert estado["puede_depositar"] is True
    assert estado["puede_retirar"] is False
    assert estado["telefono_verificado"] is False
    assert "retirar" in estado["motivo"]


def test_una_vez_verificado_el_aviso_desaparece():
    estado = estado_de_verificacion("web", AHORA)

    assert estado["puede_retirar"] is True
    assert estado["motivo"] == ""


# ── El formulario ────────────────────────────────────────────────

from registro_publico import (
    DatosInvalidos,
    LARGO_MINIMO_CLAVE,
    limpiar_referido,
    validar_clave,
    validar_edad_declarada,
    validar_nombre,
    validar_usuario,
)


def test_el_usuario_se_guarda_en_minusculas():
    assert validar_usuario("  JuanPerez  ") == "juanperez"


@pytest.mark.parametrize("malo", ["", "ab", "con espacio", "acentuación", "x" * 41])
def test_un_usuario_que_no_sirve_se_rechaza_con_motivo(malo):
    with pytest.raises(DatosInvalidos):
        validar_usuario(malo)


def test_la_clave_publica_pide_mas_que_la_de_mostrador():
    """En el mostrador la clave la elige un cajero frente a la persona. Acá
    cualquiera puede probar claves desde internet, toda la noche."""
    assert LARGO_MINIMO_CLAVE > 6

    with pytest.raises(DatosInvalidos):
        validar_clave("1234567")

    assert validar_clave("12345678") == "12345678"


def test_hay_que_decir_el_nombre():
    with pytest.raises(DatosInvalidos):
        validar_nombre(" ")
    assert validar_nombre("  Juan Pérez ") == "Juan Pérez"


@pytest.mark.parametrize("respuesta", [None, False, "si", 1, "true"])
def test_sin_confirmar_la_mayoria_de_edad_no_se_registra(respuesta):
    """Tiene que ser un sí explícito: un 'si' de texto o un 1 son formas de
    que el navegador mande cualquier cosa y la cuenta quede creada igual."""
    with pytest.raises(DatosInvalidos, match="mayor"):
        validar_edad_declarada(respuesta)


def test_confirmando_la_edad_se_puede_seguir():
    assert validar_edad_declarada(True) is True


def test_el_codigo_de_referido_se_normaliza():
    assert limpiar_referido("  age001 ") == "AGE001"
    assert limpiar_referido(None) == ""


# ── El registro pendiente ────────────────────────────────────────

from registro_publico import (
    LIMITE_REENVIO_PENDIENTE,
    MAX_INTENTOS_PENDIENTE,
    MAX_REENVIOS_PENDIENTE,
    VIGENCIA_PENDIENTE_MINUTOS,
    enmascarar_correo,
    generar_token_pendiente,
)


def test_el_token_pendiente_no_se_repite():
    """Es lo único que identifica el registro a medio hacer desde el
    navegador: si se pudiera adivinar o repetir, cualquiera podría
    confirmar el registro de otro."""
    tokens = {generar_token_pendiente() for _ in range(50)}
    assert len(tokens) == 50


def test_el_correo_enmascarado_no_se_muestra_entero():
    assert enmascarar_correo("juan.perez@gmail.com") == "j•••@gmail.com"
    assert enmascarar_correo("a@x.com") == "a•••@x.com"


@pytest.mark.parametrize("malo", ["", "sinarroba", None])
def test_el_correo_enmascarado_no_rompe_con_algo_invalido(malo):
    # Nunca debería llegar acá un correo inválido (ya lo filtró
    # normalizar_email antes), pero si llegara, no tiene que explotar.
    assert "@" not in enmascarar_correo(malo) or enmascarar_correo(malo) == malo


def test_el_registro_pendiente_vence_antes_que_el_codigo_de_telefono_dure_mas():
    """15 minutos, no 10: por correo hay que salir del casillero de mails,
    y eso tarda más que mirar un SMS que ya está en la pantalla."""
    assert VIGENCIA_PENDIENTE_MINUTOS == 15


def test_el_tope_de_intentos_del_registro_es_finito():
    assert MAX_INTENTOS_PENDIENTE == 5


def test_el_limite_de_reenvios_frena_antes_de_vencer_la_fila():
    assert MAX_REENVIOS_PENDIENTE == LIMITE_REENVIO_PENDIENTE.cuantos

    revisar_limite(LIMITE_REENVIO_PENDIENTE.cuantos - 1, LIMITE_REENVIO_PENDIENTE)
    with pytest.raises(FrenoActivado):
        revisar_limite(LIMITE_REENVIO_PENDIENTE.cuantos, LIMITE_REENVIO_PENDIENTE)
