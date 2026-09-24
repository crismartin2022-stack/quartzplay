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
    TelefonoInvalido,
    codigo_coincide,
    generar_codigo,
    hash_codigo,
    normalizar_email,
    normalizar_telefono,
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
    ("1123456789", "CO"),       # país no habilitado
])
def test_un_numero_que_no_sirve_se_rechaza_con_motivo(malo, pais):
    with pytest.raises(TelefonoInvalido):
        normalizar_telefono(malo, pais)


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
