"""Mandar un código a un teléfono, por el canal que sea.

El proveedor de hoy es Twilio y el canal de hoy es el SMS. Los dos están
detrás de esta puerta chica a propósito: WhatsApp entrega mejor en la región
—sobre todo en Venezuela, donde el SMS es el canal más frágil— y llega en
cuanto el remitente esté aprobado, sin tocar el resto del flujo.

No se usa el SDK de Twilio: su API de mensajes es un POST con autenticación
básica, y `httpx` ya es dependencia del proyecto. Una dependencia menos que
auditar y que actualizar.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import httpx

log = logging.getLogger("casino")

SMS = "sms"
WHATSAPP = "whatsapp"

TWILIO_API = "https://api.twilio.com/2010-04-01"
TIEMPO_LIMITE = 15


class MensajeriaNoConfigurada(RuntimeError):
    """Falta una credencial. Se falla cerrado: mejor no registrar a nadie que
    dejar cuentas a medio verificar esperando un mensaje que no salió."""


class EnvioFallido(RuntimeError):
    """El proveedor rechazó el mensaje. El detalle va al registro, no a la
    persona: no sirve de nada y puede filtrar cómo está armado el sistema."""


@dataclass(frozen=True)
class Credenciales:
    cuenta: str
    token: str
    remitente_sms: str
    remitente_whatsapp: str
    # Un "Messaging Service" es una bolsa de remitentes: Twilio elige el
    # mejor para cada país. Con tres países de reglas distintas es lo que
    # ellos mismos recomiendan, así que se acepta en vez del número suelto.
    servicio_mensajeria: str = ""

    @property
    def sms_listo(self) -> bool:
        return bool(self.cuenta and self.token
                    and (self.remitente_sms or self.servicio_mensajeria))

    @property
    def whatsapp_listo(self) -> bool:
        return bool(self.cuenta and self.token and self.remitente_whatsapp)


def credenciales_del_entorno() -> Credenciales:
    return Credenciales(
        cuenta=os.environ.get("TWILIO_ACCOUNT_SID", ""),
        token=os.environ.get("TWILIO_AUTH_TOKEN", ""),
        remitente_sms=os.environ.get("TWILIO_SMS_FROM", ""),
        remitente_whatsapp=os.environ.get("TWILIO_WHATSAPP_FROM", ""),
        servicio_mensajeria=os.environ.get("TWILIO_MESSAGING_SERVICE_SID", ""),
    )


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
    varios países los operadores directamente lo bloquean.
    """
    return (f"Tu código de iaqp es {codigo}. "
            f"Vence en {minutos} minutos. No lo compartas con nadie.")


def _destino(telefono_e164: str, canal: str) -> str:
    return f"whatsapp:{telefono_e164}" if canal == WHATSAPP else telefono_e164


def _remitente(cred: Credenciales, canal: str) -> str:
    if canal == WHATSAPP:
        if not cred.whatsapp_listo:
            raise MensajeriaNoConfigurada("WhatsApp todavía no está habilitado")
        return f"whatsapp:{cred.remitente_whatsapp}"
    if not cred.sms_listo:
        raise MensajeriaNoConfigurada("falta configurar el envío de SMS")
    # El servicio manda sobre el número suelto: si están los dos, es porque
    # alguien quiso que Twilio eligiera el remitente.
    return cred.servicio_mensajeria or cred.remitente_sms


async def enviar_codigo(telefono_e164: str, codigo: str, canal: str = SMS,
                        minutos: int = 10,
                        cred: Credenciales | None = None) -> str:
    """Manda el código y devuelve el identificador del mensaje.

    El código viaja acá y en ningún otro lado: nunca se registra en el log,
    porque el log lo lee mucha más gente que la base.
    """
    cred = cred or credenciales_del_entorno()
    desde = _remitente(cred, canal)

    url = f"{TWILIO_API}/Accounts/{cred.cuenta}/Messages.json"
    datos = {
        "To": _destino(telefono_e164, canal),
        "Body": texto_del_codigo(codigo, minutos),
    }
    # Con un Messaging Service no se manda remitente: lo elige Twilio.
    if desde.startswith("MG"):
        datos["MessagingServiceSid"] = desde
    else:
        datos["From"] = desde
    async with httpx.AsyncClient(timeout=TIEMPO_LIMITE) as client:
        r = await client.post(url, data=datos, auth=(cred.cuenta, cred.token))

    if r.status_code >= 400:
        # Se registra el número y el motivo, nunca el código.
        log.error("[SMS] %s -> %s: %s", telefono_e164, r.status_code, r.text[:200])
        raise EnvioFallido(f"{r.status_code}")

    return (r.json() or {}).get("sid", "")
