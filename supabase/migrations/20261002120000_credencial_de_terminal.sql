-- La credencial de la terminal: el alta de un Box, con un código de un solo uso.
--
-- El Box es la pantalla de autoconsulta del mostrador. No sabía nada de sí
-- misma más que el código de agencia de su dirección (`/box/AGE002`), y una
-- dirección no es una credencial: la escribe cualquiera. Por eso el cash out
-- del Box necesitaba un endpoint abierto, y por eso ese endpoint era un
-- agujero. Ahora la terminal se da de alta una vez y manda `Bearer` como todos.
--
-- POR QUÉ UNA TABLA NUEVA Y NO `vinculos_telegram`. Esa tabla es la que ya
-- emite códigos de un solo uso con vencimiento, y la forma se copió de ahí a
-- propósito. Pero lo que guarda es la vinculación de un Telegram: tiene
-- `telegram_id` y un `tipo` que discrimina entre 'cliente' y 'agencia', y un
-- alta de terminal no vincula ningún Telegram. Metiendo un `tipo='terminal'`
-- con `telegram_id` siempre nulo, cada consulta de esa tabla pasaría a tener
-- que acordarse de excluir filas que no son vinculaciones. Son dos cosas
-- distintas que comparten la forma, no la misma cosa.
CREATE TABLE IF NOT EXISTS public.terminal_altas (
    id            BIGSERIAL   PRIMARY KEY,
    -- El código que se tipea una vez en la pantalla. NO es
    -- `terminales.codigo`: ese es el del QR, es público por su función —lo
    -- publica `/api/box/{code}/terminal` y lo lee cualquiera que escanee— y si
    -- sirviera para canjear, cualquiera que mirara la pared se haría pasar por
    -- terminal. Este nace de otro sorteo y vive en esta columna, que ninguna
    -- ruta abierta devuelve.
    codigo        TEXT        NOT NULL UNIQUE,
    terminal_id   INTEGER     NOT NULL REFERENCES public.terminales(id)
                                  ON DELETE CASCADE,
    -- La agencia que lo emitió. Es redundante con `terminales.agencia_code` y
    -- se guarda igual: dice quién firmó la emisión en el momento en que la
    -- firmó, y eso no cambia si mañana la terminal se mueve de dueño.
    agencia_code  TEXT        NOT NULL,
    creado_por    TEXT,
    -- `usado` es lo que hace que el código sea de UN solo uso, y el canje lo
    -- mira adentro del WHERE de su propio UPDATE, no en un SELECT aparte: dos
    -- canjes simultáneos leerían los dos `false` y saldrían los dos con una
    -- credencial. Acá lo decide la base.
    usado         BOOLEAN     NOT NULL DEFAULT false,
    usado_at      TIMESTAMPTZ,
    -- Vence en 24 h, igual que el vínculo de Telegram. Un código de alta que no
    -- vence es una credencial latente: queda anotado en un papel del mostrador
    -- y sirve meses después, cuando ya nadie se acuerda de haberlo pedido.
    expira_at     TIMESTAMPTZ NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- El canje busca por código y es el único camino caliente. El UNIQUE de arriba
-- ya lo indexa; este índice es para la otra lectura: "¿qué altas tiene esta
-- terminal?", que es cómo se revisa una credencial que no se reconoce.
CREATE INDEX IF NOT EXISTS terminal_altas_por_terminal
    ON public.terminal_altas USING btree (terminal_id, created_at DESC);

ALTER TABLE public.terminal_altas ENABLE ROW LEVEL SECURITY;
