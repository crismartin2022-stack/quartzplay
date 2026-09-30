# Varios proveedores de casino en IAQP

> **Estado: sin empezar.** Documento de arranque, 2026-09-30.

## Objective

Que IAQP pueda hablarle a **Atomic** y a **Content360** —y a los que
vengan— sin que cada proveedor nuevo sea una reescritura. Y sacar
44neoluck, que es el único que hay hoy.

## Lo que hay hoy, y por qué no alcanza

IAQP tiene lugar para **un solo proveedor**, en variables sueltas
(`casino_api.py:26319`):

```
PROVEEDOR_URL     = https://44neoluck.xyz
PROVEEDOR_CODE / PROVEEDOR_SECRET / PROVEEDOR_MONEDAS
```

De ahí cuelgan **2.140 juegos** en el catálogo de producción, todos con
`integracion = '44neoluck'`.

No es una lista: es un juego de variables en singular. Pisarlas con las de
Atomic no agrega un proveedor, **reemplaza el único que hay** y deja esos
2.140 apuntando a un servidor que no responde.

## El dato que ordena todo

**panel-multiskin guarda sus propios saldos y no le habla a IAQP.**
Verificado: `GameWalletService` escribe en sus tablas y no hay una sola
llamada a `casino_api`.

Son **dos billeteras separadas, para dos poblaciones de jugadores
distintas**. Por eso Atomic aprovisionó proyectos `iaqp` e `iaqp_test`
aparte de los del panel: IAQP va a tener sus credenciales y su propia URL
de callback.

O sea: no se comparte nada en caliente. Lo que se hereda del panel es el
contrato y los tropiezos, no el código, que además es PHP.

## Atomic: lo que ya sabemos

Extraído del código del panel el 2026-09-30, con archivo y línea.

- **No firma.** El `api_key` viaja en el cuerpo JSON con el `partner`
  (`SlotsLauncher.php:49-58`). La defensa real es **lista blanca de IP en
  las dos direcciones**. La columna `api_secret` no se usa.
- Base: `https://api-slots.network/api`, la misma para producción y
  pruebas. Cambian el proyecto y el código de proveedor.
- **Nosotros llamamos**: `playGame.do` (devuelve un `link` para abrir en
  iframe y un `session_id`), `allgamelist` (catálogo), `gameActions.do`
  (giros gratis; `freespins_set` **reemplaza**, no suma).
- **Ellos llaman** a un solo endpoint, con la acción en `method`:
  `session_info`, `bet`, `win`, `round_info`, `game_switch`.
- Idempotencia por `meta.transaction`. Si falta, se rechaza: **no se
  inventa una clave de reemplazo**, porque una clave inventada deja de
  proteger justo cuando hace falta.
- Se manda `player_id` con el id interno, **nunca el username**: el
  username cambia y dejaría rondas huérfanas.

**Las tres lecciones que el equipo del panel ya pagó:**

1. **`round_info` no mueve plata.** Tratarlo como movimiento duplica cada
   apuesta.
2. **No hay rollback.** Una ronda que Atomic cancela no se puede revertir.
   No es que falte implementarlo: no existe en su protocolo.
3. **Los giros gratis se pagan con un `win` sin apuesta.** El GGR queda
   negativo y no es un error de cálculo.

## Content360: lo que ya sabemos

- Firma **HMAC-SHA256** en la cabecera `X-CONTENT-KEY`.
- Cuatro endpoints: `balance` (GET), `debit`, `credit`, `notification`.
- **`notification` no es dinero**: es el catálogo de juegos, un upsert
  por `id`.
- Errores en un campo `code`, **siempre con HTTP 200**: 0 ok, 1 sin saldo,
  2 jugador inexistente, 3 no procesable, 4 firma inválida, 99 interno.
- Menos de **500 ms** de respuesta.
- **Su firma real no coincide con su documentación.** El panel terminó
  probando once canonicalizaciones distintas y todavía no está verificado
  contra tráfico real. Hay que resolverlo con tráfico, no leyendo.

