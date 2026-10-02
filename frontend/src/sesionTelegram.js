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
// tiene a quién preguntarle "¿sos vos?" en un GET.
//
// AHORA LA LLAVE ES OBLIGATORIA. Los nueve endpoints la exigen, así que lo
// que antes era "si el canje falla la app anda igual que ayer" pasó a ser "si
// el canje falla el jugador no ve su cuenta". Por eso este módulo dejó de
// tragarse los errores en silencio: distingue el motivo, reintenta el canje
// una vez cuando el servidor contesta 401, y si tampoco así avisa con un
// mensaje que dice qué hacer. Un swallow acá sería el mismo defecto que se
// acaba de sacar del backend, movido al cliente: el servidor contesta un 503
// honesto, la app lo descarta, y el jugador se queda sin token y sin
// explicación.
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
// Sigue sin lanzar nunca —un throw acá tiraría la pantalla— pero ahora dice
// POR QUÉ falló, en `motivo`:
//
//   "sin-firma"  la app se abrió fuera de Telegram, o no hay fetch. No hay
//                nada que reintentar ni nada que avisar: tampoco había cuenta
//                que mostrar.
//   "sin-cuenta" el usuario de Telegram todavía no se registró. El servidor
//                contestó bien; la app muestra su propio registro.
//   "servidor"   el servidor no contestó, o contestó un error. Es el único
//                motivo que amerita reintentar y, si insiste, avisarle.
//
// La distinción es la razón de ser de este cambio. Antes los tres terminaban
// igual porque ninguno tenía consecuencia; ahora "servidor" significa que el
// jugador se queda sin su cuenta, y confundirlo con "sin-cuenta" lo dejaría
// mirando una pantalla vacía sin saber que algo se rompió.
export async function canjearSesionTelegram({ api, initData, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir || !initData) {
    return { ok: false, token: null, registrado: false, motivo: "sin-firma" };
  }

  let respuesta;
  try {
    respuesta = await pedir(`${api}${RUTA_CANJE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ init_data: initData }),
    });
  } catch (e) {
    return { ok: false, token: null, registrado: false, motivo: "servidor" };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    return { ok: false, token: null, registrado: false, motivo: "servidor" };
  }

  const token = typeof cuerpo.token === "string" && cuerpo.token
    ? cuerpo.token : null;
  if (!token) {
    // 200 sin token es la respuesta a un usuario de Telegram sin cuenta. Es
    // la única forma de "falla" que el servidor considera normal.
    return {
      ok: false, token: null, registrado: cuerpo.registrado === true,
      motivo: cuerpo.registrado === true ? "servidor" : "sin-cuenta",
    };
  }
  return {
    ok: true, token, registrado: cuerpo.registrado === true, motivo: null,
  };
}

// ── El contexto, para poder volver a canjear ─────────────────────
//
// El reintento ocurre mucho después del arranque —cuando un pedido vuelve 401,
// con la app abierta— y para entonces nadie tiene a mano el `api` ni el
// `initData`. Se guardan acá en el primer canje. El `initData` no se
// persiste: es el mismo que la app recibió al abrir y muere con ella.
let contexto = null;

export function recordarContextoDeSesion({ api, initData, fetchImpl } = {}) {
  contexto = { api, initData, fetchImpl };
  return contexto;
}

export function olvidarContextoDeSesion() {
  contexto = null;
}

// Canjear y quedarse con la llave: lo que llama la app al arrancar. Un canje
// que no trajo token borra el anterior en vez de dejarlo colgado, porque una
// llave que el servidor ya no reconoce no es mejor que ninguna.
export async function abrirSesionTelegram(opciones) {
  recordarContextoDeSesion(opciones);
  const resultado = await canjearSesionTelegram(opciones);
  recordarToken(resultado.token);
  return resultado;
}

// ── Cuando la sesión no se puede recuperar ───────────────────────
//
// En español rioplatense y con la acción adentro: cerrar y volver a abrir la
// mini-app le da un `initData` nuevo, que es exactamente lo que hace falta.
// Decir "error de sesión" y nada más la deja mirando una pantalla sin saber
// que hay algo que puede hacer.
export const MENSAJE_SESION_CAIDA =
  "No pudimos verificar tu sesión. Cerrá y volvé a abrir la app.";

const oyentes = new Set();

// La app se suscribe una vez y muestra el mensaje donde ya muestra los otros.
// Es un aviso y no un throw porque el pedido que falló puede ser uno de fondo
// —el latido del Súper Bono— y tirar la pantalla por eso sería peor que el
// problema.
export function alPerderLaSesion(fn) {
  oyentes.add(fn);
  return () => oyentes.delete(fn);
}

export function olvidarOyentesDeSesion() {
  oyentes.clear();
}

function avisarSesionCaida(motivo) {
  // Fuera de Telegram, o sin cuenta, no hay sesión que recuperar y el mensaje
  // sería mentira: no se avisa nada, igual que antes de este cambio.
  if (motivo === "sin-firma" || motivo === "sin-cuenta") return false;
  for (const fn of Array.from(oyentes)) {
    try { fn(MENSAJE_SESION_CAIDA); } catch (e) {}
  }
  return true;
}

// ── El reintento ─────────────────────────────────────────────────
//
// Un canje en vuelo por vez. Las pantallas disparan varios pedidos juntos
// —historial y historial-juegos salen en el mismo efecto— y si cada 401 pidiera
// su propio canje, una sesión vencida generaría una ráfaga de canjes y cada
// uno invalidaría el token que acababa de guardar el anterior. Compartir el
// que ya está en vuelo deja a cada pedido con su único reintento y al
// servidor con un solo canje.
let canjeEnVuelo = null;

function canjearUnaVezCompartida() {
  if (!canjeEnVuelo) {
    canjeEnVuelo = abrirSesionTelegram(contexto || {})
      .finally(() => { canjeEnVuelo = null; });
  }
  return canjeEnVuelo;
}

async function pedirConLaLlave(pedir, url, opciones) {
  return pedir(url, {
    ...opciones,
    headers: { ...(opciones.headers || {}), ...cabeceraDeSesion() },
  });
}

/**
 * El fetch de los pedidos que necesitan la sesión.
 *
 * Manda el `Authorization: Bearer` y, si el servidor contesta 401, canjea de
 * nuevo UNA vez y repite el pedido. Ese reintento cubre dos casos reales que
 * sin él dejan al jugador afuera: el token vence a las doce horas y la app
 * puede estar abierta desde antes, y el que cargó el bundle viejo justo antes
 * del despliegue no tiene token hasta que arranque de nuevo.
 *
 * Una sola vez. Si el segundo intento también vuelve 401, el problema no es
 * el token y repetir solo gastaría batería: se avisa y se termina.
 *
 * `avisar: false` para los pedidos de fondo que la persona no pidió —el latido
 * del Súper Bono cada dos minutos—: reintentan igual, pero no ponen un cartel
 * encima de una pantalla donde no estaba mirando nada.
 */
export async function fetchConSesion(url, opciones = {}, { avisar = true } = {}) {
  const pedir = (contexto && contexto.fetchImpl)
    || (typeof fetch === "function" ? fetch : null);
  if (!pedir) throw new Error("No hay fetch disponible");

  // Si el canje del arranque todavía está en vuelo, esperarlo en vez de
  // gastar un 401 seguro y un reintento.
  if (!tokenDeSesion() && canjeEnVuelo) {
    try { await canjeEnVuelo; } catch (e) {}
  }

  let respuesta = await pedirConLaLlave(pedir, url, opciones);
  if (!respuesta || respuesta.status !== 401) return respuesta;

  const recanje = await canjearUnaVezCompartida();
  if (!recanje.ok) {
    if (avisar) avisarSesionCaida(recanje.motivo);
    return respuesta;
  }

  respuesta = await pedirConLaLlave(pedir, url, opciones);
  if (respuesta && respuesta.status === 401 && avisar) {
    // Token nuevo y recién emitido, y el servidor igual no lo reconoce. No hay
    // tercer intento: lo que sea que esté roto no se arregla repitiendo.
    avisarSesionCaida("servidor");
  }
  return respuesta;
}
