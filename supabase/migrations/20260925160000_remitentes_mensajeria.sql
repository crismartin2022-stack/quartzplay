-- Remitentes de SMS y WhatsApp, uno o varios por canal, cada uno con los
-- países que tiene habilitados ante el operador.
--
-- Por qué hace falta esto y `credenciales_mensajeria` no alcanza: esa tabla
-- guarda un remitente por canal, y la habilitación de un remitente ante una
-- operadora es por país, no global. Ya pasó: "IAQP Col" salió aprobado para
-- Argentina, Colombia y Venezuela, y "IAQP EC" quedó pendiente solo para
-- Ecuador. Con un único remitente en el entorno, un jugador ecuatoriano se
-- registra bien pero nunca puede verificar el teléfono, y como el teléfono
-- destraba los retiros, termina pudiendo depositar y jugar pero no cobrar.
--
-- Por qué esta tabla NO se cifra, a diferencia de `credenciales_mensajeria`:
-- un remitente no es un secreto. Es un nombre que viaja en cada mensaje y
-- que el jugador ve tal cual en su teléfono ("IAQP Col te escribe: ...").
-- Cifrarlo no protege nada — nadie roba una cuenta con el nombre del
-- remitente — y en cambio hace imposible mirar la base y entender por qué
-- un envío salió con un remitente y no con otro. Con la clave de la API sí
-- hay algo que proteger (`credenciales_mensajeria` sigue cifrada); con esto
-- no hay nada que ganar ocultándolo y sí mucho que perder para diagnosticar.
CREATE TABLE IF NOT EXISTS public.remitentes_mensajeria (
    id              BIGSERIAL PRIMARY KEY,
    canal           TEXT NOT NULL,              -- sms | whatsapp
    remitente       TEXT NOT NULL,               -- lo que ve la persona en el mensaje
    -- Códigos ISO 3166-1 alpha-2 que este remitente tiene habilitados ante
    -- el operador. Vacío = remitente por defecto del canal: el que se usa
    -- cuando el país del destino no matchea a ninguno de los específicos.
    paises          TEXT[] NOT NULL DEFAULT '{}',
    activo          BOOLEAN NOT NULL DEFAULT true,
    actualizado_por TEXT NOT NULL DEFAULT 'admin',
    actualizado_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Un remitente no se repite dentro del mismo canal: guardar de nuevo el
-- mismo par (canal, remitente) desde el panel actualiza su lista de países
-- y si está activo, no crea una segunda fila ambigua.
CREATE UNIQUE INDEX IF NOT EXISTS remitentes_mensajeria_unico
    ON public.remitentes_mensajeria USING btree (canal, remitente);

-- La elección del remitente filtra siempre por canal y activo primero, y
-- después busca el país dentro de `paises`: un índice GIN es lo que hace
-- rápida esa segunda parte (contención sobre un arreglo).
CREATE INDEX IF NOT EXISTS remitentes_mensajeria_por_canal
    ON public.remitentes_mensajeria USING btree (canal, activo);

CREATE INDEX IF NOT EXISTS remitentes_mensajeria_paises
    ON public.remitentes_mensajeria USING gin (paises);

ALTER TABLE public.remitentes_mensajeria ENABLE ROW LEVEL SECURITY;
