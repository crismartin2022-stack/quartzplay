# Dos puertas, cada una la suya

## Objective

Que quien llegue a la raíz desde Chrome entienda dónde está y adónde ir, y
que el sitio del navegador **se vea como la mini-app de Telegram**.

## El problema, contado desde el jugador

Hay dos aplicaciones distintas, ruteadas en `frontend/src/index.js:26-32`:

```
/        → App.jsx   mini-app de Telegram   (6.908 líneas)
/sitio   → Web.jsx   casa de apuestas web   (5.854 líneas)
```

No comparten forma. Casi no comparten nada salvo los tokens de `theme.js`.

**Un jugador que llega por Google a `iaqp.lat` cae en una mini-app de chat
pensada para Telegram, sin botón de crear cuenta.** El registro —todo lo
que se construyó entre el 24 y el 25 de septiembre— vive únicamente en
`Web.jsx`. En la raíz no existe.

Para registrarse tiene que llegar a `/sitio`, que nadie adivina.

Dato que lo respalda: **cero registros por la web en producción** en los
cuatro días que lleva vivo el feature (verificado el 2026-09-29 contra la
base, `origen_registro='web'` da 0).

Y adentro de Telegram la raíz funciona perfecto. El problema no es la
pantalla: es que no dice para quién es.

## Decisión del dueño (2026-09-29)

1. **La raíz, abierta desde un navegador, avisa.** Un mensaje claro de que
   esa vista funciona dentro de Telegram, con enlace al bot.
2. **`Web.jsx` se homologa a `App.jsx`.** La pantalla de Telegram es la
   **referencia de diseño**. Lo nombró por el hero, pero alcanza a toda la
   composición.

Esto cierra la pregunta de producto que quedó abierta el 24/09, cuando se
mapeó la divergencia y no se decidió cuál era la referencia.

## Lo que ya existe y no hay que inventar

- **La detección de Telegram ya está**: `window.Telegram?.WebApp?.initData`
  (`App.jsx:92`, `:478`, `:1928`). Fuera de Telegram viene vacío. Hoy eso
  solo apaga la autenticación (`:1929` pone `autenticado:false`); no hay
  ninguna pantalla que lo explique.
- **El usuario del bot ya está disponible**: `getFrontendConfig()` expone
  `botUsername`, y `Web.jsx:2384` ya arma `https://t.me/${BOT_USERNAME}`.
- **Los tokens ya son compartidos**: los dos archivos importan lo mismo de
  `theme.js`. La divergencia es de composición, no de paleta.

## Scope

**T1 — La puerta de la raíz.** Fuera de Telegram, `App.jsx` muestra una
pantalla que explica dónde está el jugador, con dos salidas: el bot, y
`/sitio` para quien quiera jugar desde el navegador.

Lo segundo no lo pidió el dueño y lo agrego igual: mandar a alguien al bot
sin ofrecerle la puerta que **sí** funciona en su navegador es perder al
jugador que no quiere instalar Telegram. Es un enlace; si no le cierra, se
saca.

**T2 — Homologar `Web.jsx` a `App.jsx`.** Empezando por el hero. El mapeo
detallado llega aparte y define el alcance fino.

**Fuera de alcance**: unificar las dos aplicaciones en una sola. Es lo
correcto a largo plazo y son semanas; esto no lo hace ni lo impide.

## El riesgo de T2, dicho antes de empezar

`App.jsx` es una columna de 520px con burbujas de chat, diseñada para el
alto y angosto de un teléfono dentro de Telegram. **Copiar eso literal a un
monitor de 27 pulgadas sería un error.**

Homologar acá significa que se reconozcan como el mismo producto —tipografía,
jerarquía, tratamiento del hero, superficies, el mismo lenguaje— no que
`/sitio` se convierta en una columna angosta.

Si el mapeo encuentra algo donde parecerse a Telegram empeora el navegador,
se reporta y se decide, no se copia por obediencia.

## Tasks

- [ ] **T1 — La puerta de la raíz.** Detectar ausencia de Telegram, mostrar
      la pantalla con el enlace al bot y el enlace a `/sitio`. Con prueba.
- [ ] **T2 — El hero y la composición de `/sitio`**, según el mapeo.

## Checks

- Las pruebas del frontend en verde y el build sin avisos bajo `CI=true`.
- Con `window.Telegram` ausente, la raíz muestra la puerta; con `initData`
  presente, se comporta exactamente como hoy. Las dos cosas probadas.
- El enlace al bot sale de la configuración, no escrito a mano.

## Delivery

`ask-on-risk`. Dos unidades. T1 sale sola y ya mejora el embudo.
