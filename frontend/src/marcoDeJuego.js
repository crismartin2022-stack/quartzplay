// La lógica de la pantalla que enmarca un juego del casino.
//
// `JuegoEnMarco.jsx` dibuja; este módulo decide. Así el plazo de carga,
// la forma del marco y la validación del enlace se prueban sin montar
// ninguna pantalla, igual que `registroCliente.js` y `puertaTelegram.js`.

// Cuánto se espera a que el marco avise que cargó. Un estudio que
// prohíbe ser enmarcado (X-Frame-Options o frame-ancestors) no dispara
// ningún error: el marco queda en blanco. Desde afuera no se puede leer
// el documento de otro dominio, así que el único indicio honesto es que
// el aviso de carga no llegue. 15 s cubre una conexión móvil mala sin
// dejar al jugador mirando un rectángulo vacío.
export const PLAZO_CARGA_MS = 15000;

// El saldo se mueve mientras se juega y el jugador no toca nada de
// nuestra app para provocarlo. Sin volver a pedirlo, el número de la
// cabecera quedaría congelado en el de antes de la primera apuesta.
export const PERIODO_SALDO_MS = 10000;

// Alto de la cabecera del marco. Vive acá porque el tamaño del juego
// se calcula descontándola.
export const ALTO_CABECERA = 48;

// Los juegos de estudio se diseñan para 16:9 en horizontal.
const RELACION_JUEGO = 16 / 9;

// Solo se enmarca un enlace http(s). El enlace sale del servidor, pero
// un `javascript:` o un `data:` metido en `src` o en `window.open`
// ejecutaría código en nuestro dominio: se valida antes de usarlo.
export function urlDeJuego(url) {
  if (typeof url !== "string") return null;
  try {
    const u = new URL(url.trim());
    return u.protocol === "https:" || u.protocol === "http:" ? u.href : null;
  } catch (e) {
    return null;
  }
}

// Estados del marco:
//   cargando → esperando el aviso de carga
//   listo    → el marco avisó que cargó
//   lento    → venció el plazo sin aviso: probablemente se niega a ser
//              enmarcado, o la conexión no da
//
// `lento` puede pasar a `listo` si el aviso llega tarde: el marco sigue
// montado debajo del cartel justamente por eso.
export function estadoInicial() {
  return "cargando";
}

export function reducirMarco(estado, evento) {
  switch (evento) {
    case "cargo":
      return "listo";
    case "vencio":
      // Un plazo que vence después de cargar es un temporizador viejo.
      return estado === "cargando" ? "lento" : estado;
    case "reintentar":
      return "cargando";
    default:
      return estado;
  }
}

// El marco ocupa todo el espacio disponible salvo en una pantalla ancha
// y baja: ahí, más ancho que 16:9 sería una franja de juego estirada.
// En teléfono, vertical u horizontal, se aprovecha hasta el último
// píxel: es donde menos alto sobra.
export function dimensionesMarco(ancho, alto) {
  const a = Math.max(0, Math.round(ancho) || 0);
  const h = Math.max(0, Math.round(alto - ALTO_CABECERA) || 0);
  const pantallaChica = a <= h || a < 640 || h < 450;
  if (pantallaChica) return { ancho: a, alto: h };
  return { ancho: Math.min(a, Math.round(h * RELACION_JUEGO)), alto: h };
}

// Salir del juego en una pestaña aparte. Dentro de Telegram el
// navegador propio es la única salida que la mini-app tiene.
// Devuelve false si el navegador bloqueó la ventana, para poder
// decírselo al jugador en vez de dejarlo tocando un botón muerto.
export function abrirAparte(win, url) {
  const destino = urlDeJuego(url);
  if (!destino || !win) return false;
  const tg = win.Telegram?.WebApp;
  if (tg?.initData && typeof tg.openLink === "function") {
    tg.openLink(destino);
    return true;
  }
  const nueva = win.open(destino, "_blank");
  if (!nueva) return false;
  // Sin esto el estudio podría manejar nuestra pestaña desde la suya.
  try { nueva.opener = null; } catch (e) { /* otro origen: ya está aislada */ }
  return true;
}
