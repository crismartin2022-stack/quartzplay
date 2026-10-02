# El feed de GR8

> **Estado: sin empezar.** Documento de arranque, 2026-10-01, escrito con
> los esquemas reales de su documentación y sus respuestas por escrito.

## Objective

Que las cuotas deportivas de IAQP vengan de GR8, en vivo, y que una
apuesta sobre un evento de GR8 se liquide con los resultados de GR8.

## Lo que cambia respecto de hoy

Hoy el sportsbook **pide** cuotas: llama a una API cuando las necesita y
las guarda en diccionarios en memoria del proceso.

GR8 **empuja**. Manda mensajes todo el tiempo por RabbitMQ y alguien
tiene que estar escuchando siempre.

No es una función más adentro de la API: **es un proceso nuevo**, con su
propio servicio, su reconexión y su manejo de atrasos.

## Lo que ya está confirmado

Por escrito de ellos, y leído de su documentación el 2026-10-01.

### La conexión

```
host:  iaqp-prod-feed.gr8-mts.com
port:  5671 (AMQPS/TLS)
vhost: integration
```

Servidores en AWS Frankfurt (`eu-central-1`). El panel de administración
(`iaqp-prod-rabbit-admin.gr8-mts.com`) tiene el puerto 443 **cerrado**
desde nuestra IP; el 5671 responde. Reclamado, sin resolver.

**La credencial actual quedó visible en una captura y hay que rotarla.**

### Las colas

De las doce documentadas, **nueve nos sirven**. Las otras tres
—`bet-returns`, `bet-rejected`, `bet-blocked`— son del lado de apuestas
del MTS, y nosotros solo compramos el feed.

| Cola | Qué trae |
|---|---|
| `markets-queue` | Mercados y cuotas por evento |
| `market-results-queue` | **Resultados: con esto se liquida** |
| `events-queue` | Eventos |
| `scores-queue` | Marcadores |
| `sports-queue`, `categories-queue`, `tournaments-queue` | Taxonomía |
| `event-free-form-templates-queue` | Mercados de forma libre |
| `line-items-dependency-pairs-queue` | Pares de dependencia |

Para pruebas, **las mismas colas con sufijo `-INT`**, en el mismo clúster
de producción. No hay servidor aparte.

### La liquidación se resuelve con una clave, y es la mejor noticia

Cada cuota viene con un `selectionKey`:

```json
"selectionKey": "[145,[],[0],1,0,[]]"
```

Y `market-results-queue` manda **ese mismo `selectionKey`** con su
resultado: `Win`, `Lose`, `Return`, `Return025`, `Return075` o `DeadHeat`.

Se guarda la clave al apostar y se liquida comparándola. **Sin Sportradar
y sin adivinar por nombre y fecha**, que es como se liquida hoy y es la
causa de pagarle mal a un jugador.

No exponen ids de Betradar, a propósito, porque sus eventos vienen de
varios feeds. No hacen falta.

### Local y visitante

`competitors[0]` es el local y `competitors[1]` el visitante. El nombre
del evento sigue la misma convención: `"local - visitante"`.

Sin ese dato, las cuotas de local y visitante se cruzan en silencio.

### Las traducciones: lo que creíamos era falso

**Esto decía que los nombres venían ya traducidos y que solo los mercados
necesitaban la API REST. Medido sobre las muestras, es falso.** Contando la
clave `"es"`:

| campo | con `es` |
|---|---|
| `events.sportName` | 9 / 9 |
| `events.tournamentName` | 9 / 9 |
| `events.categoryName` | 9 / 9 |
| `tournaments.name` | 6 / 10 |
| `events.name` | **1 / 9** |
| `events.competitors[].name` | **2 / 18** |
| `categories.name` | **0 / 10** |

**Los nombres de equipo —el texto más visible de la pantalla— vienen en
español 2 de 18 veces.** Un evento listó quince idiomas (`ar`, `el`, `en`,
`fa`, `ja`, `ka`, `ko`, `pt`, `ru`, `uk`, `zh`…) y ninguno era español.

