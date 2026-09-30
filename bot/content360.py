"""Content360 / Vivo360 (agregador de casino en vivo y slots): la parte que no
toca base ni red.

Misma partición que `atomic.py`: acá vive lo que se puede probar sin base de
datos (la firma, el dinero, el sobre de respuesta, qué hace cada tipo de
movimiento, cómo se arma el lanzamiento y cómo se lee el catálogo). El pool,
el registro de proveedores y los endpoints viven en `casino_api.py`.

Lo que hay que saber del protocolo, de su documentación
(dev-api.content360.games/docs) y de lo que pagó panel-multiskin:

- SÍ firman: HMAC-SHA256 en la cabecera `X-CONTENT-KEY`, con el api_key. Pero
  la firma real NO coincide con lo que documentan; el panel terminó probando
  once canonicalizaciones y sigue sin verificarse contra tráfico real. Por
  eso la validación no es una comparación sino un registro de
  canonicalizaciones (`CANONICALIZACIONES`) que se recorre en orden y que
  deja registrado cuál acertó o, si ninguna, con qué se comparó.
- Mandan y esperan DECIMALES en unidades mayores; nosotros guardamos
  centavos enteros. Toda conversión pasa por `Decimal` (ver `atomic.a_centavos`).
- Toda respuesta es HTTP 200; el resultado va en `code`.
- SÍ hay rollback (`type: rollback`), y el `conciliation` que hay que aplicar
  sin condiciones después de dos reintentos fallidos.
- `notification` NO mueve plata: es el catálogo de juegos.
"""

from __future__ import annotations

import hashlib
import hmac
import itertools
import json
import re
import unicodedata
from collections import Counter
from dataclasses import dataclass, field
from decimal import Decimal
from typing import Callable, Optional
from urllib.parse import parse_qsl, quote, quote_plus

# El dinero es el mismo que el de Atomic (decimal mayor <-> centavos enteros):
# una sola conversión probada es mejor que dos que se desvían con el tiempo.
from atomic import MontoInvalido, a_centavos, a_texto_decimal  # noqa: F401

# El valor de `casino_integraciones.adaptador` que enruta hacia este módulo.
ADAPTADOR = "content360"

# Cuando el callback llega a la ruta sin código, se asume esta fila del
# registro. Producción y pruebas son filas distintas (`content360` y
# `content360_test`), cada una con su clave, para que un pedido del sandbox
# nunca se firme-valide con la clave de producción.
CODIGO_POR_DEFECTO = "content360"


# ── Códigos de respuesta ───────────────────────────────────────

OK = 0
SALDO_INSUFICIENTE = 1
JUGADOR_INEXISTENTE = 2
NO_PROCESABLE = 3
FIRMA_INVALIDA = 4
ERROR_INTERNO = 99

# `notification` solo documenta 0 y 1: no tiene un código 4.
NOTIFICACION_RECHAZADA = 1

DESCRIPCIONES = {
    OK: "Success",
    SALDO_INSUFICIENTE: "Insufficient balance",
    JUGADOR_INEXISTENTE: "Player not found",
    NO_PROCESABLE: "Unprocessable",
    FIRMA_INVALIDA: "Invalid signature",
    ERROR_INTERNO: "Internal error",
}


def cuerpo_respuesta(codigo: int, *, descripcion: Optional[str] = None,
                     centavos: Optional[int] = None,
                     transaccion: Optional[str] = None) -> str:
    """El JSON de respuesta, ya serializado.

    Se arma a mano y no con `json.dumps` sobre un dict por la misma razón que
    en Atomic: `balance` tiene que salir como NÚMERO JSON con el valor exacto,
    y pasar un `Decimal` por `float` reintroduce el error que `a_centavos`
    existe para evitar.
    """
    partes = [f'"code":{int(codigo)}']
    texto = descripcion if descripcion is not None else DESCRIPCIONES.get(codigo)
    if texto:
        partes.append(f'"description":{json.dumps(texto)}')
    if centavos is not None:
        datos = [f'"balance":{a_texto_decimal(centavos)}']
        if transaccion:
            datos.append(f'"transaction":{json.dumps(str(transaccion))}')
        partes.append('"data":{' + ",".join(datos) + "}")
    return "{" + ",".join(partes) + "}"


# ── La firma ───────────────────────────────────────────────────

