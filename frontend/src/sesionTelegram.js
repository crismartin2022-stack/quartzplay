// ═══════════════════════════════════════════════════════════════
// LA SESIÓN DEL JUGADOR EN LA MINI-APP DE TELEGRAM
//
// El sitio (`Web.jsx`) manda `Authorization: Bearer ${sesion.token}` en cada
// pedido porque entró con usuario y clave. La mini-app no tenía nada de eso:
// se identifica con el `initData` que firma Telegram, y solo en los POST. Por
// eso los pedidos que consultan la cuenta del jugador —historial, chat de
// soporte, autoexclusión— nacieron pasando el `user_id` en la URL, que era el
// único dato que había a mano. Los ids son correlativos: con eso cualquiera
// los recorre y lee la cuenta de otro.
//
// Este módulo cambia esa firma por una sesión de cliente igual a la del
// sitio, así los dos canales se identifican de la misma manera y el servidor
// tiene a quién preguntarle "¿sos vos?" en un GET. Es solo la llave: ningún
// endpoint la exige todavía, y por eso **todos los caminos de error terminan
// en "sin token" y nunca en una pantalla de error**. Si el canje falla, la
// app tiene que andar exactamente como el día anterior.
//
// La forma de usarla es la del sitio a propósito —el mismo encabezado
// `Authorization: Bearer`, armado acá en `cabeceraDeSesion()`— para que no
// haya dos maneras de hacer lo mismo. Lo único que cambia es dónde vive el
// token, y eso tiene su razón abajo.
// ═══════════════════════════════════════════════════════════════

export const RUTA_CANJE = "/api/cliente/sesion/telegram";

// ── Dónde vive el token, y por qué ───────────────────────────────
//
// En memoria del módulo. No en `localStorage` ni en `sessionStorage`, y no es
// un olvido:
//
// 1. El `initData` ya es legible por cualquier script de la página
//    (`window.Telegram.WebApp.initData`), así que tener el token en una
//    variable de este módulo no abre ninguna puerta nueva. Escribirlo en el
//    almacenamiento sí la abre: ahí sobrevive al cierre de la app, lo lee
//    cualquier script que corra después en el mismo origen, y —a diferencia
//    del `initData`— no se puede volver a derivar ni caduca con el arranque.
//    Guardar la llave donde el original también se alcanza no nos deja igual:
//    nos deja peor, porque suma una copia que dura más.
// 2. No hace falta. La mini-app recibe un `initData` nuevo cada vez que
//    abre, así que el canje se repite solo y gratis. El sitio guarda su
//    sesión en `qp_sesion` porque el navegador no tiene otra forma de seguir
//    conectado entre visitas; acá persistirla solo alargaría la ventana en la
//    que la llave sirve, sin dar nada a cambio.
let tokenEnMemoria = null;

export function recordarToken(token) {
  tokenEnMemoria = typeof token === "string" && token ? token : null;
  return tokenEnMemoria;
}

export function tokenDeSesion() {
  return tokenEnMemoria;
}

export function olvidarToken() {
  tokenEnMemoria = null;
}

// El encabezado, o nada. Devolver un objeto vacío cuando no hay token —en vez
// de `Authorization: Bearer null`— es lo que mantiene la promesa de que un
// canje fallido no cambia nada: el pedido sale igual que antes de este cambio.
export function cabeceraDeSesion() {
  return tokenEnMemoria ? { Authorization: `Bearer ${tokenEnMemoria}` } : {};
}

// ── El canje ─────────────────────────────────────────────────────
//
// Devuelve siempre la misma forma y nunca lanza. Cada motivo por el que podría
// fallar —no hay `initData` porque la app se abrió fuera de Telegram, el
// servidor no contesta, la firma venció, el usuario de Telegram todavía no
// tiene cuenta— termina en `token: null`, que es el estado de hoy. Lo que no
// hace es distinguirlos para mostrar algo: la persona no pidió iniciar sesión
// y no tiene nada que resolver.
export async function canjearSesionTelegram({ api, initData, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir || !initData) return { ok: false, token: null, registrado: false };

  let respuesta;
  try {
    respuesta = await pedir(`${api}${RUTA_CANJE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    });
  } catch (e) {
    return { ok: false, token: null, registrado: false };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) return { ok: false, token: null, registrado: false };

  const token = typeof cuerpo.token === "string" && cuerpo.token
    ? cuerpo.token : null;
  return { ok: Boolean(token), token, registrado: cuerpo.registrado === true };
}

// Canjear y quedarse con la llave: lo que llama la app al arrancar. Un canje
// que no trajo token borra el anterior en vez de dejarlo colgado, porque una
// llave que el servidor ya no reconoce no es mejor que ninguna.
export async function abrirSesionTelegram(opciones) {
  const resultado = await canjearSesionTelegram(opciones);
  recordarToken(resultado.token);
  return resultado;
}
