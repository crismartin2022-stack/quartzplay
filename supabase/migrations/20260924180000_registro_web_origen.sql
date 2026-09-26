-- De dónde vino cada registro hecho desde el navegador.
--
-- Sirve para una sola cosa, y es importante: frenar la creación masiva de
-- cuentas desde una misma conexión. Sin guardar esto no hay forma de contar,
-- y el registro público sin freno es una fábrica de cuentas basura.
--
-- Solo se llena en el registro web. Las altas por agencia o por Telegram
-- siguen como estaban.

ALTER TABLE public.users
    ADD COLUMN IF NOT EXISTS registro_ip INET,
    ADD COLUMN IF NOT EXISTS registro_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS referido_code TEXT;

COMMENT ON COLUMN public.users.registro_ip IS
    'Conexión desde la que se creó la cuenta por el sitio. Solo para contar altas y frenar abuso.';
COMMENT ON COLUMN public.users.referido_code IS
    'Código de agencia que trajo al jugador, si lo puso al registrarse. Queda como historia aunque después se lo reasigne.';

CREATE INDEX IF NOT EXISTS users_registro_ip_fecha
    ON public.users USING btree (registro_ip, registro_at DESC)
    WHERE registro_ip IS NOT NULL;
