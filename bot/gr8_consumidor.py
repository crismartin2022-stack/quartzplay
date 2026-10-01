"""Consumidor del feed de GR8 (etapa 0: conectarse y registrar lo que llega).

Proceso aparte, declarado como `feed` en el Procfile. UNA sola réplica: los
consumidores de una misma cola se reparten los mensajes, así que un segundo
proceso vería la mitad de las cuotas cada uno. GR8 lo confirmó por escrito.
No se hace cumplir desde el código a propósito: la base se usa por el pooler
en modo transacción, donde un cerrojo de sesión de Postgres no es confiable.
Lo hace cumplir Railway (réplicas = 1).

Las reglas que no se negocian, y por qué:

- Confirmación manual y prefetch acotado, nunca auto-ack. Con auto-ack GR8
  carga todo lo pendiente en la RAM de SU broker y se arriesga a que el
  sistema operativo lo mate. Es infraestructura de ellos.
- Se confirma DESPUÉS de escribir. Un mensaje sin confirmar vuelve a la cola,
  y eso es lo que hace sobrevivible un failover de la base de datos.
- Reconexión con espera creciente, sin intervención humana.

Qué hace con los mensajes: contarlos y guardar unas pocas muestras (ver
`gr8_feed.Lote`). No los interpreta.
"""

from __future__ import annotations

import asyncio
import logging
import os
import random
import signal
import sys
import time
from functools import partial

import asyncpg

import gr8_feed
from gr8_feed import (
    Config,
    EscrituraFallida,
    Gr8NoConfigurado,
    Lote,
    Muestreo,
    Recolector,
    espera_reconexion,
    sin_secretos,
    vaciar,
)

log = logging.getLogger("gr8")

_UPSERT_CUBO = """
INSERT INTO public.gr8_obs_minuto AS t (cola, minuto, mensajes, bytes, bytes_max, reentregados)
VALUES ($1, $2, $3, $4, $5, $6)
ON CONFLICT (cola, minuto) DO UPDATE SET
    mensajes     = t.mensajes + EXCLUDED.mensajes,
    bytes        = t.bytes + EXCLUDED.bytes,
    bytes_max    = GREATEST(t.bytes_max, EXCLUDED.bytes_max),
    reentregados = t.reentregados + EXCLUDED.reentregados
"""

_INSERTAR_MUESTRA = """
INSERT INTO public.gr8_obs_muestra (cola, bytes, truncado, cuerpo)
VALUES ($1, $2, $3, $4)
"""

# Deja solo las últimas N de la cola. Es lo que mantiene acotada la tabla:
# el feed es continuo y sin este recorte la "muestra" sería el archivo.
_RECORTAR_MUESTRAS = """
DELETE FROM public.gr8_obs_muestra
WHERE cola = $1
  AND id NOT IN (
      SELECT id FROM public.gr8_obs_muestra
      WHERE cola = $1 ORDER BY id DESC LIMIT $2
  )
"""


async def abrir_pool() -> asyncpg.Pool:
    # Las mismas razones que en `casino_api.get_db`: pooler en modo
    # transacción, sin sentencias preparadas, y con tiempos para que una
    # consulta trabada no deje al consumidor colgado sin confirmar nada.
    return await asyncpg.create_pool(
        os.environ["DATABASE_URL"],
        min_size=1,
        max_size=2,
        statement_cache_size=0,
        max_cached_statement_lifetime=0,
        timeout=10,
        command_timeout=15,
        max_inactive_connection_lifetime=300,
    )


async def escribir_lote(pool: asyncpg.Pool, lote: Lote) -> None:
    """Un lote entero o nada: si algo falla, la transacción se revierte y
    el lote se reintenta completo sin contar dos veces."""
    try:
        async with pool.acquire() as conn:
            async with conn.transaction():
                for (cola, minuto), c in lote.cubos.items():
                    await conn.execute(
                        _UPSERT_CUBO, cola, minuto,
                        c.mensajes, c.bytes, c.bytes_max, c.reentregados,
                    )
                for m in lote.muestras:
                    await conn.execute(
                        _INSERTAR_MUESTRA, m.cola, m.bytes, m.truncado, m.cuerpo
                    )
                for cola in {m.cola for m in lote.muestras}:
                    await conn.execute(
                        _RECORTAR_MUESTRAS, cola, gr8_feed.MUESTRAS_POR_COLA
                    )
    except Exception as error:
        raise EscrituraFallida(type(error).__name__) from error