@dataclass(frozen=True)
class Firmable:
    """Lo que llegó, en todas las formas que alguna canonicalización pueda
    necesitar. Se arma una vez por pedido y las canonicalizaciones solo leen."""
    metodo: str                 # 'GET' | 'POST'
    crudo: str                  # cuerpo tal cual llegó (vacío en GET)
    consulta: str               # query string tal cual llegó, sin decodificar
    datos: dict = field(default_factory=dict)   # lo que se interpreta


def firmable_de(metodo: str, cuerpo: bytes, consulta: str) -> tuple:
    """(Firmable, error). El cuerpo de un POST se lee con `parse_float=Decimal`
    para que un `10.07` llegue exacto y se pueda re-serializar igual.

    Si el JSON no es un objeto no hay nada que firmar ni interpretar."""
    texto = cuerpo.decode("utf-8", errors="replace") if cuerpo else ""
    if metodo == "GET":
        datos = dict(parse_qsl(consulta, keep_blank_values=True))
        return Firmable("GET", "", consulta, datos), None
    try:
        datos = json.loads(texto, parse_float=Decimal)
    except ValueError:
        return Firmable(metodo, texto, consulta, {}), "el cuerpo no es JSON"
    if not isinstance(datos, dict):
        return Firmable(metodo, texto, consulta, {}), "el cuerpo no es un objeto"
    return Firmable(metodo, texto, consulta, datos), None


def _decimal_php(d: Decimal) -> str:
    """Como PHP escribe un float en un query string: 10.50 -> '10.5', 10.0 -> '10'."""
    return format(d.normalize(), "f")


def _escalar_query(v) -> Optional[str]:
    if v is None:
        return None
    if isinstance(v, bool):
        return "1" if v else "0"
    if isinstance(v, Decimal):
        return _decimal_php(v)
    return str(v)


def _codificar(texto: str, rfc3986: bool) -> str:
    if rfc3986:
        return quote(texto, safe="")
    # `urlencode` de PHP codifica la tilde; `quote_plus` de Python no.
    return quote_plus(texto, safe="").replace("~", "%7E")


def construir_consulta(datos: dict, *, ordenar: bool = True,
                       rfc3986: bool = False) -> str:
    """`http_build_query` de PHP: espacio como '+', booleanos como 1/0, los
    nulos se omiten y lo anidado va como `a[b]=c`. Es lo que su documentación
    llama "a standard URL-encoded query string", y la forma en que hay que
    firmar el lanzamiento (lo confirmó su soporte)."""
    pares: list = []

    def aplanar(valor, clave):
        if isinstance(valor, dict):
            for k, v in (sorted(valor.items()) if ordenar else valor.items()):
                aplanar(v, f"{clave}[{k}]")
        elif isinstance(valor, (list, tuple)):
            for i, v in enumerate(valor):
                aplanar(v, f"{clave}[{i}]")
        else:
            texto = _escalar_query(valor)
            if texto is not None:
                pares.append(f"{_codificar(clave, rfc3986)}="
                             f"{_codificar(texto, rfc3986)}")

    for k, v in (sorted(datos.items()) if ordenar else datos.items()):
        aplanar(v, str(k))
    return "&".join(pares)


def json_php(valor, *, ordenar: bool = True, unicode_crudo: bool = True,
             barras_escapadas: bool = True, numeros: str = "tal_cual") -> str:
    """`json_encode` de PHP, con sus cuatro diferencias posibles frente a las
    de Python, que son justo las que cambian una firma:

    - orden de las claves (`ksort` antes de serializar);
    - `JSON_UNESCAPED_UNICODE` (su documentación lo nombra);
    - las barras: PHP escribe `\\/` salvo `JSON_UNESCAPED_SLASHES`;
    - los números: `tal_cual` conserva el texto decimal que llegó; `php`
      escribe un float entero como `10.0`.

    Sin espacios, como documentan ("unspaced JSON string").
    """
    def enc(v) -> str:
        if v is None:
            return "null"
        if isinstance(v, bool):
            return "true" if v else "false"
        if isinstance(v, int):
            return str(v)
        if isinstance(v, Decimal):
            if numeros == "php" and v == v.to_integral_value():
                return format(v.normalize(), "f") + ".0"
            return format(v, "f") if numeros == "tal_cual" else format(v.normalize(), "f")
        if isinstance(v, dict):
            if not v:
                return "[]"   # un array vacío de PHP no distingue objeto de lista
            items = sorted(v.items()) if ordenar else v.items()
            return "{" + ",".join(f"{enc(str(k))}:{enc(x)}" for k, x in items) + "}"
        if isinstance(v, (list, tuple)):
            return "[" + ",".join(enc(x) for x in v) + "]"
        texto = json.dumps(str(v), ensure_ascii=not unicode_crudo)
        # Una "/" en JSON válido solo puede estar dentro de un string.
        return texto.replace("/", "\\/") if barras_escapadas else texto

    return enc(valor)


