"""El feed de GR8: lo que se decide sin tocar el broker.

GR8 empuja las cuotas por RabbitMQ y esa conexión vive en
`gr8_consumidor.py`. Acá queda todo lo que se puede probar sin broker, igual
que `mensajeria.py` deja el contrato del proveedor aparte del envío: de qué
colas se lee, con qué nombre según el entorno, cuánto se espera antes de
reconectar, y la contabilidad de lo observado.

La etapa 0 era mirar, no interpretar: contar cuántos mensajes llegan, cuánto
pesan, y guardar unas pocas muestras acotadas. Ese camino sigue intacto y es
el que hay que poder volver a usar cualquier día que haya que mirar qué llega.

G3 agrega lo PRIMERO que sí se interpreta: la taxonomía (deportes, categorías
y torneos). Son las tres colas chicas y quietas, elegidas a propósito como el
lugar barato para equivocarse antes de tocar la de 20 mensajes por segundo.
La interpretación va aparte y no puede tumbar la observación: un mensaje que
no se entiende se cuenta como descartado y se sigue, porque un mensaje que
tumba al consumidor deja de contar TODAS las colas.
"""

from __future__ import annotations

import json
import os
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Any, Awaitable, Callable, Mapping

# Las nueve colas del feed que compramos. Las otras tres de GR8 son del lado
# de apuestas del MTS (`bet-returns`, `bet-rejected`, `bet-blocked`) y no se
# leen: consumirlas le sacaría mensajes a quien sí las atiende.
COLAS_BASE = (
    "markets-queue",
    "market-results-queue",
    "events-queue",
    "scores-queue",
    "sports-queue",
    "categories-queue",
    "tournaments-queue",
    "event-free-form-templates-queue",
    "line-items-dependency-pairs-queue",
)

# Para pruebas GR8 da las mismas colas con este sufijo, en el mismo clúster
# de producción. No hay un servidor aparte: sin el sufijo, staging se
# comería los mensajes de producción.
SUFIJO_STAGING = "-INT"

PREFETCH_POR_DEFECTO = 50
# Techo del prefetch. La documentación de GR8 advierte que cargar de más
# consume la RAM de SU broker; el techo evita que un valor mal puesto en el
# entorno repita ese problema.
PREFETCH_MAXIMO = 500

# Cada cuánto se escribe lo acumulado y se confirma. Pocos segundos: más
# espera deja más mensajes sin confirmar en el broker, menos espera es más
# escrituras a la base para contar lo mismo.
VACIADO_SEGUNDOS = 2.0

# Muestras: pocas por cola, cortadas, y espaciadas. Una por ventana, y la
# ventana guarda el mensaje más grande que vio. Antes la primera tanda
# llenaba el cupo de una: diez mensajes seguidos de medio segundo de stream,
# que no dicen nada del horario ni del partido. Ahora diez ventanas son 2,5 h
# de historia (se ve si cambia el partido) y cada una trae la estructura más
# completa que pasó.
MUESTRAS_POR_COLA = 10
MUESTRA_CADA_SEGUNDOS = 900.0

# El corte por defecto alcanza para ver de qué habla cada cola, pero no para
# modelarla: un mensaje de `markets` pesa 62 KB, así que con 4096 se ve el 6%
# de la estructura que hay que traducir a tablas. `GR8_FEED_MUESTRA_BYTES`
# permite subirlo un rato para capturar mensajes enteros y después volver.
#
# No se sube de forma permanente a propósito: son diez muestras por cola y
# nueve colas, así que el tope manda directo sobre el tamaño de la tabla.
MUESTRA_MAX_BYTES_POR_DEFECTO = 4096
#
# El tope tiene que superar el mayor mensaje medido (7 MB en `market-results`)
# para que uno grande entre completo cuando se lo pide; con 1 MiB ni subiendo
# la variable al máximo entraba. 16 MiB deja margen sin llegar a ser absurdo.
MUESTRA_MAX_BYTES_TOPE = 16_777_216


