"""Registro público desde el navegador: normalización, frenos y códigos.

Este módulo no habla con Google ni con Twilio: solo decide. Se puede probar
entero sin red y sin credenciales, que es justamente lo que se quiere de la
parte que protege el dinero y las cuentas.
"""

from __future__ import annotations

import hashlib
import hmac
import secrets
from dataclasses import dataclass


# ── Teléfonos ────────────────────────────────────────────────────
#
# Mercados iniciales: Ecuador, Argentina y Venezuela.
#
# Esto NO se resuelve a mano. El primer intento de este módulo armaba el
# número con reglas propias y producía `+54 11...` para los móviles
# argentinos, cuando el formato internacional exige un 9 de más
# (`+549 11...`). Con ese número, ni el SMS ni el WhatsApp llegan jamás. La
# biblioteca de Google conoce esa regla y las de cada país, y además sabe
# distinguir un móvil de un fijo, que es la otra mitad del problema: a un
# teléfono fijo el código nunca va a llegar.

import phonenumbers
from phonenumbers import NumberParseException, PhoneNumberType

PAISES = {
    "EC": "Ecuador",
    "AR": "Argentina",
    "VE": "Venezuela",
}

# Un número puede ser claramente móvil, o de los que el país no distingue.
# Los dos sirven; un fijo, no.
TIPOS_QUE_RECIBEN = (PhoneNumberType.MOBILE, PhoneNumberType.FIXED_LINE_OR_MOBILE)


class TelefonoInvalido(ValueError):
    """El número no sirve para mandar un código."""


def normalizar_telefono(crudo: str, pais: str) -> str:
    """Devuelve el número en formato internacional, o explica por qué no.

    El país lo elige la persona en la pantalla: adivinarlo por el número es
    una fuente de errores silenciosos, y un código que se manda al país
    equivocado no llega nunca.
    """
    if pais not in PAISES:
        raise TelefonoInvalido("país no habilitado")
    if not (crudo or "").strip():
        raise TelefonoInvalido("falta el teléfono")

    try:
        numero = phonenumbers.parse(crudo, pais)
    except NumberParseException:
        raise TelefonoInvalido("ese número no se entiende")

    if not phonenumbers.is_valid_number(numero):
        raise TelefonoInvalido(f"no parece un número de {PAISES[pais]}")

    if phonenumbers.number_type(numero) not in TIPOS_QUE_RECIBEN:
        raise TelefonoInvalido("hace falta un celular: a un fijo no le llega el código")

    return phonenumbers.format_number(numero, phonenumbers.PhoneNumberFormat.E164)


def normalizar_email(crudo: str) -> str:
    """Minúsculas y sin espacios. No valida que exista: eso lo dice Google."""
    limpio = (crudo or "").strip().lower()
    if "@" not in limpio or limpio.startswith("@") or limpio.endswith("@"):
        raise ValueError("correo inválido")
    return limpio


# ── Códigos ──────────────────────────────────────────────────────

LARGO_CODIGO = 6
VIGENCIA_MINUTOS = 10
MAX_INTENTOS = 5


def generar_codigo() -> str:
    """Seis dígitos, con azar criptográfico.

    `secrets` y no `random`: el segundo es predecible si alguien ve unos
    cuantos códigos seguidos, y acá eso significa entrar a una cuenta ajena.
    """
    return f"{secrets.randbelow(10 ** LARGO_CODIGO):0{LARGO_CODIGO}d}"


def hash_codigo(codigo: str, telefono_e164: str, secreto: str) -> str:
    """El código nunca se guarda en claro.

    Va atado al teléfono: un hash robado de otra fila no sirve para este
    número. Y con un secreto del servidor, para que no alcance con tener la
    base.
    """
    mensaje = f"{telefono_e164}:{codigo}".encode()
    return hmac.new(secreto.encode(), mensaje, hashlib.sha256).hexdigest()


def codigo_coincide(esperado_hash: str, codigo: str,
                    telefono_e164: str, secreto: str) -> bool:
    calculado = hash_codigo(codigo, telefono_e164, secreto)
    return hmac.compare_digest(esperado_hash, calculado)


# ── El freno ─────────────────────────────────────────────────────
#
# Sin esto, cualquiera llama al endpoint en bucle y quema el crédito de SMS
# en una noche. Es el ataque más común contra un registro público, y cuesta
# dinero real desde el primer minuto.

@dataclass(frozen=True)
class Limite:
    cuantos: int
    en_minutos: int
    motivo: str


# Por número: tres códigos en una hora alcanzan de sobra para alguien que
# de verdad no los recibe, y cortan al que está probando.
LIMITE_POR_TELEFONO = Limite(3, 60, "Ya pediste varios códigos para ese número. Probá en un rato.")

# Por IP: más holgado, porque detrás de una misma salida a internet puede
# haber un locutorio o una oficina entera.
LIMITE_POR_IP = Limite(10, 60, "Demasiados intentos desde tu conexión. Probá más tarde.")

