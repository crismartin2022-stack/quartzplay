"""La caja fuerte: cifra y descifra las credenciales de los proveedores
antes de que toquen la base.

Por qué existe: mover las credenciales de SMS y correo de las variables de
entorno de Railway a una tabla editable desde el panel agranda la
superficie de ataque. Quien se lleve un volcado de la base, o entre por una
inyección SQL, no debería llevarse nada usable. Por eso el valor nunca se
guarda en claro: se cifra acá, con AES-GCM, y la llave maestra
(`SECRETOS_CLAVE`) vive solo en el entorno, nunca en la base.

Generar una llave nueva:
    python3 -c "import os, base64; print(base64.urlsafe_b64encode(os.urandom(32)).decode())"

Eso da 32 bytes al azar en base64 urlsafe (AES-256). Se pone en
`SECRETOS_CLAVE` del entorno del bot, no en la base ni en el repo.

Si `SECRETOS_CLAVE` falta o está mal formada, este módulo falla cerrado:
nunca hay un camino que guarde texto plano como respaldo. Es la misma
decisión que ya rige en `mensajeria.py` y `correo.py` para las
credenciales en sí: mejor no guardar nada que guardar algo a medias.
"""

from __future__ import annotations

import base64
import os

from cryptography.hazmat.primitives.ciphers.aead import AESGCM

# AES-256: 32 bytes de llave. AES-GCM pide un nonce de 12 bytes, el tamaño
# recomendado por la propia biblioteca (evita la reutilización que rompe la
# seguridad del modo GCM).
_LARGO_LLAVE = 32
_LARGO_NONCE = 12

_VAR_LLAVE = "SECRETOS_CLAVE"

# Cuánto se muestra de un secreto enmascarado, y qué se devuelve cuando es
# demasiado corto para enmascarar por longitud sin filtrar casi todo el
# valor (un secreto de 6 caracteres mostrando 4+4 ya lo revela entero).
_LARGO_VISIBLE = 4
_LARGO_MINIMO_PARA_ENMASCARAR = 8
_PLACEHOLDER_CORTO = "••••"


class SinLlaveMaestra(RuntimeError):
    """Falta `SECRETOS_CLAVE` o no tiene la forma esperada. Se falla cerrado:
    ni cifrar ni descifrar siguen adelante sin una llave válida, y no hay
    ningún camino alternativo que escriba el valor en claro."""


def _llave() -> bytes:
    crudo = os.environ.get(_VAR_LLAVE, "")
    if not crudo:
        raise SinLlaveMaestra(f"falta la variable de entorno {_VAR_LLAVE}")
    try:
        llave = base64.urlsafe_b64decode(crudo)
    except Exception as e:
        raise SinLlaveMaestra(
            f"{_VAR_LLAVE} no es base64 urlsafe válido") from e
    if len(llave) != _LARGO_LLAVE:
        raise SinLlaveMaestra(
            f"{_VAR_LLAVE} debe decodificar a {_LARGO_LLAVE} bytes "
            f"(AES-256), no {len(llave)}")
    return llave


def hay_llave() -> bool:
    """Si hay una llave maestra válida, sin que llamarlo tenga efecto
    alguno. La pantalla lo usa para avisar antes de que alguien intente
    guardar algo que de todos modos va a rechazarse."""
    try:
        _llave()
        return True
    except SinLlaveMaestra:
        return False


def cifrar(texto: str) -> str:
    """Cifra `texto` y devuelve un string listo para guardar en la base.

    El nonce es al azar por cada valor y viaja pegado al principio del
    resultado: AES-GCM lo necesita para descifrar y no hace falta guardarlo
    en una columna aparte. Reusar un nonce con la misma llave es lo que
    rompe la seguridad de GCM, así que sale de `os.urandom` en cada llamada,
    nunca de un contador ni de algo derivado del texto.
    """
    llave = _llave()
    nonce = os.urandom(_LARGO_NONCE)
    cifrado = AESGCM(llave).encrypt(nonce, texto.encode("utf-8"), None)
    return base64.urlsafe_b64encode(nonce + cifrado).decode("ascii")


def descifrar(guardado: str) -> str:
    """La operación inversa de `cifrar`. Si la llave cambió, el valor está
    corrupto, o alguien lo tocó a mano en la base, `InvalidTag` es la señal
    de GCM de que no hay que confiar en el resultado: se deja subir tal
    cual, para que quien llame decida (nunca se devuelve un texto a medias
    ni se cae a un valor por defecto)."""
    llave = _llave()
    crudo = base64.urlsafe_b64decode(guardado)
    nonce, cifrado = crudo[:_LARGO_NONCE], crudo[_LARGO_NONCE:]
    texto = AESGCM(llave).decrypt(nonce, cifrado, None)
    return texto.decode("utf-8")


def enmascarar(texto: str) -> str:
    """Lo único del secreto que puede volver a una pantalla: los primeros
    y los últimos caracteres, nunca el medio.

    Por debajo de `_LARGO_MINIMO_PARA_ENMASCARAR` mostrar 4+4 revelaría el
    valor casi entero (o entero: un secreto de 8 caracteres con 4+4 no deja
    nada oculto), así que esos casos devuelven un placeholder fijo que no
    dice nada sobre el largo real.
    """
    if len(texto) < _LARGO_MINIMO_PARA_ENMASCARAR:
        return _PLACEHOLDER_CORTO
    return f"{texto[:_LARGO_VISIBLE]}…{texto[-_LARGO_VISIBLE:]}"