def muestra_max_bytes(env=None) -> int:
    """Cuánto de cada mensaje se guarda. Un valor inválido no rompe la
    observación: vuelve al de siempre, porque dejar de medir por un error de
    tipeo en una variable es peor que medir de menos."""
    env = os.environ if env is None else env
    crudo = (env.get("GR8_FEED_MUESTRA_BYTES") or "").strip()
    if not crudo:
        return MUESTRA_MAX_BYTES_POR_DEFECTO
    try:
        valor = int(crudo)
    except ValueError:
        return MUESTRA_MAX_BYTES_POR_DEFECTO
    if valor < 1:
        return MUESTRA_MAX_BYTES_POR_DEFECTO
    return min(valor, MUESTRA_MAX_BYTES_TOPE)


MUESTRA_MAX_BYTES = muestra_max_bytes()

ESPERA_BASE = 1.0
ESPERA_TOPE = 60.0
# Una conexión que aguanta esto se considera sana: recién entonces el
# contador de reintentos vuelve a cero. Sin esto, una conexión que cae al
# segundo de abrir reiniciaría la espera cada vez y martillaría al broker.
CONEXION_ESTABLE_SEGUNDOS = 60.0


class Gr8NoConfigurado(RuntimeError):
    """Falta algo para conectar. Se falla cerrado: un consumidor que no
    puede conectarse y finge que anda es peor que uno que no arranca, porque
    nadie se entera de que las cuotas dejaron de llegar."""


class EscrituraFallida(RuntimeError):
    """No se pudo escribir un lote. Se distingue de un fallo de la conexión
    al broker porque se atiende distinto: la base caída (un failover) se
    espera con el lote en memoria y sin confirmar; el broker caído obliga a
    reconectar."""


@dataclass(frozen=True)
class Config:
    url: str
    sufijo: str
    prefetch: int

    @property
    def colas(self) -> tuple[str, ...]:
        return nombres_de_colas(self.sufijo)


def nombres_de_colas(sufijo: str) -> tuple[str, ...]:
    return tuple(f"{base}{sufijo}" for base in COLAS_BASE)


def _prefetch(valor: str) -> int:
    if not valor:
        return PREFETCH_POR_DEFECTO
    try:
        n = int(valor)
    except ValueError:
        raise Gr8NoConfigurado("GR8_FEED_PREFETCH debe ser un entero") from None
    if not 1 <= n <= PREFETCH_MAXIMO:
        # Nunca 0: en AMQP prefetch 0 significa SIN límite, que es justo lo
        # que GR8 pide no hacer.
        raise Gr8NoConfigurado(
            f"GR8_FEED_PREFETCH debe estar entre 1 y {PREFETCH_MAXIMO}"
        )
    return n


def config_del_entorno(env: Mapping[str, str] | None = None) -> Config:
    env = os.environ if env is None else env

    url = (env.get("GR8_FEED_URL") or "").strip()
    if not url:
        raise Gr8NoConfigurado(
            "Falta GR8_FEED_URL (amqps://usuario:clave@host:5671/vhost): "
            "el consumidor no arranca sin credenciales."
        )
    # El puerto 5671 es TLS. Una URL amqp:// mandaría usuario y clave sin
    # cifrar por internet hasta Frankfurt.
    if not url.lower().startswith("amqps://"):
        raise Gr8NoConfigurado(
            "GR8_FEED_URL debe empezar con amqps://: no se conecta sin TLS."
        )

    # El sufijo se deduce del entorno, y APP_ENV ausente o raro no se
    # adivina: elegir mal acá es leer las colas de producción desde staging.
    # GR8_FEED_SUFIJO_COLAS lo pisa a propósito (incluso vacío) si GR8 cambia
    # la convención sin avisar.
    app_env = env.get("APP_ENV", "")
    if app_env not in {"production", "staging"}:
        raise Gr8NoConfigurado(
            "APP_ENV debe ser 'production' o 'staging': de eso depende qué "
            "colas se leen."
        )
    if "GR8_FEED_SUFIJO_COLAS" in env:
        sufijo = env["GR8_FEED_SUFIJO_COLAS"].strip()
    else:
        sufijo = SUFIJO_STAGING if app_env == "staging" else ""

    return Config(url=url, sufijo=sufijo, prefetch=_prefetch(env.get("GR8_FEED_PREFETCH", "").strip()))


def url_para_log(url: str) -> str:
    """La URL sin usuario ni clave, para poder escribirla en el registro."""
    resto = url.split("://", 1)[-1]
    return resto.rsplit("@", 1)[-1]