def hmac_sha256(cadena: str, secreto: str) -> str:
    return hmac.new(secreto.encode(), cadena.encode(), hashlib.sha256).hexdigest()


# Una canonicalización recibe lo que llegó y devuelve el texto sobre el que se
# calcularía el HMAC, o None si no aplica a este pedido.
Canonicalizacion = Callable[[Firmable], Optional[str]]


def _sin(datos: dict, *claves) -> dict:
    return {k: v for k, v in datos.items() if k not in claves}


def _json_variantes():
    """Las combinaciones de `json_php`. La PRIMERA es la documentada: claves
    ordenadas, JSON compacto, `JSON_UNESCAPED_UNICODE` y nada más (o sea, con
    las barras escapadas). Las demás son la red de seguridad."""
    documentada = dict(ordenar=True, unicode_crudo=True,
                       barras_escapadas=True, numeros="tal_cual")
    combos = [documentada]
    for ordenar, unicode_crudo, barras, nums in itertools.product(
            (True, False), (True, False), (True, False), ("tal_cual", "php")):
        combo = dict(ordenar=ordenar, unicode_crudo=unicode_crudo,
                     barras_escapadas=barras, numeros=nums)
        if combo != documentada:
            combos.append(combo)
    for combo in combos:
        nombre = ("json:orden={o},unicode={u},barras={b},num={n}".format(
            o=int(combo["ordenar"]), u="crudo" if combo["unicode_crudo"] else "\\u",
            b="esc" if combo["barras_escapadas"] else "lit", n=combo["numeros"]))
        yield nombre, (lambda f, c=combo: json_php(f.datos, **c))


def _registro() -> list:
    """Orden = prioridad. Primero las dos documentadas (query para GET, JSON
    para POST), porque son las que tienen que acertar y no se pagan veinte
    HMAC por apuesta. Después todo lo que el panel probó y lo que se le
    puede ocurrir a un PHP que firma distinto de lo que documenta.

    PARA AGREGAR UNA FORMA NUEVA: una función `Firmable -> str | None` y una
    línea acá. Nada más del módulo ni de los endpoints cambia."""
    doc_query = ("query:orden=1", lambda f: construir_consulta(f.datos))
    doc_json = next(_json_variantes())
    # Las posiciones 0 y 1 son contrato: `canonicalizaciones_para` las
    # intercambia según el método.
    reg: list = [doc_query, doc_json]
    reg += [
        ("query:orden=0", lambda f: construir_consulta(f.datos, ordenar=False)),
        ("query:rfc3986", lambda f: construir_consulta(f.datos, rfc3986=True)),
        ("query:sin_session_token",
         lambda f: construir_consulta(_sin(f.datos, "session_token"))),
        ("query:sin_action",
         lambda f: construir_consulta(_sin(f.datos, "action"))),
        ("cuerpo_crudo", lambda f: f.crudo or None),
        ("consulta_cruda", lambda f: f.consulta or None),
    ]
    reg += list(_json_variantes())[1:]
    # Las dos últimas del panel: solo los valores, sin claves. Se ignoran los
    # valores anidados (`extra_data`), que en PHP reventaban el implode.
    def valores(f, sep):
        ordenado = sorted(f.datos.items())
        return sep.join(_escalar_query(v) or "" for _, v in ordenado
                        if not isinstance(v, (dict, list, tuple)))
    reg += [("valores", lambda f: valores(f, "")),
            ("valores_pipe", lambda f: valores(f, "|"))]
    return reg


CANONICALIZACIONES: list = _registro()


def canonicalizaciones_para(firmable: Firmable) -> list:
    """El registro con la forma documentada para ESTE método adelante: un GET
    se firma como consulta y un POST como JSON."""
    if firmable.metodo == "GET":
        return CANONICALIZACIONES
    doc_query, doc_json = CANONICALIZACIONES[0], CANONICALIZACIONES[1]
    return [doc_json, doc_query] + CANONICALIZACIONES[2:]


