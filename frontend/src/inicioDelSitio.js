// La lógica de la home de /sitio (InicioWeb.jsx), sin dibujar nada.
//
// Vive aparte de Web.jsx por lo mismo que `registroCliente.js` y
// `puertaTelegram.js`: este proyecto no monta componentes en las pruebas,
// así que lo que decide qué se muestra tiene que poder probarse solo.

// `/api/live/combined` responde `{matches:[...]}`. Web.jsx leía
// `sports[].events` y `events`, dos formas que el servidor no manda: el
// polling de "En vivo" funcionaba, no fallaba y no traía nunca nada, y
// la pestaña mostraba "No hay partidos en vivo" con partidos en juego.
// La mini-app ya había corregido la misma lectura; acá se acepta la forma
// real primero y las viejas después, por si algún despliegue las sirve.
export function normalizarVivos(d) {
  const salida = [];
  const alias = (e, extra = {}) => ({ ...e, h: e.home, a: e.away, ...extra });
  (d?.matches || []).forEach(e => salida.push(alias(e)));
  (d?.sports || []).forEach(sp => (sp.events || []).forEach(e =>
    salida.push(alias(e, { liga: e.liga || sp.name }))));
  if (Array.isArray(d?.events)) d.events.forEach(e => salida.push(alias(e)));
  return salida;
}

// El combo del día es el primero que haya: primero los que armó la casa
// a mano, después los de la IA. Un combo elegido por una persona le gana
// a uno generado, y así lo hace también la mini-app.
export function elegirCombo(manuales, ia) {
  const todos = [...(manuales?.combos || []), ...(ia?.combos || [])];
  return todos.length ? todos[0] : null;
}

// La cuota de la combinada es el producto de las cuotas de cada
// selección. Un pick sin cuota no anula el combo: cuenta como 1.
export function cuotaDelCombo(combo) {
  return (combo?.picks || []).reduce((acc, p) => acc * (p.odd || 1), 1);
}

// Del formato del combo al del boleto de /sitio. Los combos manuales no
// siempre traen `event_id`; sin id propio, dos picks de partidos
// distintos chocarían en el boleto, que se llavea por id.
export function picksDelCombo(combo) {
  return (combo?.picks || []).map((p, i) => {
    const id = p.event_id || `${p.h || p.home}-${p.a || p.away}-${i}`;
    return {
      id, event_id: id, label: p.sel, sel: p.sel,
      odd: p.odd, val: p.odd, market: p.market || "h2h",
      h: p.h || p.home, a: p.a || p.away,
      home: p.h || p.home, away: p.a || p.away,
      sport: "", sport_key: p.sport_key || "",
      commence_time: p.commence_time,
    };
  });
}

// Las tres cuotas del 1X2 de un partido en vivo, en el orden en que se
// muestran. Si el partido no tiene ganador apostable devuelve vacío y la
// tarjeta se dibuja sin cuotas en vez de inventar un cero.
export function cuotasDelPartido(m) {
  const h2h = (m?.markets || {}).h2h || {};
  return Object.keys(h2h).slice(0, 3).map(nombre => ({ nombre, cuota: h2h[nombre] }));
}