Hace falta una **regla de respaldo explícita** (`es` → `en` → la primera
que haya) y **una columna que diga en qué idioma quedó cada nombre**, para
poder medir la cobertura en vez de descubrirla cuando un jugador vea un
equipo en coreano.

Preguntado a GR8 el 2026-10-02: si en producción la cobertura es mejor, si
se puede pedir por configuración de cuenta, o si el respaldo es el caso
normal.

## Las tres reglas que, si se ignoran, pagan mal

### 1. Las cuotas hay que ajustarlas nosotros

Viene un `oddsMultipliers` por marca. La cuenta es:

```
precio × multiplicador, y después redondear restando 0,005
```

Su propio ejemplo: `1.48 × 0.98580885 = 1.458997098` → **1.45**.

Publicar el precio crudo es publicar cuotas más altas que las pactadas, y
pagar de más en **cada** apuesta.

### 2. Las reglas de cuota baja son obligatorias

- `price < 1.005` → `price = 1.00`
- `1.005 < price < 1.01` → `price = 1.01`
- Un outcome en `1.00` **se suspende**
- **No se acepta una apuesta con `price = 1.00`**

Una cuota de 1.00 devuelve exactamente lo apostado. Es una apuesta sin
riesgo, y alguien la va a encontrar.

### 3. Los mensajes son fotos, no cambios

Si un mercado estaba en el mensaje anterior y no está en el actual, **se
cerró**. Lo mismo por market item y por outcome.

Tratarlo mal deja mercados fantasma aceptando apuestas sobre algo que GR8
ya cerró.

## Lo que hay que decidir antes de escribir código

### Una sola instancia, o sharding a propósito

Ellos lo confirmaron: *"you can connect multiple service instances to the
same queue and distribute (shard) messages"*. Varias instancias **se
reparten** los mensajes, y cada una ve media línea.

O corre una sola réplica, o se diseña el reparto explícitamente.

**Esto choca con el plan de mover todo a AWS con varias réplicas**, y
conviene resolverlo antes y no después.

### Dónde viven las cuotas

Hoy todas las cachés son diccionarios **en memoria del proceso**, y el
`Procfile` corre `web` y `worker` separados. Un consumidor en el worker
sería invisible para la API.

Las cuotas de GR8 tienen que vivir en un lugar compartido.

## Un riesgo que ya existe y este trabajo agranda

`validar_cuotas` (`casino_api.py:18387`) **falla abierto**: si el índice
de cuotas queda vacío, registra *"índice vacío: no se puede validar, se
deja pasar"* y acepta la apuesta con la cuota que mandó el cliente, que
además es la que congela el pago.

La razón está escrita y es defendible —rechazar todo dejaría la casa sin
poder tomar apuestas por un problema propio— pero **con un feed push, un
consumidor detenido se ve igual que "no cambiaron las cuotas"**. La
ventana se agranda y nadie se entera.

## Etapas

### Etapa 0 — Conectarse y mirar ✅ TERMINADA (2026-10-02)

- [x] **G1 — El consumidor.** Proceso aparte, AMQPS al 5671, ack manual
      con prefetch acotado, reconexión con espera creciente, una réplica.
      Vive en el servicio `quartzplay-gr8` de staging.
- [x] **G2 — Registrar lo que llega.** `gr8_obs_minuto` agrega por cola y
      por minuto; `gr8_obs_muestra` guarda muestras. **Consumiendo 9 de 9
      colas.**

**Lo que costó, para no repetirlo**: el sufijo de las colas era `-int` en
MINÚSCULA y nosotros usábamos `-INT`. RabbitMQ distingue mayúsculas en los
nombres de cola. GR8 además mandó por chat nombres equivocados
(`-iaqp-int`); su propia consola los desmintió. **Cuando hay captura de la
consola del proveedor, la captura manda sobre el chat.**

**Lo que midió, que es para lo que existía la etapa:**

| cola | bytes por mensaje |
|---|---|
| markets | 62 KB |
| market-results | 80 KB |
| events | 6,6 KB |
| scores | 990 bytes |

**Ese cálculo era de la hora más tranquila.** Medido sobre 6,8 horas
reales —3.700.196 mensajes, 136 GB—:

