"""El registro de proveedores de casino: cómo se arma la configuración de
uno a partir de su fila y del entorno.

No toca la base ni la red (salvo `aplicar_una_vez`, que usa la conexión de
quien lo llama). La lectura del registro y el caché viven en
`casino_api.py`, que ya es dueño del pool: es la misma partición que ya
rige entre `mensajeria.py` y `casino_api.py`, y por la misma razón, que
esto se pueda probar sin base.

`armar_proveedor`: la fila del registro gana, el entorno respalda.
`ip_permitida`: lista blanca con rangos CIDR, IPv4 e IPv6, para los
callbacks que el proveedor nos hace.
`aplicar_una_vez`: idempotencia por clave con prefijo de proveedor, más un
segundo control por ronda, para que un callback nunca mueva plata dos veces.
"""

from __future__ import annotations

import ipaddress
import logging
from dataclasses import dataclass
from typing import Awaitable, Callable, Optional

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


# ── 2. Lista blanca de IP para los callbacks entrantes ──────────

def normalizar_redes(entradas) -> list[str]:
    """Valida lo que el admin escribió y lo deja en su forma canónica.

    Se valida al GUARDAR, no al usar: una entrada mal escrita que se
    descubre recién cuando un callback real falla es exactamente el falso
    aplomo que tenía la comparación de texto del panel. Un rango con bits
    de host encendidos (`10.0.0.5/24`) se rechaza en vez de corregirse
    solo, porque corregirlo ensancha el permiso sin que nadie lo decida.
    Una dirección suelta vale como su /32 (o /128).
    """
    if not isinstance(entradas, (list, tuple)):
        raise ValueError("ips_permitidas debe ser una lista")
    canonicas = []
    for crudo in entradas:
        texto = str(crudo).strip()
        if not texto:
            continue
        try:
            red = ipaddress.ip_network(texto, strict=True)
        except ValueError:
            raise ValueError(f"No es una IP ni un rango válido: {texto!r}")
        canonicas.append(str(red))
    # Sin repetidos y en orden estable, para que guardar dos veces lo
    # mismo no parezca un cambio.
    return sorted(set(canonicas))


def ips_del_pedido(x_forwarded_for: str, host: str,
                   saltos_confiables: Optional[int] = None) -> list:
    """Las direcciones que pueden ser el origen real del pedido.

    Detrás del proxy de la plataforma `request.client.host` es el proxy,
    así que se lee la cadena entera de `X-Forwarded-For`.

    `saltos_confiables=None` acepta cualquier entrada de la cadena. Es lo
    que pidió el diseño, pero tiene un costo que hay que decir: el
    cliente controla el principio de `X-Forwarded-For`, así que cualquiera
    puede escribir ahí una IP permitida y pasar. Con `saltos_confiables=N`
    solo cuenta la entrada que agregó el N-ésimo proxy de confianza contando
    desde la derecha, que es la única que el cliente no puede falsificar.
    Medido contra staging el 2026-09-30: **detrás de Railway ese riesgo no
    existe**. Su proxy descarta la `X-Forwarded-For` y la `X-Real-IP` que
    manda el cliente y las reescribe. Se probó una IP falsa al principio de
    la cadena, al final, y en `X-Real-IP`: ninguna sobrevivió. Lo que llega
    es siempre la IP real del cliente más el salto interno de Railway.

    Por eso `IP_PROXIES_CONFIABLES` queda apagado: hoy no hace falta.

    Pero la garantía es de la plataforma, no de este código. **Hay que
    volver a medir esto después de la migración a AWS**: un balanceador que
    agregue a la cadena en vez de reescribirla devuelve el agujero, y en
    silencio.
    """
    cadena = [p.strip() for p in (x_forwarded_for or "").split(",") if p.strip()]
    if saltos_confiables:
        candidatas = cadena[-saltos_confiables:][:1]
    else:
        candidatas = cadena + ([host] if host else [])
    resultado = []
    for texto in candidatas:
        try:
            ip = ipaddress.ip_address(texto)
        except ValueError:
            continue  # basura en la cabecera: no coincide con nada
        # ::ffff:1.2.3.4 es la misma máquina que 1.2.3.4; sin este paso
        # un proxy que habla IPv6 dejaría afuera a un rango IPv4 permitido.
        if isinstance(ip, ipaddress.IPv6Address) and ip.ipv4_mapped:
            ip = ip.ipv4_mapped
        resultado.append(ip)
    return resultado


def ip_permitida(ips: list, permitidas) -> tuple:
    """(acepta, motivo). El motivo va al log: sin él, un rechazo por lista
    vacía y uno por IP ajena se ven idénticos y se diagnostican mal.

    LISTA VACÍA = SE RECHAZA TODO. panel-multiskin hace lo contrario (deja
    pasar y avisa en el log) razonando que una variable olvidada no debería
    tumbar la integración. Acá se decide al revés por dos razones:

    - Estos endpoints se autentican solo con una clave en el cuerpo; la IP
      es la única otra defensa. Que borrar el valor la apague sin que nada
      falle a la vista es peor que un rechazo, que sí se ve enseguida.
    - El motivo del panel era la variable olvidada en un deploy. Acá la
      lista vive en la base y se edita sin desplegar: arreglar el olvido
      lleva segundos, y una fila nueva nace cerrada en vez de abierta.
    """
    if not permitidas:
        return False, "lista_vacia"
    redes = []
    for texto in permitidas:
        try:
            redes.append(ipaddress.ip_network(str(texto).strip(), strict=False))
        except ValueError:
            # Una entrada dañada (alguien tocó la base a mano) nunca
            # coincide; el resto de la lista sigue valiendo.
            log.error("[PROVEEDOR] entrada de lista blanca inválida: %r", texto)
    for ip in ips:
        for red in redes:
            # Comparar versiones distintas devuelve False, no error, pero
            # se filtra igual para que la intención quede escrita.
            if ip.version == red.version and ip in red:
                return True, "ok"
    return False, "ip_fuera_de_la_lista"