def sin_secretos(texto: str, url: str) -> str:
    """El texto de un error, sin la URL ni la clave de GR8.

    Las librerías de AMQP incluyen a veces la dirección completa en sus
    errores, y estos van al registro de Railway, que lee más gente que la
    que debería conocer la clave.
    """
    limpio = texto.replace(url, "***")
    clave = url.split("://", 1)[-1].rsplit("@", 1)[0].partition(":")[2]
    return limpio.replace(clave, "***") if clave else limpio


def espera_reconexion(
    intento: int,
    *,
    base: float = ESPERA_BASE,
    tope: float = ESPERA_TOPE,
    azar: float | None = None,
) -> float:
    """Segundos a esperar antes del intento número `intento` (0 es el primero).

    Crece al doble y se frena en el tope: si el broker está caído, no se lo
    martilla; si volvió, no se espera media hora. `azar` (entre 0 y 1) resta
    hasta un cuarto para que, si algún día hay varios procesos, no
    reconecten todos al mismo instante.
    """
    espera = min(tope, base * (2 ** min(max(intento, 0), 30)))
    if azar is not None:
        espera *= 1 - 0.25 * min(max(azar, 0.0), 1.0)
    return espera


# --- Taxonomía (G3) ------------------------------------------------------

# Las tres colas que esta etapa interpreta, y a qué tabla va cada una. Las
# otras seis se siguen contando y muestreando sin mirarles el contenido.
#
# Se compara por prefijo porque el nombre real lleva sufijo de entorno
# (`sports-queue-int`). Ninguno de los nueve nombres base es prefijo de otro
# —`markets-queue` y `market-results-queue` no se pisan— así que el prefijo
# alcanza y no hay que deshacer el sufijo, que es configurable.
COLAS_TAXONOMIA = {
    "sports-queue": "deporte",
    "categories-queue": "categoria",
    "tournaments-queue": "torneo",
}

# El idioma que queremos y el que aceptamos si no está. Medido sobre las 30
# muestras reales de estas tres colas: `sports.name` trae `es` 10 de 10,
# `tournaments.name` 6 de 10 y `categories.name` 0 de 10; `en` está en las 30.
# Sin respaldo, dos de cada tres categorías no tendrían nombre. Un nombre en
# inglés es peor que uno en español y mucho mejor que ninguno.
IDIOMA_PREFERIDO = "es"
IDIOMA_RESPALDO = "en"


class MensajeIlegible(ValueError):
    """Un mensaje de una cola de taxonomía del que no se puede sacar una fila.

    No se traga en silencio ni tumba el consumidor: se cuenta en
    `gr8_obs_minuto.descartados`. Si GR8 cambia el esquema, la cuenta de
    descartados sube y se ve en una consulta; con un `try/except` mudo
    desaparecerían torneos y nadie sabría cuántos.
    """


@dataclass(frozen=True)
class Taxonomia:
    """Una fila de taxonomía lista para escribir, ya elegido el idioma."""

    clase: str                      # "deporte" | "categoria" | "torneo"
    id: str
    data_version: int
    # Puede quedar en None: hay entidades sin un solo nombre usable. Se
    # guarda la fila igual, porque lo que la pantalla necesita primero es el
    # enganche (torneo -> categoría -> deporte), y una fila sin nombre se
    # mide con una consulta mientras que una fila que no existe rompe el
    # enganche de todos sus eventos. Nunca se inventa un nombre ni se usa el
    # `slug`: el slug es texto técnico, no algo que un jugador deba leer.
    nombre: str | None
    nombre_idioma: str | None
    slug: str | None
    deporte_id: str | None = None   # `sport` en el mensaje
    categoria_id: str | None = None # `categoryId`, solo en torneos


def clase_de_cola(cola: str) -> str | None:
    """Qué clase de taxonomía trae esta cola, o None si no trae ninguna."""
    for base, clase in COLAS_TAXONOMIA.items():
        if cola.startswith(base):
            return clase
    return None