# Registros completos por IP. Son dos frenos, y cada uno ataja algo distinto.
#
# Los números están puestos mirando a quién dejan afuera. En Ecuador,
# Argentina y Venezuela la mayoría entra por datos móviles con CGNAT: cientos
# de personas comparten una misma IP pública. Un local con cinco muchachos en
# el mismo wifi es un caso normal, no un ataque. Un tope diario bajo rebota
# gente real y nadie se entera, porque el que se frustra no escribe a
# soporte: se va.
#
# El que de verdad ataja al bot es el freno corto. El bot registra rápido;
# la familia registra despacio.
LIMITE_REGISTROS_POR_IP = Limite(20, 60 * 24, "Demasiadas cuentas creadas desde tu conexión.")
LIMITE_RAFAGA_REGISTROS = Limite(3, 10, "Estás creando cuentas muy seguido. Esperá unos minutos.")


class FrenoActivado(Exception):
    """Se alcanzó un límite. El mensaje es para mostrarle a la persona."""

    def __init__(self, limite: Limite):
        super().__init__(limite.motivo)
        self.limite = limite


def revisar_limite(usados: int, limite: Limite) -> None:
    if usados >= limite.cuantos:
        raise FrenoActivado(limite)


# ── El candado del retiro ────────────────────────────────────────
#
# El registro es libre: entrar, depositar y jugar no piden teléfono. Retirar,
# sí. Así no hay cuentas fantasma cobrando, la fricción queda donde está el
# riesgo, y solo se paga el mensaje de quien de verdad va a mover plata.
#
# Esto vale para el que se registró solo. Al jugador que dio de alta una
# agencia lo avaló alguien: no se le cambian las reglas de un día para otro.

ORIGEN_WEB = "web"

MOTIVO_SIN_VERIFICAR = (
    "Para retirar necesitás verificar tu teléfono. "
    "Podés seguir depositando y jugando mientras tanto."
)


def requiere_telefono_verificado(origen_registro: str | None) -> bool:
    return (origen_registro or "") == ORIGEN_WEB


def puede_retirar(origen_registro: str | None,
                  telefono_verificado_at) -> tuple[bool, str]:
    """Dice si este jugador puede retirar, y por qué no si no puede.

    Devuelve el motivo ya escrito para mostrarle a la persona: si el mensaje
    se arma en la pantalla, tarde o temprano una pantalla dice una cosa y
    otra dice otra.
    """
    if not requiere_telefono_verificado(origen_registro):
        return True, ""
    if telefono_verificado_at:
        return True, ""
    return False, MOTIVO_SIN_VERIFICAR


def estado_de_verificacion(origen_registro: str | None,
                           telefono_verificado_at) -> dict:
    """Lo que la pantalla necesita para la marca del perfil y el aviso.

    Va servido desde el servidor y no deducido en el navegador: el candado
    de verdad está acá, y lo que se muestra tiene que decir lo mismo.
    """
    puede, motivo = puede_retirar(origen_registro, telefono_verificado_at)
    return {
        "telefono_verificado": bool(telefono_verificado_at),
        "requiere_verificacion": requiere_telefono_verificado(origen_registro),
        "puede_retirar": puede,
        "puede_depositar": True,
        "puede_jugar": True,
        "motivo": motivo,
    }


# ── El formulario ────────────────────────────────────────────────

import re

USUARIO_VALIDO = re.compile(r"[a-z0-9._-]{3,40}")

# Ocho y no seis, que es lo que pide el alta de mostrador. Allá la clave la
# elige un cajero frente a la persona y la cuenta no está expuesta; acá
# cualquiera puede probar claves desde internet, toda la noche.
LARGO_MINIMO_CLAVE = 8


class DatosInvalidos(ValueError):
    """Algo del formulario no sirve. El mensaje es para la persona."""


def validar_usuario(crudo: str) -> str:
    # Sin recortar: si alguien escribe de más y se lo cortamos en silencio,
    # se va con un usuario distinto del que eligió y no se entera hasta que
    # intenta entrar.
    usuario = (crudo or "").strip().lower()
    if not usuario:
        raise DatosInvalidos("Elegí un nombre de usuario")
    if not USUARIO_VALIDO.fullmatch(usuario):
        raise DatosInvalidos(
            "El usuario admite letras, números, punto, guion y guion bajo, "
            "de 3 a 40 caracteres")
    return usuario


def validar_clave(clave: str) -> str:
    if len(clave or "") < LARGO_MINIMO_CLAVE:
        raise DatosInvalidos(
            f"La clave necesita al menos {LARGO_MINIMO_CLAVE} caracteres")
    return clave


def validar_nombre(crudo: str) -> str:
    nombre = (crudo or "").strip()[:120]
    if len(nombre) < 2:
        raise DatosInvalidos("Decinos tu nombre")
    return nombre


def validar_edad_declarada(declaro: object) -> bool:
    """La edad se declara, no se verifica. Todavía.

    Se guarda la fecha de la declaración: el día que el negocio decida
    exigir una prueba, se sabe quién declaró qué y cuándo.
    """
    if declaro is not True:
        raise DatosInvalidos("Tenés que confirmar que sos mayor de edad")
    return True


def limpiar_referido(crudo: str) -> str:
    """El código de agencia que trajo al jugador. Opcional."""
    return (crudo or "").strip().upper()[:40]
