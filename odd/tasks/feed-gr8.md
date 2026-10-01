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

### Una sola instancia: por qué no choca con AWS

Ellos confirmaron que varias instancias **se reparten** los mensajes, y
cada una vería media línea. Eso suena a conflicto con el plan de AWS
—rendimiento, autoescalado y failover— y no lo es, porque son ejes
distintos.

**La carga del consumidor no depende de cuántos jugadores haya**, sino de
cuántos mensajes manda GR8. Con 10 jugadores o con 10.000 llegan las
mismas actualizaciones de cuotas. Lo que escala con el tráfico es la API
y la base; el consumidor es solitario por naturaleza y no es un cuello de
botella.

**El failover tampoco pide un par activo-pasivo.** GR8 ya lo resolvió:
los mensajes quedan 24 horas y el republish reemite la línea activa. Si
el proceso se cae y vuelve en treinta segundos, se pone al día solo. El
failover acá es **reiniciar rápido**, que lo hace cualquier orquestador.

**El sharding solo haría falta si uno no da abasto, y nadie midió eso.**
Para eso está la etapa 0: conectarse, observar una semana, y decidir con
datos. Arrancamos con uno.

### Lo que sí hay que pedirle al consumidor pensando en AWS

El consumidor va a estar **escribiendo en la base todo el tiempo**.
Cuando la base haga failover —que es justamente uno de los objetivos de
la migración— ese proceso tiene que reconectar solo y no perder los
mensajes que tenía en vuelo.

Con ack manual eso sale gratis: un mensaje sin confirmar vuelve a la
cola. Pero hay que confirmar **después** de escribir, nunca antes.

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

### Etapa 0 — Conectarse y mirar

- [ ] **G1 — El consumidor.** Proceso aparte, AMQPS al 5671, **ack manual
      con prefetch acotado** —su documentación advierte que con auto-ack
      cargan todo en la RAM del broker y se arriesgan a un OOM—,
      reconexión con espera creciente, y **una sola réplica**.
- [ ] **G2 — Registrar lo que llega**, sin interpretarlo todavía: qué
      colas hablan, cada cuánto, qué tamaño tienen los mensajes. Una
      semana de eso vale más que cualquier estimación.

### Etapa 1 — Entender el feed

- [ ] **G3 — Taxonomía**: deportes, categorías y torneos a tablas.
- [ ] **G4 — Eventos**, con `competitors[0]` como local y los nombres ya
      traducidos del feed.
- [ ] **G5 — Mercados y cuotas**, aplicando los multiplicadores por marca
      y las reglas de cuota baja, y **borrando lo que desaparece del
      snapshot**.
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
- [ ] **G11 — Recuperación tras una caída**: republish de la línea
      activa, la taxonomía o eventos sueltos. Retención 24 horas.
- [ ] **G12 — Alarma de feed viejo.** Si el snapshot tiene más de N
      segundos, que se note. Un consumidor detenido no puede verse igual
      que un partido tranquilo.

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
