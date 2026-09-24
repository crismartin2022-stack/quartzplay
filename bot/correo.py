"""Mandar el código de verificación por correo.

Es la puerta chica del correo, hermana de `mensajeria.py`: mismo problema
(un código que tiene que llegar y nunca quedar en el registro), mismo
proveedor por HTTP y misma decisión de fallar cerrado si falta la
credencial. El proveedor de hoy es Resend, con un POST simple y
autenticado por token; no hace falta su SDK, y `httpx` ya es dependencia
del proyecto.
"""

from __future__ import annotations

import logging
import os
from dataclasses import dataclass

import httpx

log = logging.getLogger("casino")

RESEND_API = "https://api.resend.com/emails"
TIEMPO_LIMITE = 15

# El escape para probar el flujo en staging antes de pagar el proveedor.
# Con esto activo, el código se escribe en el log en vez de mandarse de
# verdad: nunca es el comportamiento por defecto, porque un correo que
# "sale" y no llega es peor que uno que avisa claro que no puede salir.
MODO_CONSOLA = "consola"


class CorreoNoConfigurado(RuntimeError):
    """Falta una credencial. Se falla cerrado: mejor no crear la cuenta que
    dejarla esperando un correo que nunca va a salir."""


class EnvioFallido(RuntimeError):
    """El proveedor rechazó el correo. El detalle va al registro, no a la
    persona: no sirve de nada y puede filtrar cómo está armado el sistema."""


@dataclass(frozen=True)
class Credenciales:
    api_key: str
    desde: str
    # Vacío en producción. Solo vale "consola", y solo si alguien lo puso
    # a propósito.
    modo: str = ""

    @property
    def listo(self) -> bool:
        return bool(self.api_key and self.desde)

    @property
    def modo_consola(self) -> bool:
        return self.modo == MODO_CONSOLA


def credenciales_del_entorno() -> Credenciales:
    return Credenciales(
        api_key=os.environ.get("RESEND_API_KEY", ""),
        desde=os.environ.get("CORREO_DESDE", ""),
        modo=os.environ.get("CORREO_MODO", ""),
    )


def hay_proveedor(cred: Credenciales | None = None) -> bool:
    """Si hay con qué mandar un correo de verdad, o al menos con qué
    simularlo en modo consola. La pantalla puede preguntar esto antes de
    ofrecer el registro por correo."""
    cred = cred or credenciales_del_entorno()
    return cred.listo or cred.modo_consola


def texto_del_codigo(codigo: str, minutos: int) -> str:
    """El mensaje que recibe la persona.

    Sin enlaces, por la misma razón que el SMS: un correo con un enlace
    entra derecho a spam y además parece phishing, que es justo lo que un
    código de verificación no se puede permitir parecer.
    """
    return (f"Tu código de iaqp es {codigo}. "
            f"Vence en {minutos} minutos. No lo compartas con nadie.")


async def enviar_codigo(correo: str, codigo: str,
                        minutos: int = 15,
                        cred: Credenciales | None = None) -> str:
    """Manda el código y devuelve el identificador del mensaje.

    El código viaja acá y en ningún otro lado: nunca se registra en el log,
    salvo que alguien haya prendido a propósito el modo consola de
    staging, que existe justamente para eso.
    """
    cred = cred or credenciales_del_entorno()

    if cred.modo_consola:
        log.warning(
            "[CORREO] modo consola activo: el código NO se está mandando "
            "de verdad. No usar en producción.")
        log.info("[CORREO] (consola) código para %s: %s", correo, codigo)
        return "consola"

    if not cred.listo:
        raise CorreoNoConfigurado("falta configurar el envío de correo")

    datos = {
        "from": cred.desde,
        "to": [correo],
        "subject": "Tu código de verificación",
        "text": texto_del_codigo(codigo, minutos),
    }
    headers = {"Authorization": f"Bearer {cred.api_key}"}
    async with httpx.AsyncClient(timeout=TIEMPO_LIMITE) as client:
        r = await client.post(RESEND_API, json=datos, headers=headers)

    if r.status_code >= 400:
        # Se registra el correo y el motivo, nunca el código.
        log.error("[CORREO] %s -> %s: %s", correo, r.status_code, r.text[:200])
        raise EnvioFallido(f"{r.status_code}")

    return (r.json() or {}).get("id", "")
