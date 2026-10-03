-- La taxonomía de GR8: deportes, categorías y torneos.
--
-- Es lo PRIMERO que se interpreta del feed. Hasta acá el consumidor solo
-- contaba y muestreaba. Se empieza por estas tres colas porque son las
-- chicas y quietas —39, 1.301 y 26.913 mensajes en total, contra 20 por
-- segundo en `markets`— así que es el lugar barato para equivocarse.
--
-- SE APLICA ANTES DE DESPLEGAR EL CONSUMIDOR. El consumidor nuevo nombra
-- estas tablas y la columna `descartados` en sus INSERT: si se despliega
-- primero, todos los lotes fallan a la vez, nada se confirma, y el broker
-- empieza a acumular. Al revés no pasa nada: estas tablas vacías no le
-- molestan a nadie, y el consumidor viejo las ignora.

-- La cadena es deporte -> categoría -> torneo, y cada una guarda el id de su
-- padre. Lo que NO lleva es clave ajena, y la razón es medida: las tres colas
-- son independientes y llegan desordenadas entre sí. De los 3 `categoryId`
-- distintos que se vieron en torneos, 1 tenía su categoría entre las
-- observadas. Un torneo que llega antes que su categoría con clave ajena se
-- rechaza, el mensaje se descarta, y ese torneo no vuelve hasta la próxima
-- republicación de GR8: perderíamos filas para proteger una integridad que el
-- feed no nos da. Mejor la fila huérfana, que se mide con un LEFT JOIN.

-- `id` es TEXT y no UUID a propósito: `sports.id` es "Football", no un guid.
-- Las otras dos traen 32 hex, pero no se valida la forma — rechazar por forma
-- es perder entidades el día que GR8 cambie el formato de sus ids.
CREATE TABLE IF NOT EXISTS public.gr8_deporte (
    id             TEXT        PRIMARY KEY,
    -- El nombre ya elegido por la regla de respaldo (es -> en -> la primera
    -- que haya) y, al lado, en qué idioma quedó. Las dos columnas van juntas
    -- o ninguna sirve: sin `nombre_idioma` la cobertura de español se
    -- descubre cuando un jugador ve una categoría en inglés; con ella se
    -- mide con un GROUP BY.
    nombre         TEXT,
    nombre_idioma  TEXT,
    -- NULL se permite porque puede no haber NINGÚN nombre usable. La fila se
    -- guarda igual: lo que la pantalla necesita primero es el enganche, y una
    -- fila sin nombre se cuenta, mientras que una fila que no existe rompe el
    -- enganche de todos sus eventos. Nunca se usa el `slug` como nombre: es
    -- texto técnico ("madrid-challenger"), no algo para leer.
    slug           TEXT,
    -- La versión con la que se decide el orden. En estas tres colas es
    -- `dataVersion`: `sourceDataVersion` no viene en ninguna (0 de 30
    -- muestras). En `markets` y `events` sí viene y ahí manda ese otro, y los
    -- dos campos van desfasados por una cantidad variable.
    data_version   BIGINT      NOT NULL,
    actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gr8_categoria (
    id             TEXT        PRIMARY KEY,
    deporte_id     TEXT,       -- `sport` del mensaje, p. ej. "Basketball"
    nombre         TEXT,
    nombre_idioma  TEXT,
    slug           TEXT,
    data_version   BIGINT      NOT NULL,
    actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.gr8_torneo (
    id             TEXT        PRIMARY KEY,
    categoria_id   TEXT,
    -- El torneo trae su propio `sport` además del de la categoría. Se guarda
    -- el del torneo porque es el que GR8 manda en ese mensaje; si algún día
    -- no coincide con el de su categoría, se ve comparando las dos columnas
    -- en vez de haber elegido una y perdido la otra.
    deporte_id     TEXT,
    nombre         TEXT,
    nombre_idioma  TEXT,
    slug           TEXT,
    data_version   BIGINT      NOT NULL,
    actualizado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Por acá va a entrar el catálogo (G7): "los torneos de esta categoría",
-- "las categorías de este deporte". Sin índice es un recorrido completo de
-- 27.000 torneos por cada pantalla.
CREATE INDEX IF NOT EXISTS gr8_categoria_por_deporte
    ON public.gr8_categoria USING btree (deporte_id);
CREATE INDEX IF NOT EXISTS gr8_torneo_por_categoria
    ON public.gr8_torneo USING btree (categoria_id);

ALTER TABLE public.gr8_deporte   ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gr8_categoria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gr8_torneo    ENABLE ROW LEVEL SECURITY;

-- Mensajes de una cola de taxonomía que llegaron y NO se pudieron
-- interpretar. Van al cubo de observación porque el grano (cola, minuto) ya
-- es el correcto para la única pregunta que importa: de lo que llegó en este
-- minuto, ¿entendimos todo? Si GR8 cambia el esquema, esta cuenta sube y se
-- ve en una consulta; tragado en un try/except mudo, desaparecerían torneos
-- y nadie sabría cuántos.
ALTER TABLE public.gr8_obs_minuto
    ADD COLUMN IF NOT EXISTS descartados INTEGER NOT NULL DEFAULT 0;

-- Las dos consultas que cierran la puerta de esta unidad, para no tener que
-- escribirlas de nuevo cuando haya datos vivos:
--
-- 1) El cruce de la taxonomía (hoy SIN VERIFICAR, y es el riesgo real: si no
--    cruza, el `tournamentId` del evento es de otro espacio de claves y el
--    modelo entero hay que repensarlo). Con eventos ya en tabla (G4) sale de
--    un JOIN; hasta entonces, contra los ids de las muestras de `events`:
--
--      SELECT count(*) FILTER (WHERE t.id IS NOT NULL)::float / count(*)
--      FROM (SELECT DISTINCT (cuerpo::jsonb->>'tournamentId') AS tid
--              FROM public.gr8_obs_muestra
--             WHERE cola LIKE 'events-queue%') e
--      LEFT JOIN public.gr8_torneo t ON t.id = e.tid;
--
--    Lo mismo cambiando `tournamentId`/`gr8_torneo` por
--    `categoryId`/`gr8_categoria` y `sport`/`gr8_deporte`.
--
-- 2) La cobertura de español, por campo y medida, no supuesta:
--
--      SELECT 'torneo' AS tabla, nombre_idioma, count(*)
--        FROM public.gr8_torneo GROUP BY 1, 2
--      UNION ALL SELECT 'categoria', nombre_idioma, count(*)
--        FROM public.gr8_categoria GROUP BY 1, 2
--      UNION ALL SELECT 'deporte', nombre_idioma, count(*)
--        FROM public.gr8_deporte GROUP BY 1, 2
--      ORDER BY 1, 3 DESC;