| franja | mensajes/s | caudal |
|---|---|---|
| 20:00, tranquila | 20 | 0,95 MB/s |
| 14:00, pico | **277** | **9,5 MB/s** |
| 15:00 | 284 | 7,4 MB/s |

**Del orden de 480 GB por día**, no 125. Y el mensaje más grande de
`markets` es **1,3 MB**, no 190 KB; uno de `market-results` llegó a **7 MB**.

Eso no es un feed de cuotas: **es el estado completo del mercado,
repetido**. Define toda la arquitectura.

**Y dos hallazgos que achican el problema:**

- **`sourceDataVersion`** viene en cada mensaje. Resuelve solo el problema
  del desorden: sin una versión no se sabe si la cuota que llega es más
  nueva que la guardada.
- **El peso es casi todo traducción.** El nombre de un torneo viene en
  unos 25 idiomas. Usamos uno.

## Etapa 1 — Diseño

> Escrito el 2026-10-02 leyendo las 90 muestras completas y 378 minutos de
> observación. Lo que sale de una muestra sola está marcado: una muestra no
> es una regla.

### La cadena, de deporte a cuota

```
sports            id: "Football"            (string, no guid)
  └─ categories   id: 32 hex · sport
      └─ tournaments  id: 32 hex · categoryId · sport
          └─ events   id: "18686596"  ← la clave de todo el feed
             │        competitors[0] = LOCAL, [1] = VISITANTE
             ├─ markets        .eventId     (foto completa del evento)
             ├─ scores         .eventId
             ├─ market-results .eventId
             └─ event-free-form-templates .id
```

Verificado: `events.id` cruza con `markets`, `scores` y `market-results`
(mismo `18696063`), y `competitors[].id` con `scores.pointInfos[]`.

**El cruce de la taxonomía NO está verificado**: `events.tournamentId` contra
`tournaments.id` dio 0 de 8, casi seguro por muestreo —las muestras de
taxonomía son de las 14:05 y los eventos de las 20:11— pero **"casi seguro"
no es un modelo**. La puerta de G3 tiene que comprobarlo con datos vivos.

### `selectionKey`: la pieza que resuelve todo

```
selectionKey = [ marketType, marketItem.values, [period, subPeriod?],
                 tradingType, outcomeType, outcomeValues ]
```

Descifrado contra ocho combinaciones distintas. Y lo decisivo: **es único
dentro de la foto del evento** — 1.321 outcomes de 10 mensajes, cero
colisiones.

**`(event_id, selection_key)` es a la vez la clave natural de la cuota y la
que GR8 manda para liquidar.** Es la razón por la que la liquidación
automática es posible.

### Las tablas

**`gr8_cuota`** — la única caliente. PK `(event_id, selection_key)`, con el
`selectionKey` descompuesto en columnas para filtrar sin parsear. El precio
va **en milésimas, como entero**: los multiplicadores por marca necesitan
tres decimales, y la coma flotante no entra en el punto exacto donde se
paga de más.

**`gr8_evento`** — PK `event_id`. Los nombres de torneo, categoría y deporte
van **denormalizados acá a propósito**: vienen dentro del mensaje de evento,
así la pantalla se arma con un solo SELECT.

**`gr8_marcador`** — PK `event_id`, con los períodos en `jsonb`. **El total
es `period = 1`**, no la suma: verificado en fútbol y hockey, y en tenis de
mesa las sumas no cuadran porque la periodización es distinta por deporte.

**`gr8_resultado`** — misma PK, **y sin clave ajena hacia `gr8_cuota`, a
propósito** (ver abajo).

**`gr8_apuesta_seleccion`** — una fila por selección del boleto, con el
precio tomado y el `selectionKey`. Índice parcial sobre las no liquidadas.

**No se propone tabla de mercados.** El `selectionKey` ya codifica todo lo
que el mercado aportaría, el mercado no tiene un solo campo propio que
sobreviva la poda (`visibility` vacío en 204/204, `parlaySize` en 0 en
204/204, `tradingInfo` duplicado), y una tabla más obliga a un segundo
borrado en cascada por foto — que es donde esto se cae.

### Cómo se aplica una foto

Llega un mensaje con 83 mercados y 441 outcomes para un evento:

1. **Puerta de versión.** Si lo guardado tiene versión mayor o igual, se
   descarta **el mensaje entero**. Nunca se aplica media foto.
2. **Upsert de las 441 filas** en un solo statement, con `IS DISTINCT FROM`:
   sin eso se reescriben 441 filas para cambiar entre 0 y 5 precios.
3. **Borrado por ausencia.** Lo que no vino, se fue.
4. Actualizar el evento con `stage`, `isFrozen` y la versión.

### El borrado por ausencia no es un caso borde: es el caso normal

Medido entre fotos consecutivas del mismo evento:

| evento | versión | outcomes | nuevos | borrados | precios distintos |
|---|---|---|---|---|---|
| 18735348 | 581 → 582 | 31 → 31 | **10** | **10** | **0** |
| 18735348 | 582 → 584 | 31 → 31 | **12** | **12** | 5 |
| 18810784 | 49 → 50 | 26 → 26 | 0 | 0 | 2 |

No son mercados que cierran: **son líneas que caminan.** El hándicap pasa de
−14.5 a −13.5 y, como la línea está **dentro** del `selectionKey`, mover la
línea es borrar una clave y crear otra.

**Entre el 32 y el 39% del conjunto de claves rota en cada mensaje.**

### Y por eso el riesgo no es el tamaño: es la rotación

La tabla de estado es chica: **33 MB con mil eventos vivos**. Pero con esa
rotación son **~12,7 GB/día de escritura sobre esos 33 MB** — unas **385
reescrituras completas por día**.

Eso pasa o no pasa según el autovacuum, no según el disco. Si no sigue el
ritmo, los 33 MB se vuelven 300 de índice hinchado en una tarde y las
lecturas del catálogo se caen con él.

**El `IS DISTINCT FROM` baja la rotación un 63%**: es parte del diseño, no
una optimización.

El dato que lo resume: **un mensaje de 65 KB trae entre 0 y 5 precios
nuevos.** La densidad de información del feed es del orden del **0,005%**.
Todo el diseño es un filtro para no pagar 65 KB de escritura por cinco
números.

### Los resultados no se cruzan con las cuotas vivas

De los 230 `selectionKey` con resultado de un evento, **cero** estaban entre
los 74 vivos de la foto del mismo evento. Los resultados son de períodos ya
cerrados, que el borrado por ausencia ya sacó.

Por eso `gr8_resultado` no puede tener clave ajena a `gr8_cuota`, y por eso
**la liquidación se hace contra la copia que guardó la apuesta**, nunca
contra la línea viva.

### El orden: `sourceDataVersion` solo existe en dos de las nueve colas

| cola | ordena con |
|---|---|
| `markets`, `events` | `sourceDataVersion` del mensaje |
| las otras siete | `dataVersion` |

**No son intercambiables**: en `markets` los dos campos van desfasados por
una cantidad variable. Hay que escribir siete comparadores, no uno.

Y dentro de `markets`, lo que parece versión no lo es:
`markets[].sourceDataVersion` es **idéntico** al del mensaje en 204 de 204;
`markets[].dataVersion` vale **1** en 204 de 204; y `outcomes[].dataVersion`
**se movió en los 26 outcomes cuando solo 2 precios cambiaron**. Un campo
que se mueve sin que el dato se mueva no sirve para decidir si el dato se
movió.

**No usar los timestamps para ordenar**: vienen con valores centinela
(`"0001-01-01"`) y precisión variable. Sirven para medir atraso, no para
ordenar.

### Lo que la pantalla ya sabe dibujar

El front entiende **cuatro mercados**: `h2h`, `totals`, `btts`, `spreads`.
El mapeo a GR8 está escrito, con una advertencia: **no se puede afirmar que
`outcomeType = 0` es el local.** Hay cuatro mercados con solo dos resultados
que son `{1, 3}`, sin el 0. Mapear local y visitante sin el diccionario REST
es exactamente el cruce silencioso que este documento advierte. **Lo cierra
G6, no G4.**

### La causa mecánica de que hoy se liquide por nombre y fecha

`betslips.picks` es **texto con repr de Python**, no JSON, y `event_id`
viene en `None`:

```
[{'home': 'Racing', 'away': 'Sarmiento', 'sel': 'Racing', 'odd': 2.1,
  'event_id': None, 'sport_key': None, 'commence_time': None}]
```

Agregar el `selectionKey` a ese texto sería guardarlo donde no se lo puede
consultar. **Normalizar los picks a filas es prerrequisito de la liquidación
automática, no un paso de G8.**

### Los siete huecos

Ninguno se tapa razonando.

1. **`oddsMultipliers` está vacío en 379 de 379.** Es la regla número uno de
   este documento. Preguntado a GR8 el 2026-10-02: **bloquea G5**, porque
   define si se guarda el precio crudo o el ajustado.
2. **El español casi no está.** Preguntado a GR8 el mismo día.
3. **Nunca vimos un mensaje grande.** Corregido en el PR #207: ahora se
   guarda el mayor de cada ventana y el tope admite 16 MB.
4. **El cruce de la taxonomía no está verificado.** Puerta de G3.
5. **`line-items-dependency-pairs` no engancha con nada** de lo que
   tenemos. Sugiere restricciones de parlay, y `parlaySize` vale 0 en
   204/204: el feed de integración no tiene parlays configuradas. **No
   modelarla todavía es correcto; inventarle una tabla, no.**
6. **Hay mensajes de longitud cero** en `events` y `scores` (2 de 90). No se
   sabe si son heartbeat o borrado. **Hay que contarlos aparte**, no
   tragarlos en un `try/except`: si son borrados y los descartamos, quedan
   eventos fantasma.
7. **Campos documentados que nunca se vieron**: ningún precio bajo 1.01 en
   941, ningún `DeadHeat` en 1.929, ningún `isRemoved` en true. Las pruebas
   de esas reglas se escriben con casos sintéticos, **y hay que anotar en el
   código que el caso nunca se observó**. Un test sintético que pasa no
   demuestra que el feed mande lo que el test supone.

### Etapa 1 — Entender el feed

