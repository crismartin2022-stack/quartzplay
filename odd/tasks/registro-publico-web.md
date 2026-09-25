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
- **El teléfono se pide en el registro, pero no se verifica ahí.** Se
  elige el indicativo de país de una lista de Latam y se guarda el número
  tal como lo declaró. La verificación sigue siendo la que abre los
  retiros, no la que abre la cuenta.
- **El correo sí se verifica antes de crear la cuenta.** El jugador
  completa el formulario, toca *Crear cuenta*, recibe un código en su
  correo y lo escribe en un modal. Recién ahí existe la cuenta. Quien
  entra con Google se saltea este paso: Google ya probó el correo.
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

- [x] **T1 — Los cimientos.** Migración: `google_sub` (único), unicidad
      real de teléfono y email, `telefono_verificado_at`, `edad_declarada_at`
      y el origen del registro. Sin esto, todo lo demás es arena.
- [x] **T2 — El freno.** Límite de peticiones por IP y por teléfono en los
      endpoints de registro y de envío de código, con respuesta clara al
      usuario. Se prueba con una ráfaga.
- [ ] **T3 — Entrar con Google.** Verificación del token de Google contra
      su clave pública, en nuestra propia API. Sin Supabase Auth: la
      plataforma se muda a AWS y esto tiene que viajar con nosotros.
- [x] **T4 — El código, por WhatsApp o SMS.** Envío y validación, con el
      proveedor y el canal detrás de una interfaz: hoy Dexatel, mañana lo
      que haga falta. Falla cerrado si no hay credenciales, como ya hace el
      PSP. Si un canal falla, se ofrece el otro.
- [x] **T4b — El candado del retiro.** Sin teléfono verificado no se
      retira, y el servidor lo impide (no alcanza con esconder el botón).
      Además, hoy el retiro digital solo acepta identidad de Telegram
      (`casino_api.py:21821`): un jugador del navegador no puede retirar
      aunque verifique. Hay que aceptar también la sesión web.
- [x] **T5 — La pantalla.** El registro en el sitio, con el referido
      opcional y la casilla de mayoría de edad. La marca de "teléfono sin
      verificar" en el perfil y el recordatorio al iniciar sesión, que
      explique qué puede y qué no. Y cambiar el mensaje que hoy dice que la
      clave la da la agencia.
- [x] **T7 — El teléfono en el formulario.** Campo de teléfono con
      selector de indicativo, solo países de Latam. Se guarda sin
      verificar: **no** se escribe `telefono_e164` hasta que el código
      llegue, porque esa columna es única y un número ajeno escrito a mano
      dejaría afuera a su dueño real.
- [x] **T8 — El correo, verificado antes de crear la cuenta.** El registro
      pasa a dos pasos: se guarda el intento, se manda el código, y la
      fila en `users` nace recién cuando el código coincide. El proveedor
      de correo queda detrás de la misma puerta que el de SMS.
- [x] **T9 — Cómo verifico mi teléfono.** En el perfil y en el aviso, el
      camino completo con sus acciones: elegir canal, pedir el código,
      escribirlo, y qué se destraba al lograrlo. Queda armado aunque
      el proveedor de SMS todavía no mande nada.
- [ ] **T6 — Asignar a una agencia.** Desde admin, mover un jugador de la
      casa a una agencia, con registro de quién lo hizo y cuándo.

## Riesgo conocido: el proveedor, antes que el país

**2026-09-25 — Twilio cerró la cuenta** apenas se pagó el primer plan. No fue
un error del alta: prohíben el tráfico de apuestas en sus rutas de Estados
Unidos y Canadá, y la revisión se aplica a nivel de cuenta aunque el tráfico
vaya a Ecuador, Argentina y Venezuela. Vonage, Bird y Plivo tienen políticas
equivalentes; no sirve mudarse a otro grande de allá.

Se pasa a **Dexatel**, que declara iGaming entre los verticales que atiende.
Costó reescribir `bot/mensajeria.py` y sus pruebas, nada más: es exactamente
lo que la puerta chica de T4 estaba pagando por adelantado.

Al postular, lo nuestro es **OTP transaccional**, no publicidad de apuestas.
El texto no lleva enlaces, ni marca, ni la palabra apuestas, y hay una prueba
que lo sostiene (`test_el_mensaje_no_menciona_el_vertical`).

Sigue en pie el riesgo de entrega hacia Venezuela: si el código no llega, se
pierde al jugador en la puerta. Por eso el canal queda desacoplado —el cuerpo
del pedido lleva `channel`, y WhatsApp es cambiar un parámetro.

## Evidencia (2026-09-24)

Rama `feat/registro-correo-telefono`, siete unidades de trabajo:

- `0872df4` el tope por IP pasa a 20/día + 3 en 10 minutos (CGNAT).
- `e093e3b` tabla `registro_pendiente`, migración
  `20260925090000_registro_pendiente_correo.sql`.
- `19e4ae6` 19 países de Latam y `bot/correo.py` (Resend por HTTP, sin
  dependencia nueva; falla cerrado; `CORREO_MODO=consola` solo staging).
- `4a59b0e` el registro en dos pasos; se **borra** el endpoint viejo de un
  paso, porque dejarlo abierto salteaba la verificación entera.
- `97c9174` el teléfono verificado pisa al declarado.
- `01013d6` selector de país y el modal del código en el sitio.
- `6d4c3d5` panel para verificar el teléfono, con el aviso honesto de que
  todavía no hay canal disponible.

Pruebas: bot 332 en verde; frontend 1044 en 57 suites, `registroCliente`
97; `react-scripts build` compila sin avisos. Verificado por el orquestador,
no solo reportado.

Pendiente del dueño: cuenta de Resend con `mail.iaqp.lat` en región
São Paulo, y las variables `RESEND_API_KEY` y `CORREO_DESDE`.

## Checks

- `cd bot && python -m pytest tests -q` en verde.
- Una ráfaga contra el endpoint de código tiene que ser rechazada.
- Dos registros con el mismo teléfono: el segundo falla.
- Sin credenciales del proveedor, el registro no queda a medias: falla cerrado.

## Delivery

Seis unidades, una rama y un PR por unidad. El dueño aplica las
migraciones y mergea.