@dataclass(frozen=True)
class ResultadoFirma:
    ok: bool
    variante: Optional[str]     # cuál acertó (para registrarlo y poder fijarla)
    probadas: tuple             # (nombre, primeros 8 hex del HMAC calculado)


def validar_firma(firmable: Firmable, recibida: Optional[str], secreto: str,
                  registro: Optional[list] = None) -> ResultadoFirma:
    """Acepta si la firma recibida coincide con CUALQUIER canonicalización.

    Es más laxo que lo documentado a propósito: rechazar un callback legítimo
    deja al jugador con un saldo que rebota y sin poder apostar, mientras que
    firmar de más solo amplía las formas en que quien ya tiene la clave puede
    escribir el mismo pedido. La firma sigue siendo un HMAC de 256 bits.

    Devuelve qué prefijos se calcularon aunque nada acierte: es lo único que
    permite diagnosticar qué forma mandaron realmente sin exponer firmas
    completas que alguien pudiera reusar.
    """
    firma = (recibida or "").strip().lower()
    if not secreto or not firma:
        return ResultadoFirma(False, None, ())
    probadas = []
    vistas = set()
    for nombre, canon in (registro if registro is not None
                          else canonicalizaciones_para(firmable)):
        try:
            cadena = canon(firmable)
        except Exception:   # una canonicalización rota no tumba a las demás
            continue
        if cadena is None or cadena in vistas:
            continue
        vistas.add(cadena)
        calculada = hmac_sha256(cadena, secreto)
        probadas.append((nombre, calculada[:8]))
        if hmac.compare_digest(calculada, firma):
            return ResultadoFirma(True, nombre, tuple(probadas))
    return ResultadoFirma(False, None, tuple(probadas))


def diagnostico_firma(firmable: Firmable, recibida: Optional[str],
                      resultado: ResultadoFirma, tope: int = 600) -> str:
    """Una línea para el log de un rechazo: lo necesario para reproducir el
    cálculo a mano con la clave, sin la clave ni firmas ajenas completas."""
    return ("método={m} firma_recibida={r} prefijos_calculados=[{p}] "
            "consulta={c!r} cuerpo={b!r}").format(
        m=firmable.metodo, r=(recibida or "")[:80],
        p=" ".join(f"{n}={h}" for n, h in resultado.probadas),
        c=firmable.consulta[:tope], b=firmable.crudo[:tope])


# ── Qué hace cada tipo de movimiento ───────────────────────────

@dataclass(frozen=True)
class Efecto:
    tipo: str                  # `casino_movimientos.tipo`
    signo: int                 # -1 resta del saldo, +1 suma
    exige_saldo: bool          # False solo en la conciliación
    bloqueable: bool           # un jugador bloqueado no puede hacerlo
    revierte: Optional[str]    # tipo de movimiento que este revierte
    etiqueta: str              # `casino_rounds.game`


# Es la tabla más importante del módulo: dirección del dinero = endpoint, y
# el `type` dice qué es. Lo que no está acá NO se aplica (código 3): un tipo
# que no conocemos no tiene un signo que podamos suponer sin arriesgar plata.
# 'tipo' reusa los que ya entiende el resumen de conciliación (`debito`,
# `credito`, `devolucion`); el premio anulado es nuevo y ese resumen lo resta.
EFECTOS = {
    ("debit", "bet"): Efecto("debito", -1, True, True, None, "bet"),
    ("debit", "purchase"): Efecto("debito", -1, True, True, None, "purchase"),
    ("debit", "tournament"): Efecto("debito", -1, True, True, None, "tournament"),
    # Anular un premio ya pagado.
    ("debit", "rollback"): Efecto("anulacion_premio", -1, True, False,
                                  "credito", "rollback"),
    # "Must be processed unconditionally": una apuesta que ellos dieron por
    # hecha después de dos reintentos nuestros fallidos. Se aplica aunque deje
    # el saldo en negativo; ese saldo es la verdad de lo que jugó.
    ("debit", "conciliation"): Efecto("debito", -1, False, False, None,
                                      "conciliation"),
    ("credit", "win"): Efecto("credito", 1, False, False, None, "win"),
    ("credit", "promo_win"): Efecto("credito", 1, False, False, None, "win"),
    ("credit", "free_spins"): Efecto("credito", 1, False, False, None, "freespin"),
    ("credit", "jackpot"): Efecto("credito", 1, False, False, None, "jackpot"),
    ("credit", "tournament"): Efecto("credito", 1, False, False, None, "tournament"),
    ("credit", "conciliation"): Efecto("credito", 1, False, False, None,
                                       "conciliation"),
    # Devolver una apuesta.
    ("credit", "rollback"): Efecto("devolucion", 1, False, False, "debito",
                                   "rollback"),
    ("credit", "refund"): Efecto("devolucion", 1, False, False, "debito",
                                 "refund"),
}