- [x] **G2b — Capturar mensajes COMPLETOS.** Hecho en dos pasos. El
      primero subió el tope (PR #206) y **no alcanzó**: las diez muestras
      resultaron ser diez mensajes consecutivos del mismo medio segundo, y
      el mayor seguía sin capturarse. El segundo (PR #207) cambió el
      muestreo para quedarse con **el mayor de cada ventana** y subió el
      tope a 16 MB.
      **Lección**: diez muestras no son diez observaciones si salen todas
      del mismo instante.
- [ ] **G3 — Taxonomía**: deportes, categorías y torneos a tablas,
      **quedándose solo con el español**. Son las tres colas chicas y
      quietas (39, 1.301 y 26.913 mensajes en total), así que es el lugar
      barato para equivocarse.
      **Puerta**, corregida con lo medido: que un `tournamentId` tomado
      de un evento vivo **se encuentre en la tabla de torneos** — eso hoy
      no está verificado y si no cruza, toda la taxonomía se cae. Y la
      cobertura de español **medida por campo**, no asumida: el nombre de
      un torneo viene en español 6 de 10 veces, así que una puerta que
      pida "el nombre en español de un torneo conocido" pasa por azar.
- [ ] **G4 — Eventos**, con `competitors[0]` como local.
      **Puerta**: un partido real de la pantalla de GR8 aparece en nuestra
      tabla con los dos equipos en el orden correcto.
- [ ] **G5 — Mercados y cuotas**, con los multiplicadores por marca, las
      reglas de cuota baja, y **borrando lo que desaparece del snapshot**.
      Es la cola de 62 KB y 20/s: acá se prueba si la arquitectura
      aguanta.
      **No empieza sin la respuesta de GR8 sobre `oddsMultipliers`**: ese
      campo define si se guarda el precio crudo o el ajustado, y eso es
      esquema, no cálculo.
      **Puerta**, corregida: "la tabla no crece sin límite" **no alcanza**.
      La tabla es chica; el riesgo medido es la **rotación del 35% de las
      claves por mensaje**. Se mide con `n_dead_tup` y el hinchado del
      índice de la clave primaria, no con el tamaño de la tabla.
- [ ] **G6 — Nombres de mercados** por la API REST de traducciones.

### Etapa 2 — Mostrarlo y jugarlo

- [ ] **G7 — El catálogo** con la misma forma que ya consume la pantalla,
      para no tocar el frontend.
- [ ] **G8 — Apostar guardando el `selectionKey`.** Sin eso no hay
      liquidación posible.
- [ ] **G9 — Validación de cuota contra el snapshot de GR8**, y decidir
      qué hacer cuando el feed está viejo. Hoy falla abierto.

### Etapa 3 — Cobrar y pagar

- [ ] **G10 — Liquidación por `selectionKey`**, con los seis tipos de
      resultado incluidos los reintegros parciales.
      **Puerta**: una apuesta de prueba ganada y una perdida liquidan
      solas, y la plata cuadra al centavo.
- [ ] **G11 — Recuperación tras una caída**: republish de la línea
      activa, la taxonomía o eventos sueltos. Retención 24 horas.
      **Puerta**: se apaga el consumidor diez minutos, se prende, y el
      catálogo vuelve a estar completo sin tocar nada a mano.
- [ ] **G12 — Alarma de feed viejo.** Si el snapshot tiene más de N
      segundos, que se note. Un consumidor detenido no puede verse igual
      que un partido tranquilo.
      **Puerta**: se apaga el consumidor y la alarma salta antes de que
      alguien pueda apostar a una cuota vieja.

### Etapa 4 — A producción

Esta etapa **no empieza hasta que la 3 esté cerrada en staging**, con sus
cuatro puertas verificadas con partidos reales.

- [ ] **G13 — El servicio en producción.** Hoy no existe: el código viaja
      pero nadie lo arranca. Hay que crearlo igual que `quartzplay-gr8`.
      **Antes de cargar las claves**, confirmar si apuntan al mismo
      broker: las de staging van a `iaqp-prod-feed.gr8-mts.com`, vhost
      `integration`, colas con sufijo `-int`. Si producción usa el mismo
      host con las colas **sin** sufijo, los dos mundos conviven en el
      mismo clúster y hay que cuidar no cruzarlos.
- [ ] **G14 — Las IP de salida.** El servicio nuevo tiene las suyas y GR8
      filtra por lista blanca. Pedirlas y mandarlas **antes** de esperar
      que conecte. En staging esto costó un día.
- [ ] **G15 — Encender observando.** Las primeras 24 horas en producción
      el consumidor corre **sin alimentar la pantalla**: solo mide. Si el
      volumen de producción es mayor que el de integración —muy probable,
      porque integración es un entorno de prueba— se ve antes de que
      afecte a un jugador.
      **Puerta**: 24 horas sin que la memoria crezca ni se acumule
      atraso en el broker.
- [ ] **G16 — Encender para el jugador**, primero con un deporte y una
      agencia, no con todo.

## Cómo se controla cada etapa

Cada unidad tiene su puerta escrita arriba. **Ninguna etapa empieza sin
que la anterior tenga todas sus puertas verificadas**, y verificado quiere
decir medido contra staging, no razonado.

Las tres primeras unidades de la Etapa 1 (G2b, G3, G4) tocan colas
chicas y quietas: son el lugar barato para equivocarse. **G5 es la
primera que toca volumen de verdad** y es donde la arquitectura se
aprueba o se rehace.

El riesgo mayor de todo el plan no es técnico: es encender en producción
sin haber visto el pico real. Un sábado a la tarde no se parece a un
martes a la mañana, y el feed tampoco.

## Checks

- Las pruebas del bot en verde en cada unidad.
- El ajuste de cuota probado contra el ejemplo de ellos: 1.48 ×
  0.98580885 tiene que dar 1.45.
- Las tres reglas de cuota baja, cada una con su prueba.
- Un mercado que desaparece del snapshot deja de ofrecerse.
- Una apuesta guardada liquida con el resultado de su `selectionKey`,
  incluidos `Return025` y `Return075`.
- Cortar el consumidor y volver a levantarlo no pierde la línea.

## Delivery

`ask-on-risk`. Las etapas no se mezclan. La 0 sale sola y sirve: una
semana de observación antes de interpretar nada.
