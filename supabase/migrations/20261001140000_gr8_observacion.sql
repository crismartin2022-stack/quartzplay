-- Observación del feed de GR8: lo que llega, medido, antes de interpretarlo.
--
-- Nadie midió cuántos mensajes manda GR8 ni de qué tamaño. Con esas dos
-- cifras se contesta "¿alcanza un solo consumidor?" y "¿cuánto cuesta
-- guardarlo?" con evidencia. Por eso esta etapa NO guarda los mensajes:
-- guarda contadores y una muestra acotada.
--
-- Por qué contadores por minuto y no un registro por mensaje: el feed es
-- continuo y una fila por mensaje convertiría la observación en el mismo
-- problema de volumen que se quiere medir. Un cubo por (cola, minuto) pesa
-- lo mismo llegue un mensaje o diez mil, y una semana entera son nueve
-- colas x 10.080 minutos como máximo: menos de cien mil filas. El minuto
-- alcanza para ver el pico, que es lo que decide si uno da abasto.
CREATE TABLE IF NOT EXISTS public.gr8_obs_minuto (
    cola          TEXT        NOT NULL,   -- el nombre real de la cola, con sufijo si lo lleva
    minuto        TIMESTAMPTZ NOT NULL,   -- inicio del minuto, en UTC
    mensajes      INTEGER     NOT NULL DEFAULT 0,
    bytes         BIGINT      NOT NULL DEFAULT 0,
    bytes_max     INTEGER     NOT NULL DEFAULT 0,   -- el mensaje más grande del minuto
    -- Cuántos llegaron marcados como reentrega. Si el consumidor se cae con
    -- mensajes sin confirmar, el broker los vuelve a mandar y se cuentan dos
    -- veces; esta columna dice cuánto pasó, para no confundirlo con volumen.
    reentregados  INTEGER     NOT NULL DEFAULT 0,
    PRIMARY KEY (cola, minuto)
);

-- Una muestra por vez, acotada por cola: el consumidor borra las más viejas
-- al insertar. Se corta el cuerpo (ver `truncado`) porque lo que se quiere
-- ver es la forma del mensaje, no archivarlo.
CREATE TABLE IF NOT EXISTS public.gr8_obs_muestra (
    id            BIGSERIAL   PRIMARY KEY,
    cola          TEXT        NOT NULL,
    recibido_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    bytes         INTEGER     NOT NULL,   -- tamaño ORIGINAL del cuerpo
    truncado      BOOLEAN     NOT NULL DEFAULT false,
    cuerpo        TEXT        NOT NULL    -- texto tal cual llegó, sin parsear
);

-- El recorte por cola y la lectura de "las últimas de esta cola" van por acá.
CREATE INDEX IF NOT EXISTS gr8_obs_muestra_por_cola
    ON public.gr8_obs_muestra USING btree (cola, id DESC);

ALTER TABLE public.gr8_obs_minuto ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.gr8_obs_muestra ENABLE ROW LEVEL SECURITY;
