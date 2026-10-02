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

### Las traducciones son mucho menos trabajo del que creíamos

Los nombres de **eventos, torneos, categorías, deportes y competidores
vienen ya traducidos en el feed**, como mapas `{"en": …, "es": …}`.

Solo los **nombres de mercados** necesitan la API REST de traducciones.

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

Cruzado con el ritmo de su consola (markets 20/s, events 12/s, scores
12/s) da del orden de **1,5 MB/s, unos 125 GB por día**. Eso no es un feed
de cuotas: **es el estado completo del mercado, repetido**. Define toda la
arquitectura.

**Y dos hallazgos que achican el problema:**

- **`sourceDataVersion`** viene en cada mensaje. Resuelve solo el problema
  del desorden: sin una versión no se sabe si la cuota que llega es más
  nueva que la guardada.
- **El peso es casi todo traducción.** El nombre de un torneo viene en
  unos 25 idiomas. Usamos uno.

### Etapa 1 — Entender el feed

- [ ] **G2b — Capturar mensajes COMPLETOS.** Las muestras se cortan a 4 KB
      y un mensaje de mercados pesa 62 KB: estamos viendo el 6% de la
      estructura. Subir el tope para unas pocas muestras de `markets`,
      `market-results` y `events`.
      **Puerta para pasar a G3**: diez mensajes enteros de cada una,
      guardados y legibles.
- [ ] **G3 — Taxonomía**: deportes, categorías y torneos a tablas,
      **quedándose solo con el español**. Son las tres colas chicas y
      quietas (39, 1.301 y 26.913 mensajes en total), así que es el lugar
      barato para equivocarse.
      **Puerta**: el conteo de filas coincide con el de mensajes
      distintos, y una consulta devuelve el nombre en español de un
      torneo conocido.
- [ ] **G4 — Eventos**, con `competitors[0]` como local.
      **Puerta**: un partido real de la pantalla de GR8 aparece en nuestra
      tabla con los dos equipos en el orden correcto.
- [ ] **G5 — Mercados y cuotas**, con los multiplicadores por marca, las
      reglas de cuota baja, y **borrando lo que desaparece del snapshot**.
      Es la cola de 62 KB y 20/s: acá se prueba si la arquitectura
      aguanta.
      **Puerta**: el proceso corre una hora sin que la memoria crezca, y
      la tabla de estado no crece sin límite.
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
