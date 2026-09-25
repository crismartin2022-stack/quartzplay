# Vender el sportsbook como API

> **Estado: sin empezar.** Documento de arranque, escrito el 2026-09-25 a
> pedido del dueño, para iniciar cuando cierren las etapas en curso
> (registro público, mensajería, migración de infraestructura).

## Objective

Que un operador que no somos nosotros pueda vender apuestas deportivas
usando nuestro motor, contra su propia base de jugadores y su propia
billetera, pagándonos por hacerlo. Lo que hace Digitain con su sportsbook.

## Who this is for

El **negocio**: hoy el motor solo genera ingresos por los jugadores que
entran por nuestra puerta. Como producto API, cada operador integrado es
un canal nuevo sin costo de adquisición de jugadores.

El **operador cliente**, que quiere apuestas deportivas en su producto y
no quiere construir un motor.

## La distinción que hay que tener clara

Hoy tenemos **un sportsbook para un solo operador: nosotros**. Lo que se
quiere vender es un **producto multi-operador**. No es configuración: es
una capa que no existe.

Conviene decirlo así hacia afuera, porque "ya funciona en Multiskin" no
significa que esté listo para un tercero. Significa que el panel sabe
hablarle, no que el motor sepa atender a varios dueños.

## Lo que ya existe y no hay que inventar

Verificado contra el código el 2026-09-25. El motor **no** es una cáscara
sobre un feed; hay lógica propia con valor comercial:

- **Colocación con revalidación**: las cuotas se vuelven a validar contra
  el feed al momento de apostar (`validar_cuotas`, `casino_api.py:18368`).
  Sin eso, un cliente con la pantalla vieja apuesta a una cuota que ya no
  existe.
- **Riesgo**: topes de monto y cuota (`MAX_PICKS`, `MAX_ODD_PICK`,
  `MAX_ODD_TOTAL`, `:15767`), bloqueos por selección (`_picks_bloqueados`,
  `:5867`) y niveles de riesgo (`:16143`).
- **Bet builder** con margen de correlación para partidos repetidos.
- **Cashout propio** (`_calcular_cashout`, `:18843`), habilitado por
  operador.
- **Ajuste de cuotas** por evento, mercado o selección (`_aplicar_ajuste`).
- **Liquidación** contra Sportradar (`:21122`), con coincidencia por
  nombre y fecha cuando los identificadores no cruzan.
- **Una billetera sin costuras ya escrita**, aunque en la dirección
  contraria: `/api/wallet/getBalance` y `setBalance` (`:27241`), firmadas
  con HMAC en cabeceras `X-Code` / `X-Time` / `X-Sign` (`auth.py`). Sirve
  de molde: sabemos cómo se ve el contrato, hay que escribir el lado
  cliente.

## Los cinco agujeros

Ordenados por tamaño. Ninguno existe hoy, ni parcialmente.

### 1. La billetera va al revés

Hoy **recibimos** llamadas de billetera: el agregador de slots mueve plata
en nuestra tabla `users`. En un producto API es al revés: **el operador es
dueño del dinero** y nosotros llamamos a su billetera en cada apuesta,
cada resolución y cada cashout.

Ese cliente saliente no existe en ninguna parte del código.

Y trae todo lo que trae hablar con un sistema ajeno por dinero: reintentos,
idempotencia, conciliación de lo que quedó a medias. Ya lo aprendimos con
el PSP: la bitácora durable y el reintento no eran adorno.

### 2. No hay aislamiento por operador

Hay **una sola** clave global de admin. `agencias` es nuestro árbol de
comisiones, no un modelo de inquilinos. Verificado: cero resultados de
`tenant`, `operator_id`, `skin_id` o `brand_id` en todo el backend y el
esquema.

Sin esto, dos clientes ven y tocan lo mismo. No es un detalle de seguridad:
es la razón por la que no se puede vender.

### 3. Los datos están pegados al código

Hay dos proveedores —The Odds API y Sportradar— llamados en línea, con
lógica duplicada y sin interfaz común. El único módulo con abstracción,
`odds_api.py`, la API principal ni lo usa.

**Y acá está lo que más urge**: GR8 entra ahora. Si lo pegamos como están
pegados los otros dos, vamos a tener tres bloques duplicados y lo vamos a
rehacer igual. GR8 es la oportunidad de construir la abstracción, no de
agregar un tercer parche.

### 4. El identificador de evento no es nuestro

Hoy cada proveedor trae su propio id, y por eso la liquidación tiene que
adivinar por nombre y fecha cuando no cruzan. Eso ya es frágil para
nosotros; para un cliente es inaceptable, porque una liquidación mal
resuelta es plata mal pagada y la culpa es nuestra.