# El tipo que se asume si el pedido no lo trae (así lo hace el panel).
TIPO_POR_DEFECTO = {"debit": "bet", "credit": "win"}


def asiento(efecto: Efecto, centavos: int) -> tuple:
    """(apuesta, premio) que el movimiento deja en `casino_rounds`, donde
    salen los reportes: el GGR es la suma de `apuesta - premio`. Una
    devolución resta apuesta y un premio anulado resta premio, así el reporte
    cuadra con el saldo sin tocar las consultas que ya existen. Los giros
    gratis son un premio sin apuesta: su GGR negativo es lo esperado."""
    if efecto.tipo == "debito":
        return centavos, 0
    if efecto.tipo == "credito":
        return 0, centavos
    if efecto.tipo == "devolucion":
        return -centavos, 0
    return 0, -centavos   # anulacion_premio


def rollback_permitido(efecto: Efecto, centavos: int,
                       previos: dict) -> Optional[str]:
    """None si se puede revertir, o el motivo. `previos` es lo ya movido en
    esa ronda por ese jugador, sumado por tipo.

    No alcanza con que la ronda exista: un rollback con otra `transaction`
    sobre la misma ronda se vería nuevo para la idempotencia y devolvería la
    apuesta dos veces. Lo revertido en total no puede pasar de lo que se
    movió en sentido contrario.
    """
    if efecto.revierte is None:
        return None
    original = int(previos.get(efecto.revierte, 0))
    ya = int(previos.get(efecto.tipo, 0))
    if original <= 0:
        return "ronda desconocida o sin movimiento que revertir"
    if ya + centavos > original:
        return (f"revertiría {ya + centavos} y la ronda movió {original} "
                f"de {efecto.revierte}")
    return None


@dataclass(frozen=True)
class Pedido:
    accion: str                    # 'debit' | 'credit' (el endpoint)
    tipo: str
    efecto: Optional[Efecto]       # None = tipo que no sabemos aplicar
    usuario: Optional[str]
    monto: object                  # crudo: se convierte al usarlo
    ronda: Optional[str]
    transaccion: Optional[str]
    moneda: Optional[str]
    juego: Optional[str]
    sesion: Optional[str]
    cuerpo: dict = field(repr=False, default_factory=dict)


def _texto(valor) -> Optional[str]:
    if valor is None:
        return None
    t = str(valor).strip()
    return t or None


def interpretar(accion: str, cuerpo: dict) -> tuple:
    """(Pedido, error). `accion` sale del endpoint, NO del cuerpo: la
    dirección del dinero no puede depender de un campo que, por bug del otro
    lado, diga otra cosa que la URL a la que llamaron. Si el cuerpo trae
    `action` y no coincide, se rechaza en vez de elegir."""
    del_cuerpo = _texto(cuerpo.get("action"))
    if del_cuerpo and del_cuerpo.lower() != accion:
        return None, f"action={del_cuerpo!r} en el endpoint {accion}"
    tipo = (_texto(cuerpo.get("type")) or TIPO_POR_DEFECTO[accion]).lower()
    moneda = _texto(cuerpo.get("currency"))
    return Pedido(
        accion=accion, tipo=tipo, efecto=EFECTOS.get((accion, tipo)),
        usuario=_texto(cuerpo.get("user")), monto=cuerpo.get("amount"),
        ronda=_texto(cuerpo.get("round")),
        transaccion=_texto(cuerpo.get("transaction")),
        moneda=moneda.upper() if moneda else None,
        juego=_texto(cuerpo.get("game")),
        sesion=_texto(cuerpo.get("session_token")), cuerpo=cuerpo), None


