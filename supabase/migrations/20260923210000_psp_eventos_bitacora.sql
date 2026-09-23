-- Bitácora de avisos del PSP: se guarda el aviso antes de procesarlo.
--
-- El manejador de webhooks acredita dentro de una transacción, así que no
-- duplica ni deja medio acreditado. Lo que no resuelve es un reinicio de la
-- API a mitad de camino: la transacción se revierte y no queda rastro de que
-- el aviso llegó. Esta tabla es ese rastro; un barrido periódico procesa lo
-- que haya quedado en 'recibido'.
--
-- La unicidad por (evento, request_id) hace que un reintento del proveedor
-- no cree una segunda fila: se actualiza la que ya está.

CREATE TABLE IF NOT EXISTS public.psp_eventos (
    id            BIGSERIAL PRIMARY KEY,
    tipo          TEXT NOT NULL,                      -- 'cashin' | 'payout'
    evento        TEXT NOT NULL DEFAULT '',           -- lo que manda el proveedor: MATCHED, EXPIRED, ...
    request_id    TEXT NOT NULL,
    uid           TEXT NOT NULL DEFAULT '',
    cuerpo        JSONB NOT NULL,
    estado        TEXT NOT NULL DEFAULT 'recibido',   -- recibido | procesado | fallido
    intentos      INTEGER NOT NULL DEFAULT 0,
    ultimo_error  TEXT,
    recibido_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    procesado_at  TIMESTAMPTZ
);

CREATE UNIQUE INDEX IF NOT EXISTS psp_eventos_unico
    ON public.psp_eventos USING btree (tipo, request_id, evento);

-- El barrido busca por acá: lo pendiente, lo más viejo primero.
CREATE INDEX IF NOT EXISTS psp_eventos_pendientes
    ON public.psp_eventos USING btree (estado, recibido_at)
    WHERE estado <> 'procesado';

ALTER TABLE public.psp_eventos ENABLE ROW LEVEL SECURITY;
