# Los avisos de pago no se pueden perder

## Objective

Que un aviso de pago del proveedor (PSP) quede guardado antes de
procesarse, de modo que un reinicio de la API a mitad de camino no haga
desaparecer un depósito. Hoy el aviso se procesa en línea y, si el
proceso muere en ese instante, la transacción se revierte entera y el
dinero queda ingresado del lado del proveedor pero no acreditado del
nuestro.

## Who this is for

El **jugador** que depositó: hoy su plata puede quedar en el limbo hasta
que alguien la note y la cargue a mano. Y el **negocio**, que se entera
por un reclamo, no por una alarma.

Importa ahora y no después porque el PSP todavía no está activo en
producción (#35). Cuando se active, este camino pasa a mover dinero real
de verdad. Arreglarlo antes cuesta horas; arreglarlo después cuesta
reclamos.

## What is already fine, y conviene no romperlo

Verificado en `bot/casino_api.py:21599-21662` el 2026-09-23:

- El acreditado corre **dentro de una transacción**, con `FOR UPDATE`
  sobre la fila de la carga.
- Hay **control de estado**: si la carga no está `pendiente` o `vencido`,
  no vuelve a acreditar. Un reintento del proveedor no duplica el saldo.
- Los registros secundarios (movimiento de agencia, bono automático) van
  en `try` y no tumban la acreditación si fallan.

O sea: el problema **no es idempotencia ni atomicidad**. Es durabilidad.
Si el proceso muere antes de confirmar, no queda rastro de que el aviso
llegó.

## Lo que falta saber

**¿El proveedor reintenta un aviso que no recibió respuesta?** No está
documentado de nuestro lado y define cuánto vale este trabajo: si
reintenta, esto es una red de seguridad; si no reintenta, es la única
red. Está en la lista de preguntas del issue #35 y hay que preguntarlo
igual.

## Scope

- `bot/casino_api.py`, manejador `psp_webhook_cashin` y el de payout.
- Una migración nueva en `supabase/migrations/`.
- Un barrido periódico que reintente lo que quedó sin procesar.

Fuera de alcance: activar el PSP, pedir la clave, y cualquier cambio en
la lógica de acreditación, que ya está bien.

## Tasks

- [ ] **T1 — La bitácora de avisos.** Migración con la tabla
      `psp_eventos`: identificador del aviso, tipo, cuerpo crudo, estado
      (`recibido` / `procesado` / `fallido`), intentos, error y fechas.
      Clave única por aviso para que un reintento del proveedor no cree
      dos filas.
- [ ] **T2 — Guardar antes de procesar.** El manejador escribe el aviso
      y confirma; recién entonces procesa. Si el proceso muere, la fila
      queda en `recibido`.
- [ ] **T3 — El barrido.** Un ciclo que cada minuto toma los avisos en
      `recibido` con más de dos minutos de antigüedad y los procesa, con
      el mismo camino de siempre. Reintentos con límite y registro del
      error.
- [ ] **T4 — Alarma.** Si un aviso queda sin procesar más de N minutos o
      agota los reintentos, que quede visible. Sin esto, el arreglo tapa
      el problema en vez de mostrarlo.
- [ ] **T5 — Pruebas.** Un aviso que muere a mitad de procesamiento
      queda guardado y el barrido lo acredita una sola vez; un aviso
      repetido no crea dos filas ni acredita dos veces.

## Checks

- `cd bot && python -m pytest tests -q` en verde.
- La migración se aplica primero en staging, con el script del dueño, y
  se verifica con una carga de monto bajo antes de tocar producción.

## Delivery

Una rama, un PR. El dueño aplica la migración y mergea.