def elegir_nombre(nombres: Any) -> tuple[str, str] | None:
    """El nombre a mostrar y el idioma en que quedó: `es` → `en` → la primera.

    Devuelve None si no hay ninguno usable.

    La tercera rama (una entidad sin `es` ni `en`) NO SE OBSERVÓ: en las 30
    muestras reales `en` vino siempre. Queda escrita porque el feed trae 41
    idiomas y un evento listó quince sin español, así que suponer que `en`
    está siempre es la clase de suposición que este documento viene cobrando.
    Toma la primera en el orden en que GR8 mandó las claves; si GR8 reordena
    entre republicaciones, el nombre elegido puede cambiar. Es aceptable
    porque `nombre_idioma` deja ver que ese nombre es de respaldo.
    """
    if not isinstance(nombres, Mapping):
        return None

    def usable(valor: Any) -> str | None:
        # Un nombre en blanco es tan inútil como uno ausente, y además
        # tapa al respaldo: si `es` viene vacío y `en` tiene texto, hay que
        # quedarse con el inglés, no con el vacío en español.
        return valor.strip() if isinstance(valor, str) and valor.strip() else None

    for idioma in (IDIOMA_PREFERIDO, IDIOMA_RESPALDO):
        texto = usable(nombres.get(idioma))
        if texto is not None:
            return texto, idioma
    for idioma, valor in nombres.items():
        texto = usable(valor)
        if texto is not None and isinstance(idioma, str):
            return texto, idioma
    return None


def _texto_opcional(valor: Any) -> str | None:
    return valor.strip() if isinstance(valor, str) and valor.strip() else None


def interpretar_taxonomia(clase: str, cuerpo: bytes) -> Taxonomia:
    """Un mensaje de taxonomía a una fila. Lanza `MensajeIlegible` si no se puede.

    El orden se decide con `dataVersion` y NO con `sourceDataVersion`.
    Verificado sobre las 30 muestras reales de estas tres colas:
    `sourceDataVersion` no viene en NINGUNA (0 de 30) y `dataVersion` viene en
    todas (30 de 30). En `markets` y `events` pasa lo contrario: ahí manda
    `sourceDataVersion`, y los dos campos van desfasados por una cantidad
    variable. Confundirlos es pisar un dato nuevo con uno viejo, y en un feed
    de cuotas eso se paga.

    Tampoco se ordena por los timestamps: vienen con centinelas
    (`"0001-01-01"`) y precisión variable. Sirven para medir atraso, no para
    ordenar.
    """
    if not cuerpo:
        # Medido en `events` y `scores`: hay mensajes de longitud cero y no
        # se sabe si son latido o borrado. Se cuentan aparte en vez de
        # suponer: si fueran borrados y los tomáramos por nada, quedarían
        # torneos fantasma en el catálogo.
        raise MensajeIlegible("cuerpo vacío")
    try:
        mensaje = json.loads(cuerpo)
    except (ValueError, UnicodeDecodeError) as error:
        raise MensajeIlegible(f"no es JSON: {type(error).__name__}") from error
    if not isinstance(mensaje, Mapping):
        raise MensajeIlegible("el mensaje no es un objeto")

    identidad = _texto_opcional(mensaje.get("id"))
    if identidad is None:
        raise MensajeIlegible("sin id")
    # `sports.id` es "Football", no un guid, y los otros dos son 32 hex. No se
    # valida la forma a propósito: rechazar por forma sería perder entidades
    # el día que GR8 cambie el formato de sus ids, y la forma no es nuestra.

    version = mensaje.get("dataVersion")
    # `bool` es `int` en Python y un `true` acá sería un esquema distinto, no
    # una versión 1.
    if not isinstance(version, int) or isinstance(version, bool):
        # Sin versión no hay forma de saber si este mensaje es más nuevo que
        # lo guardado. Inventar un 0 dejaría que un mensaje viejo le ganara
        # después a uno nuevo, que es exactamente el daño que la puerta de
        # versión existe para evitar.
        raise MensajeIlegible("sin dataVersion entero")

    elegido = elegir_nombre(mensaje.get("name"))
    # `nameMobile` viene `{}` en las 30 muestras: no se lee hasta que traiga algo.
    nombre, idioma = elegido if elegido is not None else (None, None)

    return Taxonomia(
        clase=clase,
        id=identidad,
        data_version=version,
        nombre=nombre,
        nombre_idioma=idioma,
        slug=_texto_opcional(mensaje.get("slug")),
        deporte_id=_texto_opcional(mensaje.get("sport")),
        categoria_id=_texto_opcional(mensaje.get("categoryId")),
    )


