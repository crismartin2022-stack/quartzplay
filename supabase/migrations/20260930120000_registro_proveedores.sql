-- El registro de proveedores de casino: lo que hace falta para que haya más
-- de uno sin reescribir nada.
--
-- Por qué NO es una tabla nueva: `casino_integraciones` ya es el registro.
-- Tiene una fila por proveedor (código, URL, credenciales, monedas,
-- prioridad), sus pantallas de admin y las 2.140 jugadas de 44neoluck
-- colgando de `casino_juegos.integracion`. Crear otra tabla dejaría dos
-- fuentes de verdad para lo mismo. Esta migración solo le agrega lo que
-- le falta. IAQP no tiene marcas, tiene agencias, así que una fila por
-- proveedor alcanza.

-- Qué adaptador habla con este proveedor. 44neoluck firma con HMAC en
-- cabeceras; Atomic manda la clave en el cuerpo; Content360 firma de otra
-- forma. Sin esta columna el código tendría que adivinar el protocolo por
-- el nombre. El default es el adaptador que ya existe, así que las filas
-- actuales no cambian de comportamiento.
ALTER TABLE public.casino_integraciones
    ADD COLUMN IF NOT EXISTS adaptador TEXT NOT NULL DEFAULT 'neoluck';

-- La clave del proveedor, cifrada con `bot/secretos.py` (AES-GCM, llave
-- maestra solo en el entorno). Es lo único que se cifra: la URL y el id de
-- operador (`api_code`) no le dan poder a nadie que no lo tenga ya, y
-- cifrarlos solo esconde lo que el admin necesita leer. Mismo criterio que
-- `CAMPOS_SECRETOS` en la mensajería.
--
-- `api_secret` (texto plano) se conserva como lectura de transición: la
-- fila actual de 44neoluck la tiene ahí y sigue funcionando. Al guardar
-- una clave con llave maestra disponible se escribe en esta columna y
-- `api_secret` queda en NULL; nunca las dos.
ALTER TABLE public.casino_integraciones
    ADD COLUMN IF NOT EXISTS api_secret_cifrado TEXT;

-- Las IP desde las que aceptamos callbacks de este proveedor: direcciones
-- sueltas o rangos CIDR, IPv4 e IPv6. Vive acá y no en una variable de
-- entorno porque Atomic cambió sus IP de salida tres veces en doce días, y
-- cada cambio no puede costar un deploy. Vacío significa "no se acepta
-- ninguna" (falla cerrado), no "se acepta cualquiera": ver
-- `registro_proveedores.ip_permitida`.
ALTER TABLE public.casino_integraciones
    ADD COLUMN IF NOT EXISTS ips_permitidas TEXT[] NOT NULL DEFAULT '{}';

-- Idempotencia compartida. `casino_movimientos.ref` ya sirve para la clave
-- exacta (tiene índice único), y su `saldo_post` es justo lo que hay que
-- devolver cuando un pedido se repite. Lo que le faltaba es saber de qué
-- proveedor y de qué ronda es cada movimiento, para el segundo control.
--   proveedor: código de la integración (`atomic`, `c360`...). NULL en los
--              movimientos anteriores y en los de la billetera propia.
--   ronda:     identificador de ronda que manda el proveedor.
ALTER TABLE public.casino_movimientos
    ADD COLUMN IF NOT EXISTS proveedor TEXT;
ALTER TABLE public.casino_movimientos
    ADD COLUMN IF NOT EXISTS ronda TEXT;

-- Segundo control: un reintento puede llegar con un id de transacción
-- nuevo pero el mismo tipo y monto dentro de la misma ronda. NO es único a
-- propósito: dos apuestas legítimas iguales en una ronda existen, y una
-- restricción las rechazaría. Es un índice de búsqueda; la decisión la toma
-- `registro_proveedores.buscar_previo`, con una ventana de tiempo corta. Parcial
-- porque los movimientos sin ronda (todos los actuales) no lo necesitan.
CREATE INDEX IF NOT EXISTS casino_mov_proveedor_ronda
    ON public.casino_movimientos USING btree (proveedor, ronda, tipo, monto)
    WHERE ronda IS NOT NULL;
