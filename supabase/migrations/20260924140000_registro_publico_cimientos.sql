-- Cimientos del registro público desde el navegador.
--
-- Tres cosas: identidad de Google, unicidad real de teléfono y correo, y la
-- bitácora de códigos de verificación.
--
-- Por qué columnas nuevas y no un índice sobre `telefono` y `email`: esas dos
-- son texto libre que cargan las agencias a mano. Un índice único sobre ellas
-- puede no poder crearse (si ya hay repetidos) y además no serviría, porque el
-- mismo número escrito de dos formas distintas pasaría igual. Las columnas
-- normalizadas las llena solo el flujo nuevo, con el formato internacional.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS google_sub            TEXT,
    ADD COLUMN IF NOT EXISTS email_normalizado     TEXT,
    ADD COLUMN IF NOT EXISTS telefono_e164         TEXT,
    ADD COLUMN IF NOT EXISTS telefono_verificado_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS edad_declarada_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS origen_registro       TEXT;

COMMENT ON COLUMN public.users.google_sub IS
    'Identificador estable de la cuenta de Google. No cambia si la persona cambia su correo.';
COMMENT ON COLUMN public.users.telefono_e164 IS
    'Teléfono en formato internacional (+593..., +54..., +58...). Es el que se verifica y el que es único.';
COMMENT ON COLUMN public.users.edad_declarada_at IS
    'Cuándo declaró ser mayor de edad. Declaración, no verificación: queda registrada por si más adelante se exige probarlo.';
COMMENT ON COLUMN public.users.origen_registro IS
    'web | telegram | agencia | admin. Permite distinguir al que se registró solo.';

-- Unicidad real, solo sobre lo normalizado y solo donde hay valor.
CREATE UNIQUE INDEX IF NOT EXISTS users_google_sub_unico
    ON public.users USING btree (google_sub) WHERE google_sub IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_email_normalizado_unico
    ON public.users USING btree (email_normalizado) WHERE email_normalizado IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS users_telefono_e164_unico
    ON public.users USING btree (telefono_e164) WHERE telefono_e164 IS NOT NULL;

-- Para separar en los reportes a los que llegaron solos.
CREATE INDEX IF NOT EXISTS users_origen_registro
    ON public.users USING btree (origen_registro) WHERE origen_registro IS NOT NULL;


-- Códigos de verificación por SMS.
--
-- El código se guarda con hash, nunca en claro: quien lea la base no puede
-- usarlo para tomar una cuenta ajena. Las filas viejas sirven además para
-- frenar el abuso: se cuenta cuántas pidió la misma IP o el mismo número.
CREATE TABLE IF NOT EXISTS public.verificaciones_telefono (
    id            BIGSERIAL PRIMARY KEY,
    telefono_e164 TEXT NOT NULL,
    codigo_hash   TEXT NOT NULL,
    canal         TEXT NOT NULL DEFAULT 'sms',   -- sms | whatsapp | voz
    proveedor     TEXT,                          -- twilio, o el que sea
    ip            INET,
    intentos      INTEGER NOT NULL DEFAULT 0,
    enviado_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_at     TIMESTAMPTZ NOT NULL,
    consumido_at  TIMESTAMPTZ,
    error         TEXT
);

-- El barrido de códigos vigentes y el conteo para el freno.
CREATE INDEX IF NOT EXISTS verificaciones_telefono_vigentes
    ON public.verificaciones_telefono USING btree (telefono_e164, enviado_at DESC);

CREATE INDEX IF NOT EXISTS verificaciones_telefono_por_ip
    ON public.verificaciones_telefono USING btree (ip, enviado_at DESC);

ALTER TABLE public.verificaciones_telefono ENABLE ROW LEVEL SECURITY;
