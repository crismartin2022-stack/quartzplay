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
# Países habilitados: toda Latinoamérica. Ecuador, Argentina y Venezuela van
# primero porque son los mercados de lanzamiento; el resto, alfabético.
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

# (código ISO 3166-1, nombre en español, indicativo internacional). Es lo
# que sirve el selector de país de la pantalla de registro: la pantalla no
# decide esta lista, solo la pinta.
PAISES_LATAM = [
    ("EC", "Ecuador", "+593"),
    ("AR", "Argentina", "+54"),
    ("VE", "Venezuela", "+58"),
    ("BO", "Bolivia", "+591"),
    ("BR", "Brasil", "+55"),
    ("CL", "Chile", "+56"),
    ("CO", "Colombia", "+57"),
    ("CR", "Costa Rica", "+506"),
    ("CU", "Cuba", "+53"),
    ("SV", "El Salvador", "+503"),
    ("GT", "Guatemala", "+502"),
    ("HN", "Honduras", "+504"),
    ("MX", "México", "+52"),
    ("NI", "Nicaragua", "+505"),
    ("PA", "Panamá", "+507"),
    ("PY", "Paraguay", "+595"),
    ("PE", "Perú", "+51"),
    ("DO", "República Dominicana", "+1"),
    ("UY", "Uruguay", "+598"),
]

PAISES = {codigo: nombre for codigo, nombre, _ in PAISES_LATAM}


def paises_disponibles() -> list[dict]:
    """Lo que consume `GET /api/paises`. Sin bandera: la bandera es un
    dibujo, y de eso se encarga la pantalla, no el backend."""
    return [{"codigo": codigo, "nombre": nombre, "indicativo": indicativo}
             for codigo, nombre, indicativo in PAISES_LATAM]

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


# ── El registro pendiente ───────────────────────────────────────
#
# La cuenta no se crea al llenar el formulario: se crea recién cuando la
# persona confirma el código que le llegó por correo. Mientras tanto solo
# existe esta fila de espera, que vence sola y no cuenta como jugador en
# ningún lado.

VIGENCIA_PENDIENTE_MINUTOS = 15
MAX_INTENTOS_PENDIENTE = 5
MAX_REENVIOS_PENDIENTE = 3

# Reenviar en bucle sería pagarle a Resend por cada intento de alguien
# probando un correo ajeno. La fila entera vence en 15 minutos, así que el
# tope alcanza con un contador simple: no hace falta otra ventana de tiempo.
LIMITE_REENVIO_PENDIENTE = Limite(
    MAX_REENVIOS_PENDIENTE, VIGENCIA_PENDIENTE_MINUTOS,
    "Ya reenviamos el código varias veces. Esperá a que venza y empezá de nuevo.")


def generar_token_pendiente() -> str:
    """El identificador que viaja al navegador mientras el registro está a
    medio hacer. No es el id de la fila: ese lo sabe la base y numerarlo de
    a uno le regalaría a cualquiera cuántos registros a medio hacer hay."""
    return secrets.token_urlsafe(32)


def enmascarar_correo(correo: str) -> str:
    """Lo que se le muestra a la persona para confirmar que el código va al
    buzón correcto, sin repetirle el correo entero a quien mire la pantalla
    por encima del hombro."""
    local, arroba, dominio = (correo or "").partition("@")
    if not arroba or not local or not dominio:
        return correo or ""
    return f"{local[0]}•••@{dominio}"