async def _confirmar(mensaje) -> None:
    await mensaje.ack()


async def _vaciador(recolector: Recolector, pool: asyncpg.Pool, hay_que_vaciar: asyncio.Event) -> None:
    fallos = 0
    while True:
        try:
            await asyncio.wait_for(hay_que_vaciar.wait(), gr8_feed.VACIADO_SEGUNDOS)
        except asyncio.TimeoutError:
            pass
        hay_que_vaciar.clear()
        lote = recolector.tomar()
        if not lote.pendientes:
            continue
        try:
            await vaciar(lote, partial(escribir_lote, pool), _confirmar)
            fallos = 0
        except EscrituraFallida as error:
            # La base no contestó (un failover, por ejemplo). Nada se
            # confirmó: el lote vuelve a la memoria y los mensajes siguen
            # sin confirmar, que es lo que el broker necesita para no
            # perderlos. Si tarda, el prefetch frena la llegada.
            recolector.devolver(lote)
            espera = espera_reconexion(fallos, azar=random.random())
            fallos += 1
            log.warning(
                "no se pudo escribir la observación (%s); %d mensajes quedan "
                "sin confirmar, se reintenta en %.1fs",
                error, len(recolector.actual), espera,
            )
            await asyncio.sleep(espera)
        # Un fallo al CONFIRMAR no se captura: es la conexión al broker, y
        # sale al ciclo para reconectar. Lo ya escrito se contará de nuevo
        # al volver esos mensajes; por eso existe `reentregados`.


