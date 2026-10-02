-- Marca las muestras que son "el mensaje más grande de su ventana".
--
-- Antes la muestra eran los primeros mensajes tras arrancar: consecutivos y
-- chicos. Ahora el consumidor guarda el mayor de cada ventana de 15 minutos.
-- Sin esta columna no se distinguiría una fila vieja de una nueva mirando la
-- tabla, y las viejas no sirven para modelar tamaños. Las existentes quedan
-- en false a propósito: no sabemos que sean mayores de nada.
--
-- Se aplica ANTES de desplegar el consumidor: el INSERT nuevo nombra la
-- columna y fallaría sin ella.
ALTER TABLE public.gr8_obs_muestra
    ADD COLUMN IF NOT EXISTS mayor_de_ventana BOOLEAN NOT NULL DEFAULT false;
