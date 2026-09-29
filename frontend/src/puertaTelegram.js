// La puerta de la raíz.
//
// `App.jsx` es la mini-app de Telegram. Adentro de Telegram funciona
// perfecto; en Chrome no dice para quién es, y quien llega por una
// búsqueda se queda mirando una pantalla que no le va a servir.
//
// Este módulo no dibuja nada: solo decide. Así se puede probar sin
// montar la pantalla entera, igual que `registroCliente.js`.

// Lo único que distingue estar adentro de Telegram es que el cliente
// inyecta `initData` firmado. Sin eso no hay identidad, y es justamente
// lo que el servidor exige para todo.
export function estaEnTelegram(win) {
  const dato = win?.Telegram?.WebApp?.initData;
  return typeof dato === "string" && dato.length > 0;
}

// El código de referido viaja igual que en `App.jsx`: `?ref=` o `?scan=`
// en la barra, o el `start_param` cuando viene desde el bot.
//
// Que sobreviva la puerta no es un detalle: si un influencer manda
// `iaqp.lat?ref=JUAN` y la persona abre en Chrome, perder el código acá
// significa que el influencer no cobra por un jugador que sí trajo.
export function codigoDeReferido(search, startParam = "") {
  const params = new URLSearchParams(search || "");
  const inicio = String(startParam || "");
  const desdeInicio = inicio.startsWith("combo_")
    ? inicio.replace("combo_", "")
    : inicio.startsWith("scan_")
      ? inicio.replace("scan_", "")
      : "";
  const codigo = params.get("ref") || params.get("scan") || desdeInicio || "";
  return codigo.trim();
}

export function enlaceAlBot(botUsername, codigo = "") {
  if (!botUsername) return "";
  const usuario = String(botUsername).replace(/^@/, "");
  return `https://t.me/${usuario}${codigo ? `?start=${encodeURIComponent(codigo)}` : ""}`;
}

// La otra salida. Quien no quiere instalar Telegram es exactamente el
// jugador que el registro del sitio existe para capturar: mandarlo solo
// al bot es perderlo.
export function enlaceAlSitio(codigo = "") {
  return `/sitio${codigo ? `?ref=${encodeURIComponent(codigo)}` : ""}`;
}