## El dinero, que es donde se pierde plata

Los dos proveedores mandan **decimales en unidades mayores**. Nosotros
guardamos **centavos enteros**.

El panel lo convierte así, y el comentario de su código vale citarlo:

> *"El proveedor manda decimales. Convertimos a centavos con round, nunca
> con cast: `(int)(10.07 * 100)` da 1006 por punto flotante."*

**En Python esto va con `Decimal`, nunca con float.** Y la moneda tiene
que validarse contra la del jugador en cada pedido: devolver pesos que el
proveedor lee como euros multiplica la plata por mil.

## Huecos, nombrados en vez de rellenados

La documentación de Atomic (`atomic.vin/docs`) está detrás de login y no
se pudo leer. Falta confirmar con ellos:

- Los códigos de error exactos. Solo `INSUFFICIENT_FUNDS` está
  documentado; el resto son suposiciones del equipo del panel.
- Si toleran respuestas que no sean HTTP 200.
- Su política de reintentos, y si `meta.transaction` es estable entre
  reintentos.
- Qué hacer con una ronda cancelada, si no hay rollback.

**Nada de esto se adivina.** Un código de error mal supuesto se descubre
cuando un jugador no puede apostar.

## Etapas

Cada una sirve sola.

### Etapa 0 — El registro de proveedores

- [ ] **P1 — Tabla de proveedores y credenciales**, en lugar de las
      variables sueltas. Con su URL, sus credenciales, sus monedas y qué
      adaptador usa. Migración y resolución con caché.
- [ ] **P2 — Lista blanca de IP** para los callbacks entrantes. Es la
      única defensa que tiene Atomic.
- [ ] **P3 — Tabla de idempotencia** compartida, con la clave prefijada
      por proveedor para que dos proveedores no colisionen.

### Etapa 1 — Atomic

- [ ] **A1 — Lanzar juego** (`playGame.do`) y guardar la sesión.
- [ ] **A2 — Sincronizar catálogo** (`allgamelist`).
- [ ] **A3 — Los callbacks**: `session_info`, `bet`, `win`, y
      `round_info` y `game_switch` **sin mover plata**.
- [ ] **A4 — Giros gratis** (`gameActions.do`), recordando que
      `freespins_set` reemplaza.

### Etapa 2 — Content360

- [ ] **C1 — Firma HMAC**, resuelta contra tráfico real y no contra la
      documentación.
- [ ] **C2 — Los cuatro endpoints**, con el sobre `code` y HTTP 200
      siempre.
- [ ] **C3 — El catálogo por `notification`**, como upsert.

Su sportsbook viene **como un juego más**: no necesita camino propio.

### Etapa 3 — La salida de 44neoluck

- [ ] **S1 — Decidir qué pasa con los 2.140 juegos.** Desactivarlos,
      borrarlos, o dejarlos convivir mientras migra el catálogo. Es
      decisión del dueño, no técnica.
- [ ] **S2 — Retirar el código y las variables** una vez que no queden
      jugadores con rondas abiertas.

## Riesgos

**El de las unidades es el más caro y el más silencioso.** Un error de
centavos no rompe nada: paga mal, y se descubre cuando alguien cobra de
más o de menos.

**El segundo es la firma de Content360**, que no coincide con su
documentación. No se resuelve leyendo.

**El tercero es de orden**: si Atomic entra antes del registro de
proveedores, entra pisando a 44neoluck y hay que rehacerlo.

## Checks

- Las pruebas del bot en verde en cada unidad.
- La conversión de montos probada con los casos que rompen el float:
  10.07, 0.01, y montos grandes.
- Un callback repetido con el mismo `transaction` no mueve plata dos
  veces, y devuelve el mismo saldo.
- `round_info` no mueve plata, probado explícitamente.
- Un callback desde una IP fuera de la lista se rechaza.

## Delivery

`ask-on-risk`. Las etapas no se mezclan. La 0 puede salir sola y deja a
44neoluck andando mientras tanto.