# ── 3. Idempotencia compartida ──────────────────────────────────

class TransaccionFaltante(ValueError):
    """El proveedor no mandó identificador de transacción."""


# Longitud máxima de la clave completa. `wallet_debito` corta a 80 en
# silencio; acá un identificador largo se rechaza, porque cortarlo puede
# hacer que dos transacciones distintas terminen con la misma clave.
_LARGO_MAXIMO_CLAVE = 120

# Cuánto tiempo hacia atrás mira el segundo control. Un reintento llega en
# segundos; ampliar la ventana no atrapa más reintentos, solo más apuestas
# legítimas idénticas dentro de una misma ronda (ver `buscar_previo`).
VENTANA_RONDA_SEGUNDOS = 120


def clave_idempotencia(proveedor: str, transaccion) -> str:
    """`atomic:<transaccion>`. El prefijo evita que dos proveedores que
    reparten ids del mismo estilo choquen entre sí.

    Si falta la transacción se RECHAZA. No se inventa una clave de
    reemplazo: panel-multiskin tenía un `uniqid()` de respaldo, entendió que
    una clave que cambia en cada intento no deduplica nada, y lo sacó. Una
    clave inventada protege justo cuando no hace falta y falla cuando sí.
    """
    texto = str(transaccion if transaccion is not None else "").strip()
    if not texto:
        raise TransaccionFaltante(
            f"{proveedor}: el pedido no trae identificador de transacción")
    clave = f"{proveedor}:{texto}"
    if len(clave) > _LARGO_MAXIMO_CLAVE:
        raise TransaccionFaltante(
            f"{proveedor}: el identificador de transacción es demasiado largo")
    return clave


@dataclass(frozen=True)
class Resultado:
    saldo_post: int
    repetido: bool
    por: str  # "ref" (mismo id), "ronda" (id nuevo, mismo movimiento) o "nuevo"


async def buscar_previo(conn, proveedor: str, ref: str, ronda: Optional[str],
                        tipo: str, monto: int,
                        ventana: int = VENTANA_RONDA_SEGUNDOS) -> Optional[Resultado]:
    """Si este movimiento ya se procesó, devuelve su resultado.

    Primero por la clave exacta (`casino_movimientos.ref`, con su índice
    único). Después, si hay ronda, por (proveedor, ronda, tipo, monto)
    dentro de una ventana corta: cubre el reintento que llega con un id
    nuevo, que no sabemos si ocurre (128 llamadas reales de Atomic no
    mostraron ninguno) pero que, si ocurre, duplica plata.

    El costo de ese segundo control es un falso positivo posible: dos
    apuestas legítimas del mismo monto dentro de la misma ronda (dos
    manos, dos fichas iguales) se leerían como un reintento y la segunda
    no se cobraría. Por eso la ventana es corta y por eso se deja un
    aviso en el log cada vez que dispara: si aparece en producción hay que
    mirar si fue un reintento o una jugada real antes de endurecerlo.
    """
    # Serializa dos pedidos idénticos concurrentes: sin el candado, ambos
    # leen "no existe" y ambos mueven plata; el índice único frenaría al
    # segundo, pero recién al insertar, con el saldo ya tocado.
    await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))", ref)

    previo = await conn.fetchrow(
        "SELECT saldo_post FROM casino_movimientos WHERE ref=$1", ref)
    if previo:
        return Resultado(int(previo["saldo_post"]), True, "ref")

    if ronda:
        # Segundo candado, siempre después del primero: el orden fijo
        # evita que dos pedidos se esperen mutuamente.
        await conn.execute("SELECT pg_advisory_xact_lock(hashtext($1))",
                           f"{proveedor}|{ronda}|{tipo}|{monto}")
        previo = await conn.fetchrow("""
            SELECT saldo_post FROM casino_movimientos
            WHERE proveedor=$1 AND ronda=$2 AND tipo=$3 AND monto=$4
              AND creado_en > NOW() - make_interval(secs => $5::int)
            ORDER BY id LIMIT 1
        """, proveedor, ronda, tipo, monto, ventana)
        if previo:
            log.warning("[PROVEEDOR] %s: mismo movimiento con id nuevo "
                        "(ronda=%s tipo=%s monto=%s): se trata como reintento",
                        proveedor, ronda, tipo, monto)
            return Resultado(int(previo["saldo_post"]), True, "ronda")
    return None


async def aplicar_una_vez(
        conn, proveedor: str, transaccion, tipo: str, monto: int,
        aplicar: Callable[[str], Awaitable[int]],
        ronda: Optional[str] = None) -> Resultado:
    """La primitiva que van a usar todos los callbacks que mueven plata.

    Tiene que llamarse DENTRO de `conn.transaction()`: el candado que
    serializa los reintentos es de transacción y se suelta al terminar.

    `aplicar(ref)` mueve el saldo, inserta el movimiento en
    `casino_movimientos` con esa `ref` (y con `proveedor` y `ronda`, para
    que el segundo control lo encuentre) y devuelve el saldo resultante.
    Si el movimiento ya existía NO se llama y se devuelve lo mismo que la
    primera vez, sin mover nada.
    """
    ref = clave_idempotencia(proveedor, transaccion)
    previo = await buscar_previo(conn, proveedor, ref, ronda, tipo, monto)
    if previo:
        return previo
    saldo = await aplicar(ref)
    return Resultado(int(saldo), False, "nuevo")
