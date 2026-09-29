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

- [x] **T1 — La puerta de la raíz.** Detectar ausencia de Telegram, mostrar
      la pantalla con el enlace al bot y el enlace a `/sitio`. Con prueba.
- [x] **T2 — El hero y la composición de `/sitio`**, según el mapeo.

## Evidencia de T1 (2026-09-29)

Ruta: **directa en línea** — el mapeo ya estaba hecho y no quedaba
investigación ni decisión abierta.

- `frontend/src/puertaTelegram.js` — la lógica pura: detectar Telegram,
  extraer el referido, y armar las dos salidas. 11 pruebas.
- `frontend/src/PantallaTelegram.jsx` — la pantalla, con el mismo lenguaje
  visual que el hero de la mini-app.
- `frontend/src/index.js` — la decisión vive en el router. Adentro de
  `App.jsx` habría obligado a saltear hooks, y el build lo rechaza.

**El código de referido sobrevive la puerta**, y viaja tanto al bot como a
`/sitio`. Si se perdiera ahí, el influencer no cobraría por un jugador que
sí trajo.

**Trampa encontrada**: el componente se llamaba `PuertaTelegram.jsx` y en
macOS eso es el MISMO archivo que `puertaTelegram.js`. El import agarraba
el módulo de lógica. En Linux —donde compila Railway— habría resuelto
distinto y el error aparecía recién en el despliegue.

Pruebas: 1127 en verde, build sin avisos.

## Evidencia de T2 (2026-09-29)

Ruta: **writer delegado**, en serie con el mapeo previo.

- `frontend/src/InicioWeb.jsx` — el hero, las tres tarjetas, el combo del
  día y los partidos en vivo.
- `frontend/src/inicioDelSitio.js` + pruebas — la lógica pura.
- `Web.jsx` — la vista inicial pasa a `"inicio"`, entra en la barra
  lateral, y el logo del encabezado vuelve a la home.

**Bug real encontrado de paso**: `Web.jsx` leía `sports[].events` de
`/api/live/combined`, pero el servidor devuelve `{matches}`
(`casino_api.py:18568`). La pestaña "En vivo" mostraba siempre "No hay
partidos en vivo", incluso con partidos jugándose. La mini-app ya tenía
ese arreglo; el sitio no.

**El hero se adapta en tres anchos**, porque copiar los números de la
mini-app tal cual dejaba un campo violeta vacío en una columna de 1300px.

**Los guardias no cubrían las pantallas nuevas.** `InicioWeb.jsx` y
`PantallaTelegram.jsx` no estaban en las listas de `fontSizeFloor`,
`spacingScale` ni `radiusScale`. Al agregarlas aparecieron tres
violaciones de espaciado, ya corregidas. Una pantalla fuera de esa lista
no la guarda nadie.

Pruebas: 1162 en verde, build sin avisos.

## Checks

- Las pruebas del frontend en verde y el build sin avisos bajo `CI=true`.
- Con `window.Telegram` ausente, la raíz muestra la puerta; con `initData`
  presente, se comporta exactamente como hoy. Las dos cosas probadas.
- El enlace al bot sale de la configuración, no escrito a mano.

## Delivery

`ask-on-risk`. Dos unidades. T1 sale sola y ya mejora el embudo.
