"""Atomic (agregador de slots): la parte que no toca base ni red.

Misma partición que `registro_proveedores.py`, `mensajeria.py` y
`registro_publico.py`: acá vive lo que se puede probar sin base de datos
(el dinero, el sobre de respuesta, cómo se lee un pedido, cómo se arman los
pedidos que le hacemos a Atomic). El pool, el registro de proveedores y los
endpoints viven en `casino_api.py`.

Lo que hay que saber del protocolo, todo verificado contra su documentación
y contra la producción de panel-multiskin:

- NO firman. El `api_key` viaja en el cuerpo; la defensa real es la lista
  blanca de IP (`registro_proveedores.ip_permitida`).
- Mandan y esperan DECIMALES en unidades mayores; nosotros guardamos
  centavos enteros. Toda conversión pasa por `Decimal`.
- Las respuestas llevan siempre `{status, balance, currency}` y siempre HTTP
  200, también los errores de negocio.
- No existe rollback, y es deliberado de su parte.
"""

from __future__ import annotations

import json
from dataclasses import dataclass, field
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from typing import Optional

# El valor de `casino_integraciones.adaptador` que enruta hacia este módulo.
ADAPTADOR = "atomic"

# Cuando el callback llega a la ruta sin código, se asume esta fila del
# registro. Producción y pruebas son dos filas distintas (`atomic` y
# `atomic_test`), cada una con su URL de callback, para que un pedido del
# sandbox nunca se lea con las credenciales de producción.
CODIGO_POR_DEFECTO = "atomic"


# ── Errores que devolvemos ─────────────────────────────────────

# El ÚNICO string de error que Atomic documenta. El juego sabe mostrarlo.
SALDO_INSUFICIENTE = "INSUFFICIENT_FUNDS"

# Todo lo demás lo inventamos NOSOTROS: Atomic no documenta ni un solo otro
# string, así que no sabemos cómo los muestra su lado. Se mantienen pocos y
# se nombran acá, en un único lugar, para que cuando Atomic confirme los
# suyos el cambio sea de una línea.
JUGADOR_INEXISTENTE = "PLAYER_NOT_FOUND"
JUGADOR_BLOQUEADO = "PLAYER_BLOCKED"
TRANSACCION_INVALIDA = "INVALID_TRANSACTION"
MONEDA_DISTINTA = "CURRENCY_MISMATCH"
SESION_AJENA = "SESSION_MISMATCH"
METODO_DESCONOCIDO = "UNKNOWN_METHOD"
CLAVE_INVALIDA = "INVALID_API_KEY"
PEDIDO_INVALIDO = "INVALID_REQUEST"
ERROR_INTERNO = "INTERNAL_ERROR"

ERRORES_PROPIOS = frozenset({
    JUGADOR_INEXISTENTE, JUGADOR_BLOQUEADO, TRANSACCION_INVALIDA,
    MONEDA_DISTINTA, SESION_AJENA, METODO_DESCONOCIDO, CLAVE_INVALIDA,
    PEDIDO_INVALIDO, ERROR_INTERNO,
})


# ── Dinero ─────────────────────────────────────────────────────

class MontoInvalido(ValueError):
    """El importe no es un número decimal utilizable."""


# Tope de cordura, en unidades mayores. No es un límite de negocio: evita
# que un `1e999999` malicioso o roto obligue a construir un entero enorme.
_MONTO_MAXIMO = Decimal("1e12")
_CIEN = Decimal(100)