async def _ciclo(cfg: Config, pool: asyncpg.Pool, muestreo: Muestreo, parar: asyncio.Event) -> float:
    """Una conexión, de principio a fin. Devuelve cuánto duró de pie."""
    import aio_pika

    inicio = time.monotonic()
    recolector = Recolector()
    hay_que_vaciar = asyncio.Event()
    caida = asyncio.Event()

    conexion = await aio_pika.connect(
        cfg.url, timeout=30, client_properties={"connection_name": "iaqp-feed-gr8"}
    )
    vaciador = None
    try:
        conexion.close_callbacks.add(lambda *_: caida.set())
        canal = await conexion.channel()
        canal.close_callbacks.add(lambda *_: caida.set())
        # Por consumidor (una cola): el tope total sin confirmar es
        # prefetch x cantidad de colas. Acotado, que es lo que se pide.
        await canal.set_qos(prefetch_count=cfg.prefetch)

        async def al_recibir(cola: str, mensaje) -> None:
            recolector.actual.registrar(
                cola, mensaje.body, mensaje, time.time(),
                reentregado=bool(mensaje.redelivered), muestreo=muestreo,
            )
            # La mitad del prefetch: el límite es POR COLA, así que una cola
            # ocupada se frena al llegar a él. Vaciar antes de topar evita
            # que el broker deje de mandar mientras esperamos el reloj.
            if len(recolector.actual) >= max(1, cfg.prefetch // 2):
                hay_que_vaciar.set()

        # Una cola que no existe o para la que no tenemos permiso cierra el
        # canal. Si eso tumbara el ciclo entero, un solo nombre mal escrito
        # —o un permiso que GR8 no nos dio— dejaría la etapa de observación
        # sin un solo dato. Se toma cada cola en su propio canal: la que
        # falla se reporta y las otras ocho siguen hablando.
        enganchadas = []
        fallidas = []
        for nombre in cfg.colas:
            try:
                canal_cola = await conexion.channel()
                # Si este canal se cierra solo —por ejemplo porque GR8 borró
                # la cola— hay que enterarse: sin este aviso perderíamos esa
                # cola durante toda la semana de observación y el resumen
                # final diría "no llegó nada" en vez de "dejó de llegar".
                canal_cola.close_callbacks.add(
                    lambda *_, q=nombre: log.error(
                        "[GR8] se cerró el canal de la cola %s", q))
                await canal_cola.set_qos(prefetch_count=cfg.prefetch)
                # No se declara la cola: es de GR8, con sus argumentos.
                # Declarar distinto a como existe cierra el canal.
                cola = await canal_cola.get_queue(nombre, ensure=False)
                await cola.consume(partial(al_recibir, nombre), no_ack=False)
                enganchadas.append(nombre)
            except Exception as e:
                fallidas.append(nombre)
                log.error("[GR8] no se pudo consumir la cola %s: %s: %s",
                          nombre, type(e).__name__, e)

        if not enganchadas:
            # Ninguna respondió: eso no es una cola mal escrita, es la
            # conexión o las credenciales. Que reintente el ciclo de afuera.
            raise RuntimeError(
                f"ninguna de las {len(cfg.colas)} colas pudo consumirse")

        if fallidas:
            log.error("[GR8] %d colas quedaron afuera: %s. Revisar el nombre "
                      "y el permiso con GR8.", len(fallidas), ", ".join(fallidas))
        log.info("consumiendo %d de %d colas de %s", len(enganchadas),
                 len(cfg.colas), gr8_feed.url_para_log(cfg.url))

        vaciador = asyncio.create_task(_vaciador(recolector, pool, hay_que_vaciar))
        esperas = [asyncio.create_task(caida.wait()), asyncio.create_task(parar.wait())]
        hechas, _ = await asyncio.wait([vaciador, *esperas], return_when=asyncio.FIRST_COMPLETED)
        for t in esperas:
            t.cancel()
        if vaciador in hechas:
            vaciador.result()  # relanza el fallo de confirmación
        if parar.is_set():
            # Apagado ordenado: lo ya recibido se escribe y se confirma, y
            # lo que no alcance vuelve a la cola al cerrar.
            vaciador.cancel()
            try:
                await asyncio.wait_for(
                    vaciar(recolector.tomar(), partial(escribir_lote, pool), _confirmar), 5
                )
            except Exception:
                log.warning("apagado: el último lote no se pudo escribir; vuelve a la cola")
        else:
            raise ConnectionError("se cerró la conexión con el broker")
    finally:
        if vaciador is not None and not vaciador.done():
            vaciador.cancel()
        try:
            await conexion.close()
        except Exception:
            pass
    return time.monotonic() - inicio


async def main() -> int:
    try:
        cfg = gr8_feed.config_del_entorno()
        if not os.environ.get("DATABASE_URL"):
            raise Gr8NoConfigurado("Falta DATABASE_URL: no hay dónde registrar lo observado.")
    except Gr8NoConfigurado as error:
        # Falla cerrado y lo dice: salir con error es lo único que se ve en
        # el panel de Railway. Quedarse callado "andando" escondería que no
        # llega ninguna cuota.
        log.error("consumidor de GR8 sin arrancar: %s", error)
        return 1

    parar = asyncio.Event()
    bucle = asyncio.get_running_loop()
    for senal in (signal.SIGTERM, signal.SIGINT):
        bucle.add_signal_handler(senal, parar.set)

    muestreo = Muestreo()
    pool = None
    intento = 0
    try:
        while not parar.is_set():
            vivo = 0.0
            try:
                if pool is None:
                    pool = await abrir_pool()
                vivo = await _ciclo(cfg, pool, muestreo, parar)
            except asyncio.CancelledError:
                raise
            except Exception as error:
                log.warning(
                    "conexión con GR8 caída: %s: %s",
                    type(error).__name__, sin_secretos(str(error), cfg.url),
                )
            if parar.is_set():
                break
            if vivo >= gr8_feed.CONEXION_ESTABLE_SEGUNDOS:
                intento = 0
            espera = espera_reconexion(intento, azar=random.random())
            intento += 1
            log.info("reconectando en %.1fs (intento %d)", espera, intento)
            try:
                await asyncio.wait_for(parar.wait(), espera)
            except asyncio.TimeoutError:
                pass
    finally:
        if pool is not None:
            await pool.close()
    return 0


if __name__ == "__main__":
    from dotenv import load_dotenv

    load_dotenv()
    logging.basicConfig(
        level=logging.INFO,
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
    )
    # Las librerías de AMQP pueden escribir la dirección de conexión, con la
    # clave, en sus mensajes de depuración.
    for nombre in ("aio_pika", "aiormq", "pamqp"):
        logging.getLogger(nombre).setLevel(logging.WARNING)
    sys.exit(asyncio.run(main()))
