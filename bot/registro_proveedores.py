"""El registro de proveedores de casino: cómo se arma la configuración de
uno a partir de su fila y del entorno.

No toca la base ni la red. La lectura del registro y el caché viven en
`casino_api.py`, que ya es dueño del pool: es la misma partición que ya
rige entre `mensajeria.py` y `casino_api.py`, y por la misma razón, que
esto se pueda probar sin base.

`armar_proveedor`: la fila del registro gana, el entorno respalda.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Optional

log = logging.getLogger("proveedores")


# El único proveedor que existe hoy es 44neoluck, y las variables
# PROVEEDOR_* del entorno describen a ese y a ningún otro. Por eso el
# respaldo del entorno solo rige para este código: aplicarlo a un proveedor
# nuevo mezclaría la URL de una fila con la clave de otro proveedor.
PROVEEDOR_LEGADO = "44neoluck"
ADAPTADOR_LEGADO = "neoluck"


@dataclass(frozen=True)
class Proveedor:
    codigo: str
    adaptador: str
    activa: bool
    url: str
    api_code: str          # el id de operador ante el proveedor (X-Code, partner)
    api_secret: str        # la clave: es lo único cifrado en la base
    monedas: tuple
    ips_permitidas: tuple  # textos CIDR tal cual están guardados
    origen: str            # "base" o "entorno": de dónde salió, para el diagnóstico

    def completo(self) -> bool:
        """Lo mínimo para hablarle al proveedor. Sin las tres cosas no hay
        pedido firmado posible, y es mejor avisarlo que mandar uno vacío."""
        return bool(self.url and self.api_code and self.api_secret)


def monedas_de(texto) -> tuple:
    """'ars, cop' -> ('ARS', 'COP'). Mayúsculas porque el jugador trae la
    suya así y comparar sin normalizar deja fuera a quien la tiene distinta."""
    return tuple(m.strip().upper() for m in (texto or "").split(",") if m.strip())


def armar_proveedor(codigo: str, fila: Optional[dict], secreto: Optional[str],
                    entorno: Optional[dict] = None) -> Optional[Proveedor]:
    """Junta la fila del registro y, si corresponde, el entorno.

    `secreto` llega ya descifrado (o en claro, si es una fila vieja): este
    módulo no conoce la llave maestra a propósito, para que la única ruta
    de cifrado siga siendo `secretos.py`.

    Campo por campo la fila gana y el entorno respalda, igual que las
    credenciales de mensajería. Sin fila ni variables devuelve `None`, no
    un proveedor vacío: quien llama tiene que poder distinguir "no existe"
    de "existe y le falta un dato".
    """
    entorno = entorno if codigo == PROVEEDOR_LEGADO else None
    if fila is None:
        if not entorno or not any(
                entorno.get(k) for k in ("url", "code", "secret")):
            return None
        fila = {}
        origen = "entorno"
    else:
        origen = "base"
    entorno = entorno or {}

    return Proveedor(
        codigo=codigo,
        adaptador=fila.get("adaptador") or ADAPTADOR_LEGADO,
        # Sin fila no hay quien lo haya apagado: el entorno solo existe
        # cuando alguien lo quiere encendido.
        activa=bool(fila["activa"]) if "activa" in fila else True,
        url=(fila.get("url") or entorno.get("url") or "").rstrip("/"),
        api_code=fila.get("api_code") or entorno.get("code") or "",
        api_secret=secreto or entorno.get("secret") or "",
        monedas=(monedas_de(fila.get("monedas"))
                 or monedas_de(entorno.get("monedas")) or ("ARS",)),
        ips_permitidas=tuple(fila.get("ips_permitidas") or ()),
        origen=origen,
    )