def a_centavos(valor) -> int:
    """Decimal en unidades mayores -> centavos enteros.

    Con `Decimal` y redondeo explícito, NUNCA con float ni con `int(x*100)`:
    `10.07 * 100` da 1006.9999999999999 y `int()` lo corta en 1006. El
    panel-multiskin lo dejó escrito en su propio código después de pagarlo.

    Se acepta `Decimal`, `int`, `str` y `float` (el JSON del pedido se lee
    con `parse_float=Decimal`, así que en producción llega `Decimal`; el
    `float` queda por si alguien llama esto con un valor ya parseado, y se
    pasa por su texto más corto, que es el que escribió el proveedor).

    Más de dos decimales se redondean hacia arriba en el medio centavo. No
    se rechaza: no sabemos que Atomic lo prohíba, y rechazar una apuesta
    por eso deja al jugador con la ronda trabada.
    """
    if valor is None or isinstance(valor, bool):
        raise MontoInvalido("falta el importe")
    try:
        d = valor if isinstance(valor, Decimal) else Decimal(str(valor).strip())
    except InvalidOperation:
        raise MontoInvalido(f"importe no numérico: {valor!r}")
    if not d.is_finite():
        raise MontoInvalido(f"importe no finito: {valor!r}")
    if d < 0:
        raise MontoInvalido(f"importe negativo: {valor!r}")
    if d > _MONTO_MAXIMO:
        raise MontoInvalido(f"importe fuera de rango: {valor!r}")
    return int((d * _CIEN).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def a_texto_decimal(centavos: int) -> str:
    """Centavos enteros -> '10.07'. Exacto: no pasa por float."""
    return f"{Decimal(int(centavos)).scaleb(-2):.2f}"


# ── El sobre de respuesta ──────────────────────────────────────

def cuerpo_respuesta(centavos: int, moneda: str,
                     error: Optional[str] = None) -> str:
    """El JSON de respuesta, ya serializado.

    Se arma a mano y no con `json.dumps` sobre un dict porque `balance` tiene
    que salir como NÚMERO JSON con el valor exacto: `Decimal` no se
    serializa, y pasarlo por `float` reintroduce justo el error que
    `a_centavos` existe para evitar (y con montos grandes, imprime 1e+16).
    """
    saldo = a_texto_decimal(centavos)
    moneda_json = json.dumps(str(moneda or "").upper())
    if error:
        return (f'{{"status":"error","message":{json.dumps(error)},'
                f'"balance":{saldo},"currency":{moneda_json}}}')
    return f'{{"status":"ok","balance":{saldo},"currency":{moneda_json}}}'


# ── Cómo se lee un pedido ──────────────────────────────────────

# Lo que cada método hace con el saldo. Es la tabla más importante del
# módulo: `round_info` y `game_switch` NO están en `MUEVEN_PLATA`, y por eso
# ninguna ruta de código los puede tratar como movimiento. Tratar
# `round_info` como uno duplicaba cada apuesta en el panel.
MUEVEN_PLATA = {"bet": "debito", "win": "credito"}
INFORMATIVOS = frozenset({"session_info", "round_info", "game_switch"})
METODOS = frozenset(MUEVEN_PLATA) | INFORMATIVOS


def _texto(valor) -> Optional[str]:
    if valor is None:
        return None
    t = str(valor).strip()
    return t or None


def _como_bool(valor) -> bool:
    """'false' llega como texto a veces; `bool("false")` sería True."""
    if isinstance(valor, str):
        return valor.strip().lower() in ("1", "true", "yes", "si", "sí")
    return bool(valor)


@dataclass(frozen=True)
class Pedido:
    metodo: str
    api_key: str
    player_id: Optional[str]
    moneda: Optional[str]          # solo si el pedido la trae (bet/win no)
    monto: object                  # crudo: se convierte al usarlo
    transaccion: Optional[str]
    ronda: Optional[str]
    session_id: Optional[str]
    simbolo: Optional[str]
    es_freespin: bool
    cuerpo: dict = field(repr=False, default_factory=dict)

    @property
    def tipo(self) -> Optional[str]:
        """'debito' | 'credito' | None. None = no mueve plata."""
        return MUEVEN_PLATA.get(self.metodo)


def interpretar(cuerpo: dict) -> Pedido:
    """Lo mismo de siempre en un objeto: dónde vive cada dato según el método.

    `session_id` y el símbolo del juego llegan en `meta` para bet/win y a
    nivel superior para el resto, así que se busca en los dos lados.
    """
    meta = cuerpo.get("meta")
    if not isinstance(meta, dict):
        meta = {}
    moneda = _texto(cuerpo.get("currency"))
    return Pedido(
        metodo=str(cuerpo.get("method") or "").strip(),
        api_key=str(cuerpo.get("api_key") or ""),
        player_id=_texto(cuerpo.get("player_id")),
        moneda=moneda.upper() if moneda else None,
        monto=cuerpo.get("amount"),
        transaccion=_texto(meta.get("transaction")),
        ronda=_texto(meta.get("round_id") or cuerpo.get("round_id")),
        session_id=_texto(meta.get("session_id") or cuerpo.get("session_id")),
        simbolo=_texto(meta.get("symbol") or cuerpo.get("game_symbol")
                       or cuerpo.get("symbol")),
        es_freespin=_como_bool(meta.get("is_freespins")),
        cuerpo=cuerpo,
    )


def jugador_id_de(texto: Optional[str]) -> Optional[int]:
    """El `player_id` que mandamos al lanzar es nuestro id interno.

    Solo se acepta un entero: aceptar también el username sería aceptar
    justo lo que se decidió no usar (puede cambiar y dejar rondas
    huérfanas), y abriría un segundo camino de identidad sin dueño.
    """
    if texto and texto.isascii() and texto.isdigit() and len(texto) <= 18:
        return int(texto)
    return None


# ── round_info y game_switch: lo que se lee, nada que mueva saldo ──

@dataclass(frozen=True)
class RondaInfo:
    estado: Optional[str]              # 'start' | 'finish'
    apuesta_centavos: Optional[int]
    premio_centavos: Optional[int]
    tipo_apuesta: Optional[str]


def _centavos_o_none(valor) -> Optional[int]:
    try:
        return a_centavos(valor)
    except MontoInvalido:
        return None


def leer_ronda(cuerpo: dict) -> RondaInfo:
    """Importes de `round_info`. Que un importe venga roto no es motivo para
    fallar el pedido: es analítica, y la respuesta estándar igual se espera."""
    return RondaInfo(
        estado=_texto(cuerpo.get("status")),
        apuesta_centavos=_centavos_o_none(cuerpo.get("bet_amount")),
        premio_centavos=_centavos_o_none(cuerpo.get("win_amount")),
        tipo_apuesta=_texto(cuerpo.get("bet_type")),
    )


def ronda_que_no_cuadra(info: RondaInfo, debitos: int,
                        creditos: int) -> Optional[str]:
    """Al cerrar una ronda, compara lo que Atomic dice con lo que movimos.

    Devuelve el motivo si no cuadra, o None. No hay rollback, así que una
    ronda que quedó a medias la tiene que encontrar una persona: esta es la
    única señal que tenemos de una apuesta o un premio que Atomic dio por
    hecho y nosotros no. Solo se lee; no corrige nada.

    Puede dar un falso aviso si el cierre llega antes que el `win`: por eso
    el llamador lo registra como aviso y no como error.
    """
    if info.estado != "finish":
        return None
    motivos = []
    if (info.apuesta_centavos is not None
            and info.tipo_apuesta != "freespin"
            and debitos != info.apuesta_centavos):
        motivos.append(f"apuesta según Atomic {info.apuesta_centavos}, "
                       f"cobrada {debitos}")
    if info.premio_centavos is not None and creditos != info.premio_centavos:
        motivos.append(f"premio según Atomic {info.premio_centavos}, "
                       f"acreditado {creditos}")
    return "; ".join(motivos) or None


# ── Lo que le pedimos a Atomic ─────────────────────────────────

def idioma_de(texto) -> str:
    """Dos letras en minúscula, 'es' si no hay nada. Atomic asume `ru` si no
    se manda `lang`, y el juego abre en ruso."""
    t = str(texto or "").strip().lower()[:2]
    return t if len(t) == 2 and t.isalpha() else "es"


def payload_lanzamiento(*, partner: str, api_key: str, simbolo: str,
                        estudio: str, moneda: str, jugador_id, idioma,
                        demo: bool = False,
                        freespins: Optional[dict] = None) -> dict:
    """El cuerpo de `playGame.do`.

    `player_id` es el id interno, jamás el username: el username puede
    cambiar y dejaría las rondas históricas huérfanas.
    """
    cuerpo = {
        "symbol": simbolo,
        "provider": estudio,
        "currency": str(moneda).upper(),
        "partner": partner,
        "api_key": api_key,
        "player_id": str(jugador_id),
        "lang": idioma_de(idioma),
        "gametype": "demo" if demo else "real",
    }
    if freespins:
        cuerpo["freespins"] = freespins
    return cuerpo


def payload_catalogo(partner: str, api_key: str) -> dict:
    return {"partner": partner, "api_key": api_key}


def _slug(texto) -> Optional[str]:
    t = _texto(texto)
    if not t:
        return None
    return t.lower().replace(" ", "").replace("-", "")


@dataclass(frozen=True)
class JuegoAtomic:
    simbolo: str
    titulo: str
    estudio: Optional[str]   # lo que Atomic pide en `provider` al lanzar
    imagen: Optional[str]
    es_vivo: bool
    rtp: Optional[float]     # informativo: hoy no hay columna donde guardarlo


def extraer_juegos(datos) -> list[JuegoAtomic]:
    """La lista de `allgamelist`, que llega bajo `slots`.

    Los juegos que Atomic marca con `status` falso no se devuelven: un
    juego deshabilitado del lado de ellos no se puede lanzar, y ofrecerlo
    es prometerle al jugador una pantalla en blanco.

    El estudio sale de `provider_code`, que llega ANIDADO
    (`provider_code.provider_code` o `provider_name`), normalizado como lo
    hace el panel en producción: minúsculas, sin espacios ni guiones.
    """
    if not isinstance(datos, dict):
        return []
    lista = datos.get("slots")
    if not isinstance(lista, list):
        return []
    juegos = []
    for item in lista:
        if not isinstance(item, dict):
            continue
        simbolo = _texto(item.get("symbol"))
        if not simbolo:
            continue
        # `status` ausente = habilitado; falso o "0" = deshabilitado.
        if "status" in item and not _como_bool(item["status"]):
            continue
        codigo = item.get("provider_code")
        if isinstance(codigo, dict):
            codigo = codigo.get("provider_code") or codigo.get("provider_name")
        estudio = _slug(codigo) or _slug(item.get("provider"))
        categoria = str(item.get("category") or item.get("type") or "").lower()
        try:
            rtp = float(item["rtp"]) if item.get("rtp") not in (None, "") else None
        except (TypeError, ValueError):
            rtp = None
        juegos.append(JuegoAtomic(
            simbolo=simbolo,
            titulo=_texto(item.get("name")) or simbolo,
            estudio=estudio,
            imagen=_texto(item.get("imageurl")),
            es_vivo="live" in categoria,
            rtp=rtp,
        ))
    return juegos


# ── Giros gratis ───────────────────────────────────────────────

ACCIONES_FREESPINS = {"get": "freespins_get", "set": "freespins_set",
                      "delete": "freespins_delete"}


def payload_accion(metodo: str, *, partner: str, api_key: str, **extra) -> dict:
    """El cuerpo de `gameActions.do`. `metodo` tiene que ser uno conocido:
    un typo llegaría a Atomic como un método inexistente sin que nadie lo vea."""
    if metodo not in ACCIONES_FREESPINS.values():
        raise ValueError(f"método de giros gratis desconocido: {metodo!r}")
    return {"method": metodo, "partner": partner, "api_key": api_key, **extra}


@dataclass(frozen=True)
class RespuestaAccion:
    """Cómo terminó una llamada a `gameActions.do`.

    `desconocido` distingue dos fallos que no son lo mismo: un rechazo
    definitivo (4xx, o `status` distinto de ok) no cambió nada del otro
    lado; un timeout, un 5xx o un cuerpo que no es JSON pudo haberse
    aplicado igual. `freespins_set` REEMPLAZA, así que en el segundo caso
    hay que releer el estado antes de reintentar.
    """
    ok: bool
    desconocido: bool
    mensaje: str
    datos: dict = field(default_factory=dict)


def clasificar_accion(status_http: Optional[int], cuerpo_texto: str) -> RespuestaAccion:
    if status_http is None:
        return RespuestaAccion(False, True, "sin respuesta del proveedor")
    if 400 <= status_http < 500:
        return RespuestaAccion(False, False,
                               f"el proveedor rechazó el pedido ({status_http})")
    if status_http >= 500:
        return RespuestaAccion(False, True,
                               f"error del proveedor ({status_http})")
    try:
        datos = json.loads(cuerpo_texto)
    except ValueError:
        return RespuestaAccion(False, True, "respuesta que no es JSON")
    if not isinstance(datos, dict):
        return RespuestaAccion(False, True, "respuesta que no es un objeto")
    if datos.get("status") != "ok":
        return RespuestaAccion(False, False,
                               str(datos.get("message") or "rechazado"), datos)
    return RespuestaAccion(True, False, "ok", datos)


# ── Validar el pedido contra lo que sabemos del jugador ────────

def validar_contexto(pedido: Pedido, fila: Optional[dict],
                     monedas_proveedor: tuple) -> Optional[str]:
    """El código de error si el pedido no corresponde al jugador, o None.

    `fila` trae al jugador y, si la hay, la sesión que Atomic nombró
    (`ses_user`, `ses_moneda`). Devuelve un código y no lanza: la respuesta
    de error de Atomic lleva el saldo, así que quien llama tiene que poder
    armarla.

    La moneda se compara en tres lugares porque `bet` y `win` NO mandan
    `currency` (verificado contra su documentación): la del jugador, la de
    la sesión con que se lanzó el juego y las que el proveedor tiene
    habilitadas. Devolver un saldo en pesos que el otro lado lee como euros
    multiplicaría la plata del cliente por mil.
    """
    if fila is None:
        return JUGADOR_INEXISTENTE
    moneda = str(fila.get("moneda") or "ARS").upper()
    if pedido.moneda and pedido.moneda != moneda:
        return MONEDA_DISTINTA
    if monedas_proveedor and moneda not in monedas_proveedor:
        return MONEDA_DISTINTA
    if fila.get("ses_user") is not None:
        if fila["ses_user"] != fila["id"]:
            return SESION_AJENA
        moneda_sesion = fila.get("ses_moneda")
        if moneda_sesion and str(moneda_sesion).upper() != moneda:
            return MONEDA_DISTINTA
    return None
