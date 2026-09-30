// ═══════════════════════════════════════════════════════════════
// PANEL DE PROVEEDORES — la lógica del interruptor, sin React.
//
// Apagar un proveedor saca sus juegos del casino para todos los jugadores
// (el catálogo en caché puede tardar hasta 5 minutos en reflejarlo). Por eso el interruptor no puede mentir en ninguna de las dos
// direcciones: ni mostrar «apagado» mientras el servidor sigue sirviendo los
// juegos, ni mostrar «activo» mientras los quitó. La regla de este módulo es
// que el estado que se dibuja es el que el servidor confirmó, salvo durante
// el instante en que el pedido está en vuelo, y ahí el interruptor se ve
// ocupado y no admite un segundo toque.
//
// El contrato sale de `listar_integraciones` y `guardar_integracion` en
// `bot/casino_api.py`, no de una descripción:
//   - el listado devuelve `adaptador`, `activa`, `monedas`, `juegos`,
//     `ips_permitidas`, `tiene_credenciales` y `ultimo_sync`;
//   - NO devuelve si la clave está cifrada. `estadoClave` lo lee de
//     `clave_cifrada` SOLO si el servidor algún día lo manda, y mientras
//     tanto dice «sin dato» en vez de inventar un estado de seguridad;
//   - guardar es un upsert por `codigo` que conserva lo que no se manda
//     (`_mantener`), de modo que `{codigo, activa}` es un pedido seguro.
// ═══════════════════════════════════════════════════════════════
import { mensajeDeDetalle } from "./betBestActions";

const SIN_CONEXION = "Sin conexión con el servidor";

function cabeceras(adminKey) {
  return adminKey ? { "X-Admin-Key": adminKey } : {};
}

async function leerJSON(respuesta) {
  try { return await respuesta.json(); } catch (e) { return {}; }
}

// ── Las llamadas ───────────────────────────────────────────────

