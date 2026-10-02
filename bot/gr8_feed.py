"""El feed de GR8: lo que se decide sin tocar el broker.

GR8 empuja las cuotas por RabbitMQ y esa conexión vive en
`gr8_consumidor.py`. Acá queda todo lo que se puede probar sin broker, igual
que `mensajeria.py` deja el contrato del proveedor aparte del envío: de qué
colas se lee, con qué nombre según el entorno, cuánto se espera antes de
reconectar, y la contabilidad de lo observado.

La etapa 0 es mirar, no interpretar. Nada de este módulo lee el contenido de
un mensaje: solo cuenta cuántos llegan, cuánto pesan, y guarda unas pocas
muestras acotadas.
"""

from __future__ import annotations

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


@dataclass
class Lote:
    """Lo recibido desde el último vaciado.

    Guarda los contadores, las muestras y los mensajes SIN confirmar. Los
    tres viajan juntos a propósito: lo único que autoriza confirmar un
    mensaje es que sus contadores ya estén escritos, y mientras vivan en el
    mismo objeto no hay forma de confirmar uno sin haber escrito el otro.
    """

    cubos: dict[tuple[str, datetime], Cubo] = field(default_factory=dict)
    muestras: list[Muestra] = field(default_factory=list)
    pendientes: list[Any] = field(default_factory=list)

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
        self.pendientes.append(mensaje)

    def absorber(self, otro: "Lote") -> None:
        """Suma lo de `otro` (lo llegado mientras este lote fallaba)."""
        for clave, c in otro.cubos.items():
            propio = self.cubos.setdefault(clave, Cubo())
            propio.mensajes += c.mensajes
            propio.bytes += c.bytes
            propio.bytes_max = max(propio.bytes_max, c.bytes_max)
            propio.reentregados += c.reentregados
        self.muestras.extend(otro.muestras)
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