# --- Observación ---------------------------------------------------------


def minuto_de(ahora: float) -> datetime:
    """El inicio del minuto, en UTC, al que pertenece `ahora` (epoch)."""
    return datetime.fromtimestamp(int(ahora // 60) * 60, tz=timezone.utc)


def recortar_cuerpo(cuerpo: bytes, maximo: int = MUESTRA_MAX_BYTES) -> tuple[str, bool]:
    """El cuerpo como texto, cortado a `maximo` bytes. Devuelve si se cortó.

    Se corta en bytes y se decodifica tolerando el corte: partir un carácter
    UTF-8 por la mitad no debe tumbar el registro de una muestra.
    """
    cortado = len(cuerpo) > maximo
    return cuerpo[:maximo].decode("utf-8", errors="replace"), cortado


@dataclass
class Muestra:
    cola: str
    bytes: int
    truncado: bool
    cuerpo: str
    # Siempre verdadero para lo que sale de `Muestreo`: es el mayor visto en
    # su ventana. Existe en la tabla para distinguir estas filas de las
    # viejas (consecutivas, de los primeros segundos), que no lo son.
    mayor_de_ventana: bool = True


class Muestreo:
    """Se queda con el mensaje MÁS GRANDE de cada ventana de tiempo, por cola.

    Por qué el mayor y no el primero: el primero de la ventana es casi
    siempre uno chico y fácil, y modelar sobre ellos esconde las estructuras
    que solo traen los mensajes grandes (el máximo medido en `markets` es
    1,3 MB y en `market-results` 7 MB, y lo guardado no pasaba de 256 KB).

    Memoria: por cola se retiene UN solo candidato, ya cortado al tope de
    bytes; cada mensaje que no supera al candidato se descarta al instante.
    Peor caso: una cola por `MUESTRA_MAX_BYTES_TOPE`, o sea
    colas x tope. Con el corte por defecto son unos KB por cola.
    """

    def __init__(self, cada: float = MUESTRA_CADA_SEGUNDOS):
        self._cada = cada
        self._inicio: dict[str, float] = {}
        self._mayor: dict[str, Muestra] = {}

    def ofrecer(self, cola: str, ahora: float, tamano: int, cuerpo: bytes) -> Muestra | None:
        """Considera un mensaje. Devuelve la muestra de la ventana que acaba
        de cerrarse (si este mensaje ya cae en la siguiente), o None.

        La ventana se cierra al llegar el primer mensaje posterior, no por
        reloj: el feed es continuo y así no hace falta un temporizador que
        compita con el vaciado del lote.
        """
        cerrada = None
        if cola in self._inicio and ahora - self._inicio[cola] >= self._cada:
            cerrada = self._mayor.pop(cola, None)
            del self._inicio[cola]
        self._inicio.setdefault(cola, ahora)
        actual = self._mayor.get(cola)
        # Estrictamente mayor: en un empate se queda el primero, y el corte
        # y la decodificación (lo caro) solo se pagan si el mensaje gana.
        if actual is None or tamano > actual.bytes:
            texto, cortado = recortar_cuerpo(cuerpo)
            self._mayor[cola] = Muestra(cola, tamano, cortado, texto)
        return cerrada


@dataclass
class Cubo:
    mensajes: int = 0
    bytes: int = 0
    bytes_max: int = 0
    reentregados: int = 0
    # Mensajes de una cola de taxonomía que no se pudieron interpretar. Vive
    # en el cubo de observación porque el grano (cola, minuto) ya es el
    # correcto para la única pregunta que importa: de lo que llegó en este
    # minuto, ¿entendimos todo? Un descarte que solo fuera a un log se
    # pierde entre millones de líneas.
    descartados: int = 0


@dataclass
class Lote:
    """Lo recibido desde el último vaciado.

    Guarda los contadores, las muestras, la taxonomía interpretada y los
    mensajes SIN confirmar. Los cuatro viajan juntos a propósito: lo único
    que autoriza confirmar un mensaje es que lo suyo ya esté escrito, y
    mientras vivan en el mismo objeto no hay forma de confirmar uno sin
    haber escrito el otro.
    """

    cubos: dict[tuple[str, datetime], Cubo] = field(default_factory=dict)
    muestras: list[Muestra] = field(default_factory=list)
    pendientes: list[Any] = field(default_factory=list)
    # Una sola entrada por entidad, con la versión más alta vista en el lote.
    # No es una optimización de lujo: la ráfaga de arranque medida trajo el
    # MISMO torneo siete veces y la misma categoría diez veces. Sin esto, un
    # lote de cien mensajes serían cien escrituras para dejar tres filas.
    taxonomia: dict[tuple[str, str], Taxonomia] = field(default_factory=dict)

    def registrar(
        self,
        cola: str,
        cuerpo: bytes,
        mensaje: Any,
        ahora: float,
        *,
        reentregado: bool = False,
        muestreo: Muestreo | None = None,
    ) -> None:
        tamano = len(cuerpo)
        cubo = self.cubos.setdefault((cola, minuto_de(ahora)), Cubo())
        cubo.mensajes += 1
        cubo.bytes += tamano
        cubo.bytes_max = max(cubo.bytes_max, tamano)
        if reentregado:
            cubo.reentregados += 1
        if muestreo is not None:
            cerrada = muestreo.ofrecer(cola, ahora, tamano, cuerpo)
            if cerrada is not None:
                self.muestras.append(cerrada)
        # La interpretación va DESPUÉS de contar y muestrear, y encerrada.
        # Ese orden es la regla: el camino de observación tiene que seguir
        # funcionando igual aunque la interpretación falle, porque el día que
        # haya que volver a mirar qué llega va a ser justo el día en que algo
        # dejó de entenderse.
        clase = clase_de_cola(cola)
        if clase is not None:
            try:
                self.agregar_taxonomia(interpretar_taxonomia(clase, cuerpo))
            except MensajeIlegible:
                cubo.descartados += 1
        self.pendientes.append(mensaje)

    def agregar_taxonomia(self, fila: Taxonomia) -> None:
        """Deja la versión más alta de cada entidad dentro del lote.

        Es la misma regla que aplica la base (solo gana una versión
        estrictamente mayor), escrita también acá para que dos mensajes de la
        misma entidad en un lote no dependan del orden en que se escriban.
        """
        clave = (fila.clase, fila.id)
        previa = self.taxonomia.get(clave)
        if previa is None or fila.data_version > previa.data_version:
            self.taxonomia[clave] = fila

    def absorber(self, otro: "Lote") -> None:
        """Suma lo de `otro` (lo llegado mientras este lote fallaba)."""
        for clave, c in otro.cubos.items():
            propio = self.cubos.setdefault(clave, Cubo())
            propio.mensajes += c.mensajes
            propio.bytes += c.bytes
            propio.bytes_max = max(propio.bytes_max, c.bytes_max)
            propio.reentregados += c.reentregados
            propio.descartados += c.descartados
        self.muestras.extend(otro.muestras)
        for fila in otro.taxonomia.values():
            self.agregar_taxonomia(fila)
        self.pendientes.extend(otro.pendientes)

    def __len__(self) -> int:
        return len(self.pendientes)


class Recolector:
    """El lote en curso, con el cambio de lote hecho de un solo paso.

    Mientras se escribe un lote (un `await` a la base) siguen llegando
    mensajes. Si se escribiera sobre el mismo lote que sigue recibiendo, lo
    llegado a mitad de la escritura se confirmaría sin haberse escrito.
    Por eso `tomar` entrega el lote y deja uno vacío, y si la escritura
    falla, `devolver` lo junta de nuevo para reintentar.
    """

    def __init__(self) -> None:
        self.actual = Lote()

    def tomar(self) -> Lote:
        lote, self.actual = self.actual, Lote()
        return lote

    def devolver(self, lote: Lote) -> None:
        lote.absorber(self.actual)
        self.actual = lote


async def vaciar(
    lote: Lote,
    escribir: Callable[[Lote], Awaitable[None]],
    confirmar: Callable[[Any], Awaitable[None]],
) -> None:
    """Escribe el lote y SOLO DESPUÉS confirma sus mensajes.

    Es la regla que hace sobrevivible un failover de la base: lo que no se
    escribió no se confirma, y lo que no se confirma el broker lo devuelve a
    la cola. Si `escribir` lanza, no se confirma nada.
    """
    if not lote.pendientes:
        return
    await escribir(lote)
    for mensaje in lote.pendientes:
        await confirmar(mensaje)
