"""Mandar un código a un teléfono, por el canal que sea.

El proveedor de hoy es Dexatel y el canal de hoy es el SMS. Los dos están
detrás de esta puerta chica a propósito, y esa decisión ya se pagó sola:
Twilio cerró la cuenta apenas se pagó el primer plan, y cambiar de proveedor
costó reescribir este archivo, nada más.

Por qué no Twilio, para que no se intente de nuevo: prohíben el tráfico de
apuestas en sus rutas de Estados Unidos y Canadá, y aunque el nuestro va a
Ecuador, Argentina y Venezuela, la revisión se aplica a nivel de cuenta.
Vonage, Bird y Plivo tienen políticas equivalentes. Dexatel declara iGaming
entre los verticales que atiende.

Lo que mandamos es un OTP transaccional, no publicidad de apuestas: seis
dígitos para confirmar que alguien controla su teléfono. Esa distinción es
la que hay que sostener ante cualquier proveedor, y por eso el texto no
lleva enlaces, ni marca, ni la palabra apuestas.

No se usa ningún SDK: la API es un POST con una cabecera, y `httpx` ya es
dependencia del proyecto. Una dependencia menos que auditar y actualizar.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import httpx

log = logging.getLogger("casino")

SMS = "sms"
WHATSAPP = "whatsapp"

DEXATEL_API = "https://api.dexatel.com/v1/messages"
# El OTP de WhatsApp no es un mensaje: es una verificación. Dexatel las separa
# en un recurso propio (`/reference/verify-create-verification`), con su
# propio contrato (plantilla en vez de texto libre, `code` en vez de `text`).
# Mandar un OTP de WhatsApp por `/v1/messages` es el error que corrige este
# módulo: servía para un mensaje común, pero un OTP de WhatsApp exige una
# plantilla aprobada por Meta y ese endpoint no la acepta.
DEXATEL_VERIFICATIONS_API = "https://api.dexatel.com/v1/verifications"
TIEMPO_LIMITE = 15

# Cómo nombra Dexatel a cada canal en el cuerpo del pedido. Mayúsculas en los
# dos endpoints: la referencia de `/v1/verifications` lista `WHATSAPP` como
# único valor válido (la guía de "get started" lo muestra en minúsculas, pero
# la referencia manda).
_CANAL_DEL_PROVEEDOR = {SMS: "SMS", WHATSAPP: "WHATSAPP"}


class MensajeriaNoConfigurada(RuntimeError):
    """Falta una credencial. Se falla cerrado: mejor no registrar a nadie que
    dejar cuentas a medio verificar esperando un mensaje que no salió."""


class SinRemitenteParaPais(MensajeriaNoConfigurada):
    """No hay remitente activo para el país de destino, ni remitente por
    defecto del canal, ni variable de entorno de respaldo. Se nombra el país
    en el mensaje porque es lo único que le dice al dueño qué hacer: "no
    pudimos enviarte el código" no dice nada, "no tenemos remitente
    habilitado para Ecuador" dice exactamente qué falta."""


class EnvioFallido(RuntimeError):
    """El proveedor rechazó el mensaje. El detalle va al registro, no a la
    persona: no sirve de nada y puede filtrar cómo está armado el sistema."""


@dataclass(frozen=True)
class Credenciales:
    clave: str
    remitente_sms: str
    remitente_whatsapp: str = ""
    # UUID de la plantilla aprobada por Meta que contiene `{code}`. Sin ella
    # no hay forma de mandar un OTP de WhatsApp: el texto libre no se acepta
    # en `/v1/verifications`.
    plantilla_whatsapp: str = ""

    @property
    def sms_listo(self) -> bool:
        return bool(self.clave and self.remitente_sms)

    @property
    def whatsapp_listo(self) -> bool:
        return bool(self.clave and self.remitente_whatsapp and self.plantilla_whatsapp)


def credenciales_del_entorno() -> Credenciales:
    return Credenciales(
        clave=os.environ.get("DEXATEL_API_KEY", ""),
        remitente_sms=os.environ.get("DEXATEL_SMS_FROM", ""),
        remitente_whatsapp=os.environ.get("DEXATEL_WHATSAPP_FROM", ""),
        plantilla_whatsapp=os.environ.get("DEXATEL_WHATSAPP_TEMPLATE", ""),
    )


def elegir_remitente(remitentes: list[dict], pais: str, respaldo: str,
                     pais_nombre: str | None = None) -> str:
    """Cuál remitente usar para mandar a `pais`, sin tocar red ni base.

    `remitentes` son las filas activas de un solo canal, ya leídas de
    `remitentes_mensajeria`: cada una `{"remitente": str, "paises": list[str]}`.
    `respaldo` es lo que ya resuelve `credenciales_mensajeria`/el entorno para
    ese canal — sigue funcionando igual que antes de que existiera esta tabla.

    Orden, tal cual lo fija el feature doc:
    1. El remitente activo cuyo listado de países incluya a `pais`.
    2. El remitente por defecto del canal (listado de países vacío).
    3. `respaldo`.
    4. Si nada de eso hay, falla cerrado nombrando el país.
    """
    for fila in remitentes:
        if pais in fila["paises"]:
            return fila["remitente"]
    for fila in remitentes:
        if not fila["paises"]:
            return fila["remitente"]
    if respaldo:
        return respaldo
    raise SinRemitenteParaPais(
        f"No tenemos remitente habilitado para {pais_nombre or pais}")


