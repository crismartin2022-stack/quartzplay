-- Credenciales de proveedores (SMS, correo, y lo que se agregue después),
-- editables desde el panel de admin en vez de una variable de Railway.
--
-- Por qué no texto plano: quien se lleve un volcado de esta base, o entre
-- por una inyección SQL, no debería llevarse la clave de Dexatel o de
-- Resend con eso solo. `valor_cifrado` es la salida de
-- `bot/secretos.py::cifrar()` — AES-GCM con la llave maestra
-- (`SECRETOS_CLAVE`) fuera de la base, solo en el entorno del bot. Esta
-- tabla nunca guarda el valor en claro; si algún día lo hace, es un bug,
-- no una migración.
--
-- Por qué `ambito` + `clave` y no una columna por proveedor: el mismo
-- proveedor tiene varios campos (Dexatel: clave de API y remitente de SMS
-- y de WhatsApp; Resend: clave de API y remitente), y el alcance de esta
-- migración es SMS y correo pero el plan es sumar PSP y Telegram por el
-- mismo camino. Una fila por campo permite eso sin tocar el esquema de
-- nuevo: un `ambito` nuevo es una fila nueva, no una columna nueva.
CREATE TABLE IF NOT EXISTS public.credenciales_mensajeria (
    id              BIGSERIAL PRIMARY KEY,
    ambito          TEXT NOT NULL,   -- sms | correo (psp, telegram después)
    clave           TEXT NOT NULL,   -- nombre del campo dentro del ámbito
    valor_cifrado   TEXT NOT NULL,   -- nonce + cifrado, en base64 urlsafe
    actualizado_por TEXT NOT NULL DEFAULT 'admin',
    actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Una fila por campo: guardar de nuevo el mismo campo pisa el valor
-- anterior (UPSERT), no crea una segunda fila que deje ambiguo cuál rige.
CREATE UNIQUE INDEX IF NOT EXISTS credenciales_mensajeria_unica
    ON public.credenciales_mensajeria USING btree (ambito, clave);

-- La pantalla lista todo por ámbito para armar la vista enmascarada.
CREATE INDEX IF NOT EXISTS credenciales_mensajeria_por_ambito
    ON public.credenciales_mensajeria USING btree (ambito);

ALTER TABLE public.credenciales_mensajeria ENABLE ROW LEVEL SECURITY;