def jugador_id_de(texto: Optional[str]) -> Optional[int]:
    """`user` es el id interno que mandamos al lanzar. Solo un entero: aceptar
    también el username abriría un segundo camino de identidad (puede cambiar
    y dejar rondas huérfanas), igual que en Atomic. Panel-multiskin acepta
    los dos; acá no hay motivo."""
    if texto and texto.isascii() and texto.isdigit() and len(texto) <= 18:
        return int(texto)
    return None


def validar_contexto(moneda_pedida: Optional[str], fila: Optional[dict],
                     monedas_proveedor: tuple) -> Optional[str]:
    """El motivo si el pedido no corresponde al jugador, o None.

    Devuelve el motivo (y no el código) para que quien llama lo registre: el
    código siempre es `NO_PROCESABLE`, salvo jugador inexistente.
    `fila.ses_user` es None cuando la sesión no se conoce: se acepta y el
    llamador lo avisa, porque rechazar un premio por no conocer la sesión le
    quitaría al jugador plata que ya ganó.
    """
    if fila is None:
        return "jugador"
    moneda = str(fila.get("moneda") or "ARS").upper()
    if moneda_pedida and moneda_pedida != moneda:
        return "moneda del pedido distinta de la del jugador"
    if monedas_proveedor and moneda not in monedas_proveedor:
        return "moneda del jugador fuera de las del proveedor"
    if fila.get("ses_user") is not None and fila["ses_user"] != fila["id"]:
        return "la sesión es de otro jugador"
    return None


# ── Lanzamiento ────────────────────────────────────────────────

# Sus idiomas son locales completos. Lo que no está acá abre en español: es
# el idioma de los jugadores y un código que no conocen podría fallar el
# lanzamiento entero.
_IDIOMAS = {"es": "es_ES", "en": "en_US", "pt": "pt_BR"}
_USERNAME_MAX = 30   # más largo lo rechazan con 422


def idioma_de(texto) -> str:
    t = str(texto or "").strip().replace("-", "_")
    if re.fullmatch(r"[a-z]{2}_[A-Z]{2}", t):
        return t
    return _IDIOMAS.get(t.lower()[:2], "es_ES")


def url_de_retorno(texto) -> Optional[str]:
    """Solo http(s): la URL termina en un redirect del juego y un
    `javascript:` ahí ejecutaría código."""
    t = str(texto or "").strip()
    return t if re.match(r"https?://", t, re.I) and len(t) <= 500 else None


def consulta_lanzamiento(*, juego, client_id, sesion: str, usuario_id,
                         username, moneda: str, idioma, demo: bool = False,
                         return_url: Optional[str] = None) -> dict:
    """Los parámetros de `GET /game`.

    - `user` es el id interno, nunca el username (puede cambiar y dejaría
      rondas huérfanas); `username` va aparte, recortado a 30.
    - `demo` viaja como '1'/'0' y se firma como se envía: un booleano que se
      escribe distinto al firmar y al enviar da "Client authentication failed".
    """
    consulta = {
        "game": int(juego),
        "client_id": int(client_id),
        "session_token": sesion,
        "user": str(usuario_id),
        "username": str(username or usuario_id)[:_USERNAME_MAX],
        "currency": str(moneda).upper(),
        "language": idioma_de(idioma),
        "demo": "1" if demo else "0",
    }
    if return_url:
        consulta["return_url"] = return_url
    return consulta


def consulta_firmada(parametros: dict, secreto: str) -> tuple:
    """(query string, firma). El texto firmado es EXACTAMENTE el que se
    manda: se arma una vez y se usa dos veces."""
    consulta = construir_consulta(parametros)
    return consulta, hmac_sha256(consulta, secreto)


# ── Catálogo ───────────────────────────────────────────────────

# Lo que cuenta como "en vivo", comparado por igualdad sobre la categoría ya
# normalizada y NUNCA por "contiene": "live" como subcadena también es
# "alive" y "deliver", y una mesa en vivo mal clasificada como slot se
# esconde en la pestaña equivocada. No está verificado qué palabras usa
# Content360 (no tenemos credenciales todavía): por eso la lista se puede
# cambiar desde el entorno sin tocar código y por eso la sincronización
# registra las categorías que vio.
CATEGORIAS_VIVO = frozenset({
    "live", "live casino", "live dealer", "live dealers", "live games",
    "casino en vivo", "en vivo", "vivo",
})


def normalizar_categoria(valor) -> str:
    """'Live-Casino' / 'LIVE_CASINO' / ' live  casino ' -> 'live casino'."""
    t = unicodedata.normalize("NFKD", str(valor or "")).encode(
        "ascii", "ignore").decode()
    return " ".join(re.sub(r"[_\-\s]+", " ", t).lower().split())


