-- Registro pendiente de confirmación por correo.
--
-- Hoy el alta desde el sitio crea al jugador de una y recién después ofrece
-- verificar el teléfono. Eso deja un agujero: nadie comprobó que el correo
-- existe ni que es de quien dice serlo, y el correo es la única forma de
-- recuperar la cuenta de un jugador "de la casa". Esta tabla mueve esa
-- comprobación ANTES de crear la fila en `users`: mientras el código no
-- llega y se confirma, la cuenta no existe.
--
-- Por qué una tabla nueva y no un estado "pendiente" dentro de `users`:
-- crear la fila en `users` para después borrarla si el código nunca llega
-- rompe cualquier cosa que cuente jugadores, dispare un webhook o mire
-- `users` esperando una cuenta real. Una tabla aparte no contamina nada, y
-- se puede barrer sin dejar rastro de intentos que nunca se completaron.
CREATE TABLE IF NOT EXISTS public.registro_pendiente (
    id             BIGSERIAL PRIMARY KEY,

    -- El identificador que viaja al navegador. Nunca el id de la fila: ese
    -- es correlativo y numerarlo de 1 en 1 le regala a cualquiera cuántos
    -- registros a medio hacer hay en un momento dado.
    token          TEXT NOT NULL UNIQUE,

    -- Los mismos datos que hoy recibe el alta de una: se guardan acá y se
    -- copian a `users` recién cuando el código se confirma. La clave va ya
    -- hasheada (auth.hash_password): si esta tabla se filtra, no hay claves
    -- en claro que filtrar.
    username       TEXT NOT NULL,
    password_hash  TEXT NOT NULL,
    nombre_completo TEXT NOT NULL,
    email          TEXT NOT NULL,
    email_normalizado TEXT NOT NULL,

    -- Formato internacional (+593..., +54..., +58...), tal cual lo guarda
    -- `registro_publico.normalizar_telefono`. A propósito NO es
    -- `telefono_e164`: ese campo es el que el índice único de `users` trata
    -- como un hecho comprobado, y acá todavía es solo lo que la persona
    -- escribió. Se copia a `users.telefono` (el texto libre) al confirmar,
    -- y solo pasa a ser un hecho verificado el día que la persona complete
    -- el código de `POST /api/me/telefono/verificar`.
    telefono       TEXT,

    referido_code  TEXT,
    ip             INET,

    -- El código nunca se guarda en claro, con el mismo hash_codigo/
    -- codigo_coincide que ya protege el código del teléfono. El "sujeto"
    -- del hash es el token de esta fila y no el correo, porque el token es
    -- impredecible: un hash atado al correo sería reproducible por
    -- cualquiera que conociera el correo de la persona.
    codigo_hash    TEXT NOT NULL,
    intentos       INTEGER NOT NULL DEFAULT 0,

    -- Cuántas veces se reenvió el código. Con esto alcanza para frenar el
    -- reenvío en bucle sin sumar otra ventana de tiempo: la fila entera
    -- vence en 15 minutos, así que el tope es siempre acotado.
    reenvios       INTEGER NOT NULL DEFAULT 0,

    creado_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_at      TIMESTAMPTZ NOT NULL
);

COMMENT ON TABLE public.registro_pendiente IS
    'Un registro a medio hacer, esperando que la persona confirme el código que le llegó por correo. No es un jugador: si el código nunca llega, esta fila se borra y en `users` no queda nada.';
COMMENT ON COLUMN public.registro_pendiente.telefono IS
    'El teléfono tal como lo escribió la persona, ya normalizado. Es una declaración, no un hecho: nunca se escribe en users.telefono_e164 desde acá.';

-- El barrido de filas vencidas (se hace desde el propio endpoint de
-- iniciar, de forma oportunista) y la búsqueda por token usan este orden.
CREATE INDEX IF NOT EXISTS registro_pendiente_vencidos
    ON public.registro_pendiente USING btree (expira_at);

CREATE INDEX IF NOT EXISTS registro_pendiente_por_ip
    ON public.registro_pendiente USING btree (ip, creado_at DESC);

ALTER TABLE public.registro_pendiente ENABLE ROW LEVEL SECURITY;