Un producto necesita **un id de evento propio y estable**, con una tabla
que lo mapee al id de cada proveedor.

### 5. Falta la carrocería del producto

- **Idempotencia al apostar**: la billetera de casino tiene una referencia
  idempotente; `/api/apuesta` no tiene ninguna.
- **Avisos de resolución hacia afuera**: la liquidación solo escribe en
  nuestra tabla. Nada empuja el resultado al operador.
- **Límite de tasa por operador**: no hay ninguno, en toda la API.
- **Documentación versionada y ambiente de pruebas**: no existen.
- **Sesiones de agencia en memoria** (`auth.py:76`), con un comentario
  propio que dice que no aguanta más de una réplica. Un producto vendido
  implica varias.

## La decisión de negocio que hay que tomar primero

**¿Quién tiene el dinero del jugador?**

- **Billetera transferida**: el jugador del operador tiene una cuenta
  espejo en nuestra base y se transfiere saldo. Más simple de construir,
  pero **quedamos guardando plata de terceros**, con el peso regulatorio y
  de conciliación que eso trae.
- **Billetera sin costuras**: no guardamos saldo de nadie; cada apuesta
  llama a la billetera del operador. Es lo que hace la industria, y evita
  que tengamos dinero ajeno en nuestro balance.

**Recomendación: sin costuras.** Es más trabajo y es el camino correcto.
Guardar plata de otro operador cambia qué clase de empresa somos.

Esta decisión define casi todo lo demás, así que va antes de escribir
código.

## Scope

Un operador externo, con sus credenciales, consulta catálogo, coloca
apuestas contra su propia billetera, recibe resoluciones, y ve su propia
información y nada más.

**Fuera de alcance**: panel de marca blanca para el operador, casino y
slots por la misma API, y cualquier cosa de licencias o cumplimiento, que
no es una decisión técnica.

## Etapas

Pensadas para que **cada una sirva sola**, aunque la siguiente no llegue.

### Etapa 0 — Cimientos que ya nos sirven hoy

No son para el producto: arreglan cosas que hoy nos duelen a nosotros.

- [ ] **A1 — Abstracción de proveedor de datos.** Una interfaz con
      eventos, mercados y resultados. Se construye **con GR8**, y de paso
      entran ahí The Odds API y Sportradar.
- [ ] **A2 — Identificador de evento propio**, con su tabla de mapeo a
      cada proveedor. Mata la coincidencia por nombre en la liquidación.
- [ ] **A3 — Idempotencia al apostar.** Una referencia del cliente, como
      ya hace la billetera de casino.
- [ ] **A4 — Sesiones fuera de la memoria del proceso.**

### Etapa 1 — Lo mínimo vendible

- [ ] **B1 — Modelo de operador**: tabla propia, credenciales por
      operador, y el operador presente en cada apuesta y cada consulta.
- [ ] **B2 — Aislamiento**: ningún endpoint devuelve datos de un operador
      a otro. Se prueba explícitamente, no se asume.
- [ ] **B3 — Cliente de billetera saliente**, con reintento y bitácora
      durable, copiando lo aprendido en el PSP.
- [ ] **B4 — Avisos de resolución** hacia el operador, con reintento.
- [ ] **B5 — Configuración por operador**: margen, topes, qué deportes,
      si tiene cashout.

### Etapa 2 — Producto

- [ ] **C1 — Límite de tasa por operador.**
- [ ] **C2 — Documentación versionada** y ambiente de pruebas.
- [ ] **C3 — Reportes por operador** y la liquidación comercial con él.

## Riesgos

**El más caro es el de la etapa 0 y es de tiempo, no de código**: si GR8
entra antes de que exista la abstracción, se paga dos veces. Esa ventana
se está cerrando ahora.

**El segundo es de gente.** El plan de infraestructura del 23/09 compromete
dos personas a mover todo a AWS en cuatro semanas. Esto no entra en
paralelo con eso; hay que decidir cuál va primero.

**El tercero es de expectativa.** Esto no es un sprint. La etapa 0 sola
toca el corazón del motor de apuestas, que es el código que mueve dinero.

## Checks

- Las pruebas del bot en verde en cada unidad.
- El aislamiento entre operadores se prueba con dos operadores de prueba.
- La billetera saliente se prueba con el operador caído: la apuesta no
  puede quedar a medias, ni cobrada sin registrar ni registrada sin cobrar.
- La liquidación por identificador propio se prueba contra eventos donde
  hoy la coincidencia por nombre falla.

## Delivery

`ask-on-risk`. Las etapas no se mezclan: la 0 puede salir a producción
sola y mejora lo que ya tenemos.
