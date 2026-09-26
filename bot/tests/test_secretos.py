"""La caja fuerte de las credenciales de proveedor.

Lo que importa acá: que falle cerrado sin `SECRETOS_CLAVE` (nunca hay un
camino que guarde texto plano como respaldo), que cifrar y descifrar sean
la operación inversa una de la otra, y que la máscara nunca deje ver un
secreto corto casi entero.
"""

import base64
import os

import pytest

import secretos
from secretos import SinLlaveMaestra, cifrar, descifrar, enmascarar, hay_llave

LLAVE_VALIDA = base64.urlsafe_b64encode(os.urandom(32)).decode()


@pytest.fixture(autouse=True)
def sin_llave_por_defecto(monkeypatch):
    """Cada prueba arranca sin `SECRETOS_CLAVE`: la que la necesite la
    pone ella misma, a propósito."""
    monkeypatch.delenv("SECRETOS_CLAVE", raising=False)


# ── Falla cerrado sin llave maestra ───────────────────────────────

def test_hay_llave_es_false_sin_la_variable_de_entorno():
    assert hay_llave() is False


def test_cifrar_sin_llave_no_guarda_nada():
    """Es la garantía central: nunca hay un camino que devuelva el texto
    en claro cuando falta la llave. Falla, no degrada."""
    with pytest.raises(SinLlaveMaestra):
        cifrar("clave-secreta-de-dexatel")


def test_descifrar_sin_llave_tampoco_sigue_adelante():
    with pytest.raises(SinLlaveMaestra):
        descifrar("cualquier-cosa")


def test_llave_mal_formada_falla_cerrado(monkeypatch):
    """Una variable presente pero inválida no es mejor que ausente: sigue
    sin haber forma de cifrar ni descifrar."""
    monkeypatch.setenv("SECRETOS_CLAVE", "esto no es base64 valido ni por asomo")
    assert hay_llave() is False
    with pytest.raises(SinLlaveMaestra):
        cifrar("algo")


def test_llave_del_largo_incorrecto_falla_cerrado(monkeypatch):
    """16 bytes es una llave de AES-128 válida en general, pero no es lo
    que este módulo espera (AES-256, 32 bytes): se rechaza igual."""
    corta = base64.urlsafe_b64encode(os.urandom(16)).decode()
    monkeypatch.setenv("SECRETOS_CLAVE", corta)
    assert hay_llave() is False
    with pytest.raises(SinLlaveMaestra):
        cifrar("algo")


# ── El viaje de ida y vuelta ───────────────────────────────────────

def test_cifrar_y_descifrar_son_inversas(monkeypatch):
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE_VALIDA)

    original = "sk_live_dexatel_9a8b7c6d5e4f"
    guardado = cifrar(original)

    assert guardado != original
    assert original not in guardado
    assert descifrar(guardado) == original


def test_cada_cifrado_usa_un_nonce_distinto(monkeypatch):
    """Dos cifrados del mismo texto no pueden dar el mismo resultado: si
    dieran, alguien que vea la base podría notar que dos filas guardan el
    mismo secreto, y eso ya es una fuga."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE_VALIDA)

    a = cifrar("el mismo texto")
    b = cifrar("el mismo texto")

    assert a != b
    assert descifrar(a) == descifrar(b) == "el mismo texto"


def test_descifrar_con_otra_llave_no_devuelve_nada_usable(monkeypatch):
    """Si la llave maestra rota, lo viejo no se descifra con la nueva: es
    la garantía de que perder la llave vieja no deja las filas legibles
    por otra vía."""
    monkeypatch.setenv("SECRETOS_CLAVE", LLAVE_VALIDA)
    guardado = cifrar("dato sensible")

    otra_llave = base64.urlsafe_b64encode(os.urandom(32)).decode()
    monkeypatch.setenv("SECRETOS_CLAVE", otra_llave)

    with pytest.raises(Exception):
        descifrar(guardado)


# ── La máscara ───────────────────────────────────────────────────

def test_la_mascara_muestra_solo_las_puntas():
    assert enmascarar("e2119a8b7c6d5194") == "e211…5194"


def test_un_secreto_corto_no_se_enmascara_proporcionalmente():
    """Con 4+4, un secreto de 8 caracteres queda completo a la vista y uno
    de 6 casi entero. Por debajo del mínimo, todos comparten el mismo
    placeholder fijo, que no dice ni el largo real."""
    assert enmascarar("ab12cd") == secretos._PLACEHOLDER_CORTO
    assert enmascarar("1234567") == secretos._PLACEHOLDER_CORTO
    assert "ab12cd" not in enmascarar("ab12cd")


def test_la_mascara_nunca_contiene_el_secreto_completo():
    for secreto in ("corto", "12345678", "sk_live_dexatel_9a8b7c6d5e4f9182736"):
        assert secreto not in enmascarar(secreto)
