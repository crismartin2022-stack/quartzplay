// ═══════════════════════════════════════════════════════════════
// LA CREDENCIAL DE LA TERMINAL — el Box deja de ser nadie
//
// El Box es la pantalla de autoconsulta del mostrador. No pide iniciar sesión
// a propósito: es para el que llega con el ticket impreso y no tiene cuenta.
//
// Lo único que sabía de sí misma era el código de agencia de su dirección
// (`/box/AGE002`), y una dirección no es una credencial: la escribe cualquiera.
// Por eso el cash out del Box necesitaba un endpoint abierto, y por eso ese
// endpoint era un agujero. Ahora la agencia emite un código de un solo uso
// desde su panel, la pantalla lo canjea UNA vez, y desde ahí manda
// `Authorization: Bearer` como todos los demás.
// ═══════════════════════════════════════════════════════════════

export const RUTA_CANJE = "/api/terminal/credencial";
export const RUTA_ME = "/api/terminal/me";

// ── Dónde vive el token, y por qué ───────────────────────────────
//
// En `localStorage`. Y sí, es lo CONTRARIO de lo que decidió la mini-app de
// Telegram, que lo guarda en memoria del módulo (ver `sesionTelegram.js`). No
// es una inconsistencia: es que el caso es el inverso, y conviene decir en qué.
//
// La mini-app puede no persistir nada porque recibe identidad NUEVA en cada
// apertura: `window.Telegram.WebApp.initData` llega firmado otra vez, así que
// el canje se repite solo y gratis, y persistir el token solo alargaría la
// ventana en la que la llave sirve sin dar nada a cambio.
//
// UNA TERMINAL DE MOSTRADOR NO RECIBE NADA AL ARRANCAR. Lo único que tiene es
// la dirección, que no prueba quién es. Y arranca seguido: se corta la luz, el
// kiosco se reinicia a la noche, alguien cierra la pestaña, el navegador se
// actualiza. Si el token viviera en memoria, cada uno de esos reinicios dejaría
// la pantalla sin credencial hasta que un humano fuera hasta el mostrador con
// un código nuevo.
//
// Y eso no termina en "la agencia lo vuelve a cargar": termina en el código de
// alta anotado en un papel pegado al costado de la pantalla, para que el
// empleado del turno de la mañana pueda reponerlo solo. O sea que la alternativa
// "más segura" produce, en el mostrador, un secreto permanente a la vista de
// cualquiera que pase. Peor que lo que evita.
//
// QUÉ RIESGO SE ACEPTA, dicho de frente: lo que está en `localStorage` lo lee
// cualquier script del mismo origen, y cualquiera que tenga el navegador del
// kiosco en la mano. Lo que lo hace tolerable no es el almacenamiento, son los
// límites del token:
//
//   · es de UNA terminal, no de la agencia: no carga saldo, no ve cuentas, no
//     liquida, no paga en caja, no emite otras credenciales. Cashea en la
//     ventanilla de su propia rama y nada más.
//   · la agencia lo desaloja en el acto con el botón de apagar que ya existía
//     —el servidor mira `activa` en el mismo UPDATE con el que autoriza—, sin
//     esperar a que el token venza.
//   · cada operación le mueve el `ultimo_uso`, así que una robada o una que
//     dejó de usarse se ve en el panel.
//
// Una llave que solo abre una puerta, que se revoca en un clic y que deja
// rastro es lo que hace que guardarla en el mostrador sea razonable. Si algún
// día el token de terminal sirviera para más, esta decisión hay que revisarla.

// La clave lleva el código de agencia: un mismo navegador puede abrir el Box de
// dos agencias distintas —un soporte técnico probando, un local que cambió de
// code— y la credencial de una no puede contestar por la otra.
export function claveDe(agenciaCode) {
  return `qp_terminal_${String(agenciaCode || "").toUpperCase()}`;
}

// Todo acceso al almacenamiento va envuelto: en modo incógnito, con las cookies
// bloqueadas o con el disco lleno, `localStorage` LANZA en vez de devolver
// null. Una terminal que explota al arrancar es peor que una sin credencial,
// que al menos sabe pedir el código.
export function leerToken(agenciaCode) {
  try {
    return localStorage.getItem(claveDe(agenciaCode)) || null;
  } catch (e) {
    return null;
  }
}

export function guardarToken(agenciaCode, token) {
  if (!token) return null;
  try {
    localStorage.setItem(claveDe(agenciaCode), token);
  } catch (e) {
    // No se pudo persistir. El token igual se devuelve y la pantalla trabaja
    // con él hasta el próximo reinicio: media credencial es mejor que ninguna,
    // y el único costo es tener que volver a darla de alta.
  }
  return token;
}

