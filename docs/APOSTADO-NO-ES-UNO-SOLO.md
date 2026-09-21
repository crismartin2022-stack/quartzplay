# CRÍTICO — "Apostado" no significa lo mismo en el Cierre que en el gráfico

Estado: vigente. Marcado como crítico el 2026-09-21.

## El hecho

El **Cierre** (`admin_cierre`, `agencia_cierre` en `bot/casino_api.py`) suma
**todos los productos** en sus cifras de cabecera. Está escrito en el código,
cerca de la línea 1303:

> `# El cierre tiene que dar el total de TODOS los productos, no solo...`

Agrega casino y ruleta encima de lo deportivo mediante
`_comision_casino_cascada`, una cascada por producto y por agencia.

Los endpoints de serie por día —`/api/admin/serie` y
`/api/agencias/me/serie`— calculan `apostado` y `premios` **solo
deportivas** (`_calcular_ggr`), porque esa cascada no se puede agrupar por
día sin volverse carísima.

## Por qué importa

Un gráfico rotulado "Apostado" debajo de un total rotulado "Apostado"
muestra **un número más chico que el total que tiene justo encima**, sin
explicación. Quien lo mire va a buscar un bug que no existe.

## Qué se hizo

Los gráficos se llaman **"Apostado deportivo por día"** y **"Premios
deportivos"**, con una línea al pie:

> Serie solo deportivas; el total de arriba incluye casino.

`tickets` y `neto_caja` no tienen este problema: cada uno sale de una sola
tabla y coincide con lo que muestra la pantalla.

## Lo que NO es

**Una serie con casino incluido no es un ajuste ni un parámetro nuevo.**
Significa hacer que esa cascada se pueda agrupar por día, o construir una
tabla de acumulados que se escriba a medida que entra la operación.

No prometer esa serie como un cambio de rótulo.

## Colisión relacionada, sin resolver

`premios` también significa dos cosas según dónde se mire:

| Dónde | Tipo de movimiento | Qué es |
|---|---|---|
| Cierre (`_calcular_ggr`) | `pago_premio` | premio acreditado |
| Caja (`_resumen_caja`) | `premio` | plata pagada en el mostrador |

Hoy cada pantalla usa el suyo de forma consistente, así que no rompe nada.
El día que alguien compare los dos y no den, va a perder una tarde.