// Solo manda `codigo` y `activa`. Mandar más sería invitar a que un dato
// viejo de la pantalla pise uno nuevo de la base (la URL, la prioridad).
export async function cambiarActiva({ api, adminKey, codigo, activa, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/casino/integraciones`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabeceras(adminKey) },
      body: JSON.stringify({ codigo, activa: activa === true }),
    });
  } catch (e) {
    return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) {
    return { ok: false, noAutorizado: true, mensaje: "" };
  }
  const cuerpo = await leerJSON(respuesta);
  // `ok: true` con un cuerpo distinto de `{ok: true}` no se acepta: un
  // proxy que contesta 200 con una página no guardó nada.
  if (!respuesta.ok || cuerpo.ok !== true) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, noAutorizado: false, mensaje };
  }
  return { ok: true, noAutorizado: false, mensaje: "" };
}

// ── La máquina del interruptor ─────────────────────────────────
//
// Estado: { lista, pendientes: {codigo: objetivo}, errores: {codigo: texto} }.
// `lista` es lo que se dibuja. Cada función devuelve un estado nuevo.

export function estadoInicial(lista = []) {
  return { lista: lista.map(normalizarProveedor), pendientes: {}, errores: {} };
}

export function normalizarProveedor(crudo) {
  const p = crudo || {};
  return {
    codigo: String(p.codigo || ""),
    nombre: String(p.nombre || p.codigo || ""),
    activa: p.activa === true,
    adaptador: String(p.adaptador || ""),
    monedas: String(p.monedas || ""),
    juegos: Number.isFinite(Number(p.juegos)) ? Number(p.juegos) : 0,
    prioridad: p.prioridad,
    url: p.url || "",
    notas: p.notas || "",
    tieneCredenciales: p.tiene_credenciales === true,
    // undefined se conserva a propósito: «el servidor no dijo» no es «false».
    claveCifrada: typeof p.clave_cifrada === "boolean" ? p.clave_cifrada : undefined,
    ips: Array.isArray(p.ips_permitidas) ? p.ips_permitidas.map(String) : [],
    ultimoSync: p.ultimo_sync || null,
  };
}

function conActiva(lista, codigo, activa) {
  return lista.map((p) => (p.codigo === codigo ? { ...p, activa } : p));
}

// El toque. Se ignora si ese proveedor ya tiene un pedido en vuelo: dos
// toques rápidos enviarían dos escrituras y la segunda podría ganar con el
// valor equivocado. Devuelve además el valor anterior, que es a lo que hay
// que volver si falla.
export function iniciarCambio(estado, codigo, activa) {
  const actual = estado.lista.find((p) => p.codigo === codigo);
  if (!actual || codigo in estado.pendientes || actual.activa === activa) {
    return { estado, anterior: null, enviar: false };
  }
  const { [codigo]: _borrado, ...errores } = estado.errores;
  return {
    anterior: actual.activa,
    enviar: true,
    estado: {
      lista: conActiva(estado.lista, codigo, activa),
      pendientes: { ...estado.pendientes, [codigo]: activa },
      errores,
    },
  };
}

export function cambioConfirmado(estado, codigo) {
  const { [codigo]: _p, ...pendientes } = estado.pendientes;
  return { ...estado, pendientes };
}

// Falló: el interruptor vuelve a donde estaba y queda dicho por qué.
export function cambioFallido(estado, codigo, anterior, mensaje) {
  const { [codigo]: _p, ...pendientes } = estado.pendientes;
  return {
    lista: conActiva(estado.lista, codigo, anterior),
    pendientes,
    errores: { ...estado.errores, [codigo]: mensaje || "No se pudo guardar el cambio" },
  };
}

// Llegó una lista nueva del servidor. Lo que está en vuelo se respeta: si
// la recarga llegó antes de que el servidor aplicara el cambio, pisar el
// interruptor haría saltar la pantalla a mitad del pedido.
export function recargar(estado, listaCruda) {
  let lista = (listaCruda || []).map(normalizarProveedor);
  for (const [codigo, objetivo] of Object.entries(estado.pendientes)) {
    lista = conActiva(lista, codigo, objetivo);
  }
  return { ...estado, lista };
}

// ── Lo que se ve de cada proveedor ─────────────────────────────

export function requiereConfirmacion(activa, objetivo) {
  // Solo apagar pide confirmación: encender no le quita nada a nadie.
  return activa === true && objetivo === false;
}

export function textoConfirmacionApagado(p) {
  const juegos = p.juegos > 0
    ? `Sus ${p.juegos} juegos`
    : "Sus juegos";
  // No se promete «de inmediato»: el catálogo del jugador se guarda en
  // memoria 5 minutos (`_CAT_TTL`) y guardar una integración no lo vacía.
  return `¿Apagar ${p.nombre}? ${juegos} dejan de estar disponibles para `
    + "todos los jugadores; el catálogo en pantalla puede tardar hasta "
    + "5 minutos en reflejarlo. Se puede volver a encender cuando se necesite.";
}

// Tres estados, no dos: cifrada, en texto plano, y «no lo sé». Afirmar
// «cifrada» sin que el servidor lo haya dicho sería el falso aplomo que
// este indicador existe para evitar.
export function estadoClave(p) {
  if (!p.tieneCredenciales) return { id: "faltan", texto: "Faltan credenciales", alerta: true };
  if (p.claveCifrada === true) return { id: "cifrada", texto: "Clave cifrada", alerta: false };
  if (p.claveCifrada === false) {
    return { id: "plano", texto: "Clave en texto plano", alerta: true };
  }
  return { id: "sin_dato", texto: "Cifrado sin verificar", alerta: false };
}

// Sin IPs registradas no significa lo mismo en todos los adaptadores
// (algunos rechazan todo, otros no filtran), así que solo se avisa que la
// lista está vacía y no se promete qué hace el servidor con ella.
export function resumenIps(p, maximo = 3) {
  if (!p.ips.length) return { vacia: true, visibles: [], resto: 0 };
  return {
    vacia: false,
    visibles: p.ips.slice(0, maximo),
    resto: Math.max(0, p.ips.length - maximo),
  };
}

export function textoJuegos(n) {
  return n === 1 ? "1 juego" : `${n} juegos`;
}