def canales_disponibles(cred: Credenciales | None = None) -> list[str]:
    """Qué canales se pueden ofrecer hoy. La pantalla pregunta esto: no
    tiene sentido mostrar WhatsApp si el remitente todavía no está aprobado."""
    cred = cred or credenciales_del_entorno()
    canales = []
    if cred.sms_listo:
        canales.append(SMS)
    if cred.whatsapp_listo:
        canales.append(WHATSAPP)
    return canales


def texto_del_codigo(codigo: str, minutos: int) -> str:
    """El mensaje que recibe la persona.

    Corto y sin enlaces: un mensaje con un enlace parece una estafa, y en
    varios países los operadores directamente lo bloquean. Tampoco menciona
    apuestas ni juego: es lo que hace que esto pase como OTP transaccional y
    no como publicidad de un vertical restringido.
    """
    return (f"Tu código de iaqp es {codigo}. "
            f"Vence en {minutos} minutos. No lo compartas con nadie.")


def _remitente(cred: Credenciales, canal: str) -> str:
    if canal == WHATSAPP:
        if not cred.whatsapp_listo:
            raise MensajeriaNoConfigurada("WhatsApp todavía no está habilitado")
        return cred.remitente_whatsapp
    if not cred.sms_listo:
        raise MensajeriaNoConfigurada("falta configurar el envío de SMS")
    return cred.remitente_sms


def _identificador(cuerpo) -> str:
    """El id que devuelve el proveedor, buscado sin confiar en una sola forma.

    La API de envío lo devuelve como `id` en la raíz, pero los webhooks usan
    `message_id`. Se prueban las formas plausibles y, si ninguna aparece, el
    envío igual se da por bueno: el mensaje salió, y quedarnos sin
    identificador no es motivo para negarle la cuenta a alguien.
    """
    if not isinstance(cuerpo, dict):
        return ""
    datos = cuerpo.get("data")
    if isinstance(datos, list) and datos:
        datos = datos[0]
    if isinstance(datos, dict):
        return str(datos.get("id") or datos.get("message_id") or "")
    return str(cuerpo.get("id") or cuerpo.get("message_id") or "")


async def enviar_codigo(telefono_e164: str, codigo: str, canal: str = SMS,
                        minutos: int = 10,
                        cred: Credenciales | None = None,
                        crudo: dict | None = None) -> str:
    """Manda el código y devuelve el identificador del mensaje.

    El código viaja acá y en ningún otro lado: nunca se registra en el log,
    porque el log lo lee mucha más gente que la base.

    `crudo`, si se pasa un diccionario, se llena con la respuesta tal cual
    la dio Dexatel (`status` y `cuerpo`). Nadie que solo quiera mandar un
    código lo necesita — por eso el default es `None` y no cambia nada del
    comportamiento de siempre —, pero el botón de "probar" del panel de
    admin sí: ahí el valor de la prueba es justamente ver la respuesta
    cruda del proveedor, no solo si salió bien o mal.
    """
    cred = cred or credenciales_del_entorno()
    desde = _remitente(cred, canal)

    # El número va sin el "+" en los dos endpoints: la referencia pide el
    # código de país sin espacios ni caracteres especiales, y su propio
    # ejemplo lo escribe así.
    numero = telefono_e164.lstrip("+")

    if canal == WHATSAPP:
        # `/v1/verifications`, no `/v1/messages`: un OTP de WhatsApp no es
        # texto libre, es una plantilla aprobada por Meta que contiene
        # `{code}`. El texto de `texto_del_codigo` no aplica acá — por eso
        # no se usa — y el código va en `code`, no en `text`.
        url = DEXATEL_VERIFICATIONS_API
        cuerpo = {
            "data": {
                "channel": _CANAL_DEL_PROVEEDOR[canal],
                "sender": desde,
                "phone": numero,
                "template": cred.plantilla_whatsapp,
                "code": codigo,
            }
        }
    else:
        # El cuerpo va envuelto en `data` y `to` es una lista, aunque
        # mandemos uno solo: la API acepta hasta diez destinatarios por
        # pedido. La página de "get started" muestra el JSON plano y sin
        # envolver; es incorrecta, y mandarlo así devuelve 400 con "Request
        # data is missing" (código 1007). La referencia de
        # /reference/messages-send es la buena.
        url = DEXATEL_API
        cuerpo = {
            "data": {
                "channel": _CANAL_DEL_PROVEEDOR[canal],
                "from": desde,
                "to": [numero],
                "text": texto_del_codigo(codigo, minutos),
            }
        }
    async with httpx.AsyncClient(timeout=TIEMPO_LIMITE) as client:
        r = await client.post(url, json=cuerpo,
                              headers={"X-Dexatel-Key": cred.clave,
                                       "Content-Type": "application/json"})

    if r.status_code >= 400:
        # Se registra el número y el motivo, nunca el código.
        log.error("[%s] %s -> %s: %s", canal.upper(), telefono_e164,
                  r.status_code, r.text[:200])
        if crudo is not None:
            crudo["status"] = r.status_code
            crudo["cuerpo"] = _cuerpo_o_texto(r)
        raise EnvioFallido(f"{r.status_code}")

    try:
        cuerpo = r.json()
    except ValueError:
        cuerpo = None
    if crudo is not None:
        crudo["status"] = r.status_code
        crudo["cuerpo"] = cuerpo if cuerpo is not None else r.text
    return _identificador(cuerpo) if cuerpo is not None else ""


def _cuerpo_o_texto(r):
    """El JSON del proveedor si lo mandó, o el texto crudo si no. Se usa
    solo para el canal `crudo`, nunca para lo que ve la persona."""
    try:
        return r.json()
    except ValueError:
        return r.text