def categorias_de(valor) -> list:
    """Acepta una lista de textos, una lista de objetos (`name`/`slug`/`code`)
    o un texto suelto, que son las formas en que un agregador suele mandarlas."""
    if valor is None:
        return []
    if isinstance(valor, (str, int)):
        valor = [valor]
    if isinstance(valor, dict):
        valor = [valor]
    salida = []
    for item in valor if isinstance(valor, (list, tuple)) else []:
        if isinstance(item, dict):
            item = (item.get("slug") or item.get("code") or item.get("name")
                    or item.get("title"))
        n = normalizar_categoria(item)
        if n:
            salida.append(n)
    return salida


def es_vivo(categorias, tipo_marca=None, vivas=CATEGORIAS_VIVO) -> bool:
    """Un juego es en vivo si alguna de sus categorías, o el tipo de su marca,
    está en la lista de categorías en vivo. Nada de palabras sueltas."""
    candidatas = categorias_de(categorias)
    marca = normalizar_categoria(tipo_marca)
    if marca:
        candidatas.append(marca)
    return any(c in vivas for c in candidatas)


@dataclass(frozen=True)
class JuegoC360:
    id: str
    titulo: str
    marca: Optional[str]
    imagen: Optional[str]
    es_vivo: bool
    activo: bool
    categorias: tuple = ()


@dataclass(frozen=True)
class Catalogo:
    juegos: list
    categorias: Counter       # lo que Content360 mandó, normalizado
    tipos_marca: Counter


def _activo(valor) -> bool:
    """`status` ausente = activo; 0 / '0' / false / 'inactive' = apagado."""
    if valor is None:
        return True
    if isinstance(valor, str):
        return valor.strip().lower() not in ("0", "false", "inactive", "disabled", "off", "")
    return bool(valor)


def _slug_marca(texto) -> Optional[str]:
    t = _texto(texto)
    return t.lower().replace(" ", "").replace("-", "") if t else None


def extraer_juegos(datos, vivas=CATEGORIAS_VIVO) -> Catalogo:
    """La lista de `GET /games/get`: `data.brands[].brand_games[]`. La marca
    está en el nivel de arriba, no en cada juego."""
    vacio = Catalogo([], Counter(), Counter())
    if not isinstance(datos, dict):
        return vacio
    cuerpo = datos.get("data") if isinstance(datos.get("data"), dict) else datos
    marcas = cuerpo.get("brands")
    if not isinstance(marcas, list):
        return vacio
    juegos, categorias, tipos = [], Counter(), Counter()
    for marca in marcas:
        if not isinstance(marca, dict):
            continue
        tipo_marca = normalizar_categoria(marca.get("brand_type"))
        if tipo_marca:
            tipos[tipo_marca] += 1
        nombre = _slug_marca(marca.get("brand_name") or marca.get("name"))
        for item in marca.get("brand_games") or []:
            if not isinstance(item, dict):
                continue
            gid = _texto(item.get("id"))
            if not gid:
                continue
            cats = categorias_de(item.get("categories") or item.get("category"))
            categorias.update(cats)
            juegos.append(JuegoC360(
                id=gid, titulo=_texto(item.get("name")) or gid, marca=nombre,
                imagen=_texto(item.get("image")),
                es_vivo=es_vivo(cats, tipo_marca, vivas),
                activo=_activo(item.get("status")), categorias=tuple(cats)))
    return Catalogo(juegos, categorias, tipos)


def juego_de_notificacion(cuerpo: dict, vivas=CATEGORIAS_VIVO) -> Optional[JuegoC360]:
    """El `notification`: un juego del catálogo, upsert por `id`. None si no
    trae `id`. La marca llega como `brand_id` (un número), sin su nombre, así
    que no se inventa: quien guarda conserva la que ya tenía el juego."""
    gid = _texto(cuerpo.get("id"))
    if not gid:
        return None
    cats = categorias_de(cuerpo.get("categories"))
    return JuegoC360(
        id=gid, titulo=_texto(cuerpo.get("name")) or gid, marca=None,
        imagen=_texto(cuerpo.get("image")), es_vivo=es_vivo(cats, None, vivas),
        activo=_activo(cuerpo.get("status")), categorias=tuple(cats))