export function olvidarToken(agenciaCode) {
  try {
    localStorage.removeItem(claveDe(agenciaCode));
  } catch (e) {}
}

// El encabezado, o nada. Devolver un objeto vacío cuando no hay token —en vez
// de `Authorization: Bearer null`— es lo que mantiene que un pedido sin
// credencial salga igual que antes de este cambio, y que el 401 que vuelva sea
// el de "no tengo credencial" y no el de "mandé basura".
export function cabeceraDeTerminal(agenciaCode) {
  const token = leerToken(agenciaCode);
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// ── El canje ─────────────────────────────────────────────────────
//
// No lanza nunca: un throw acá tiraría la pantalla del local. Devuelve
// `{ok, motivo, mensaje, terminal}` y la pantalla decide qué mostrar.
//
//   "sin-codigo"  no se tipeó nada. No se llama al servidor.
//   "rechazado"   el servidor dijo no, y `mensaje` trae su texto: ya se usó,
//                 venció, no existe, la terminal está apagada. Son todos
//                 "pedile otro código a la agencia" y el servidor ya los
//                 explica en castellano, así que se muestran tal cual.
//   "sin-red"     no se pudo preguntar. Es el único que vale reintentar solo.
//   "sin-token"   contestó 200 y sin token. No debería pasar; si pasa, no se
//                 guarda nada y se dice que se reintente, porque guardar un
//                 `undefined` dejaría la pantalla creyendo que tiene llave.
export async function canjearCodigo(apiUrl, agenciaCode, codigo) {
  const limpio = String(codigo || "").trim();
  if (!limpio) {
    return { ok: false, motivo: "sin-codigo",
             mensaje: "Escribí el código de alta" };
  }

  let r;
  let d = null;
  try {
    r = await fetch(`${apiUrl}${RUTA_CANJE}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ codigo: limpio }),
    });
    try { d = await r.json(); } catch (e) { d = null; }
  } catch (e) {
    return { ok: false, motivo: "sin-red",
             mensaje: "No pudimos conectar. Probá de nuevo." };
  }

  if (!r.ok) {
    return { ok: false, motivo: "rechazado",
             mensaje: (d && d.detail) || "Ese código no sirve. "
                                         + "Pedile uno nuevo a la agencia." };
  }
  if (!d || !d.token) {
    return { ok: false, motivo: "sin-token",
             mensaje: "No pudimos dar de alta la terminal. Probá de nuevo." };
  }

  guardarToken(agenciaCode, d.token);
  return { ok: true, motivo: null, mensaje: null,
           terminal: d.terminal || null };
}

// ── Quién soy ────────────────────────────────────────────────────
//
// Lo llama el Box al arrancar. Es cómo sabe si el token que tenía guardado
// TODAVÍA sirve: pudo vencer, o la agencia pudo apagar la terminal. Si no
// sirve, el token se borra y la pantalla pide el código de alta en vez de
// mostrar botones que van a fallar.
//
// Un 401/403 BORRA el token guardado a propósito. Dejarlo ahí haría que cada
// arranque repitiera el mismo pedido condenado, y que la pantalla no supiera
// distinguir "nunca me dieron de alta" de "mi credencial ya no vale" — que para
// el que está en el mostrador es la misma cosa y se resuelve igual.
export async function identificarse(apiUrl, agenciaCode) {
  if (!leerToken(agenciaCode)) {
    return { ok: false, motivo: "sin-credencial", terminal: null };
  }

  let r;
  try {
    r = await fetch(`${apiUrl}${RUTA_ME}`, {
      headers: cabeceraDeTerminal(agenciaCode),
    });
  } catch (e) {
    // No se pudo preguntar. NO se borra el token: una caída de red no es una
    // credencial revocada, y borrarla acá dejaría a la terminal pidiendo un
    // código nuevo cada vez que se corta el wifi del local.
    return { ok: false, motivo: "sin-red", terminal: null };
  }

  if (r.status === 401 || r.status === 403) {
    olvidarToken(agenciaCode);
    let d = null;
    try { d = await r.json(); } catch (e) { d = null; }
    return { ok: false, motivo: "sin-credencial", terminal: null,
             mensaje: d && d.detail };
  }
  if (!r.ok) {
    return { ok: false, motivo: "sin-red", terminal: null };
  }

  let d = null;
  try { d = await r.json(); } catch (e) { d = null; }
  if (!d || !d.codigo) {
    return { ok: false, motivo: "sin-red", terminal: null };
  }
  return { ok: true, motivo: null, terminal: d };
}
