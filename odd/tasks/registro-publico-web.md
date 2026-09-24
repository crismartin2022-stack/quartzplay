# El jugador se registra solo, desde el navegador

## Objective

Que una persona pueda crear su cuenta desde Chrome, sin pasar por Telegram
ni por una agencia: entra con su cuenta de Google, verifica su teléfono con
un código por SMS, y queda jugando.

Hoy la única puerta de entrada es una agencia que crea el usuario a mano, o
el bot de Telegram. Eso limita el crecimiento a la red de agencias.

## Who this is for

El **jugador nuevo** que llega por una campaña, un enlace o una búsqueda, y
hoy se topa con una pantalla que le dice *"el usuario y la clave te los da
tu agencia"*. Esa frase, literal, está hoy en el sitio.

Y el **negocio**, que pasa a poder captar jugadores directamente.

## Decisiones de negocio ya tomadas

- **El jugador que se registra solo es de la casa**: sin agencia. Después se
  lo asigna a una agencia a mano, y eso también hay que construirlo.
- **El código de referido es opcional**: si lo pone, queda asociado a esa
  agencia desde el primer momento, y esa agencia cobra como con cualquier
  jugador suyo.
- **La verificación del teléfono no frena el registro: frena los retiros.**
  El jugador entra con Google, deposita y juega desde el primer minuto.
  Para **retirar** tiene que haber verificado su teléfono. Así no hay
  cuentas fantasma cobrando, la fricción está donde hay riesgo, y solo se
  paga el mensaje de quien de verdad va a mover plata.
  El estado tiene que estar a la vista: una marca en el perfil y un
  recordatorio cada vez que inicia sesión, diciendo con todas las letras
  que puede depositar y jugar, pero no retirar, hasta verificar.
- **El código llega por WhatsApp o por SMS**, a elección. WhatsApp entrega
  mejor en la región, sobre todo en Venezuela; el SMS funciona desde el
  primer día, mientras WhatsApp espera la aprobación de su remitente.
- **La edad se declara, no se verifica.** Por ahora una casilla de mayoría
  de edad, registrada con fecha. No es una operación regulada, pero queda
  preparado para endurecerlo cuando el negocio lo defina.
- **Mercados iniciales: Ecuador, Argentina y Venezuela.**

## Lo que ya existe y no hay que inventar

Verificado contra el código el 2026-09-24:

- **La marca de "sin agencia" ya existe**: `creado_por = 'admin'` se usa en
  el alta por Telegram (`casino_api.py:14990`), en el alta por admin
  (`:13609`) y en los movimientos de caja (`:4047`). Los reportes de admin
  ya etiquetan ese caso como *"Registro por app"* (`:13576`).
- **Nada se rompe sin agencia**: los límites de apuesta (`:1991`) y el
  catálogo de productos (`:9483`) ya toleran que no haya una.
- **Las columnas `email` y `telefono` ya están** en `users`.
- **Las sesiones de navegador ya funcionan**: `/api/cliente/login` emite un
  token que vive en memoria y en `agencia_sesiones` (`:16285`).

## Los tres agujeros que hay que tapar antes de abrir la puerta

**1. No hay ningún límite de peticiones en toda la API.** Con SMS de por
medio eso es plata: cualquiera llama al endpoint de verificación en bucle y
quema el crédito. Es el ataque más común contra un registro público.

**2. El teléfono y el email no tienen índice único.** Sin eso, el mismo
número abre diez cuentas y la verificación no significa nada.

**3. El jugador de la casa no tiene quién le resetee la clave.** Las
agencias resetean a los suyos; a los de la casa, solo admin
(`casino_api.py:453`). Con registro público eso se vuelve soporte manual.

## Dos cosas que el negocio todavía debe decidir

- **Los bonos.** Un jugador sin agencia no recibe ningún bono automático,
  porque los bonos cuelgan de la agencia (`casino_api.py:2401`). El que se
  registra solo es justo el que más necesita un incentivo de bienvenida.
- **Cómo carga saldo.** Hoy solo una agencia carga saldo. Un jugador de la
  casa se registra, entra… y no tiene con qué jugar hasta que el PSP esté
  activo (#35) o alguien le cargue a mano.

## Scope

Registro con Google, verificación de teléfono, referido opcional,
declaración de edad, y la reasignación a una agencia desde admin.

Fuera de alcance: verificación real de identidad o edad, carga de saldo
propia, y los bonos de casa.

## Tasks

- [ ] **T1 — Los cimientos.** Migración: `google_sub` (único), unicidad
      real de teléfono y email, `telefono_verificado_at`, `edad_declarada_at`
      y el origen del registro. Sin esto, todo lo demás es arena.
- [ ] **T2 — El freno.** Límite de peticiones por IP y por teléfono en los
      endpoints de registro y de envío de código, con respuesta clara al
      usuario. Se prueba con una ráfaga.
- [ ] **T3 — Entrar con Google.** Verificación del token de Google contra
      su clave pública, en nuestra propia API. Sin Supabase Auth: la
      plataforma se muda a AWS y esto tiene que viajar con nosotros.
- [ ] **T4 — El código, por WhatsApp o SMS.** Envío y validación, con el
      proveedor y el canal detrás de una interfaz: hoy Twilio, mañana lo
      que haga falta. Falla cerrado si no hay credenciales, como ya hace el
      PSP. Si un canal falla, se ofrece el otro.
- [ ] **T4b — El candado del retiro.** Sin teléfono verificado no se
      retira, y el servidor lo impide (no alcanza con esconder el botón).
      Además, hoy el retiro digital solo acepta identidad de Telegram
      (`casino_api.py:21821`): un jugador del navegador no puede retirar
      aunque verifique. Hay que aceptar también la sesión web.
- [ ] **T5 — La pantalla.** El registro en el sitio, con el referido
      opcional y la casilla de mayoría de edad. La marca de "teléfono sin
      verificar" en el perfil y el recordatorio al iniciar sesión, que
      explique qué puede y qué no. Y cambiar el mensaje que hoy dice que la
      clave la da la agencia.
- [ ] **T6 — Asignar a una agencia.** Desde admin, mover un jugador de la
      casa a una agencia, con registro de quién lo hizo y cuándo.

## Riesgo conocido: Venezuela

Twilio entrega mal hacia Venezuela: bloqueos de operadoras y mensajes que
no llegan. Si el registro depende de un SMS que nunca llega, se pierde al
jugador en la puerta. Por eso T4 deja el canal desacoplado: cambiar a
WhatsApp o a correo no debe obligar a rehacer el flujo.

## Checks

- `cd bot && python -m pytest tests -q` en verde.
- Una ráfaga contra el endpoint de código tiene que ser rechazada.
- Dos registros con el mismo teléfono: el segundo falla.
- Sin credenciales de Twilio, el registro no queda a medias: falla cerrado.

## Delivery

Seis unidades, una rama y un PR por unidad. El dueño aplica las
migraciones y mergea.
