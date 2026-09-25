// ═══════════════════════════════════════════════════════════════
// CREDENCIALES DE MENSAJERÍA — la lógica de la pestaña Mensajería,
// sin React.
//
// Ver odd/tasks/credenciales-mensajeria-admin.md para la decisión completa.
// En corto: el secreto de verdad (la clave de Dexatel, la de Resend) vive
// cifrado en la base y nunca vuelve al navegador. Lo que este módulo recibe
// del servidor es siempre una vista enmascarada («e211…5194»), de dónde sale
// el valor hoy («base» o «entorno») y quién lo tocó por última vez. Nada de
// acá decide esa forma: la decide el servidor, y este módulo la lee tal
// cual llega, igual que `registroCliente.js` lee `verificacion` sin
// deducirla.
//
// El contrato de abajo está tomado de los cuatro endpoints reales en
// `bot/casino_api.py` (`admin_mensajeria_listar/guardar/borrar/probar`,
// sección "Credenciales de mensajería, desde el panel de admin"), no
// inventado: `proveedores` llega como objeto por ámbito (no lista), cada
// campo llega como objeto por clave (no lista), y el ámbito de correo se
// llama `remitente`, no `desde`. `normalizarProveedores` es el único lugar
// que conoce esa forma; el resto del módulo y la pantalla trabajan sobre
// la lista ya aplanada que devuelve.
import { mensajeDeDetalle } from "./betBestActions";

export const AMBITO_SMS = "sms";
export const AMBITO_CORREO = "correo";

const SIN_CONEXION = "Sin conexión con el servidor";

// Deliberadamente flojo, como el de `registroCliente.js`: no reemplaza la
// validación del servidor, solo evita gastar un envío real (con costo) en
// un destino que a todas luces está mal escrito.
const CORREO_CON_FORMA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function texto(valor) {
  return String(valor === null || valor === undefined ? "" : valor);
}

function cabeceras(adminKey) {
  return adminKey ? { "X-Admin-Key": adminKey } : {};
}

async function leerJSON(respuesta) {
  try { return await respuesta.json(); } catch (e) { return {}; }
}

// Nombre legible por ámbito: el servidor no manda ninguno, `CAMPOS_MENSAJERIA`
// del lado del bot solo tiene las claves de campo.
export const NOMBRE_PROVEEDOR = {
  [AMBITO_SMS]: "SMS (Dexatel)",
  [AMBITO_CORREO]: "Correo (Resend)",
};

// El orden en que se muestran los proveedores: SMS primero, como en la
// propuesta ("SMS (Dexatel) y correo (Resend)"). Cualquier ámbito nuevo que
// el servidor agregue el día de mañana entra al final, no se pierde.
const ORDEN_AMBITOS = [AMBITO_SMS, AMBITO_CORREO];

// Etiqueta por campo. Las claves son exactamente las de `CAMPOS_MENSAJERIA`
// en `bot/casino_api.py`: `clave`/`remitente_sms`/`remitente_whatsapp` para
// SMS, `api_key`/`remitente` para correo.
const ETIQUETA_CAMPO = {
  clave: "Clave de API",
  remitente_sms: "Remitente SMS",
  remitente_whatsapp: "Remitente WhatsApp",
  api_key: "Clave de API",
  remitente: "Remitente",
};

export function etiquetaCampo(clave) {
  return ETIQUETA_CAMPO[clave] || texto(clave);
}

// «base» es la fila de la base de datos (lo que se cargó desde acá).
// «entorno» es la variable de Railway, el respaldo de siempre. `null`
// (nada en ninguno de los dos lados) es un tercer estado, no un sinónimo de
// «entorno»: confundirlos haría pensar que hay un respaldo activo cuando
// en realidad no hay nada con qué mandar un mensaje.
export function etiquetaOrigen(origen) {
  if (origen === "base") return "Base de datos";
  if (origen === "entorno") return "Variable de entorno";
  return "Sin configurar";
}

// Qué se puede probar: el destino tiene que tener forma de teléfono o de
// correo, según el proveedor elegido.
export function validarDestino(ambito, destino) {
  const d = texto(destino).trim();
  if (!d) return { ok: false, mensaje: "Escribí un destino para la prueba" };
  if (ambito === AMBITO_CORREO) {
    return CORREO_CON_FORMA.test(d)
      ? { ok: true }
      : { ok: false, mensaje: "Escribí un correo válido" };
  }
  const digitos = d.replace(/[^0-9]/g, "");
  return digitos.length >= 8
    ? { ok: true }
    : { ok: false, mensaje: "Escribí un teléfono con código de país, ej: +5491122334455" };
}

// El único lugar que conoce la forma real de `proveedores`: un objeto por
// ámbito, con un objeto de campos por clave adentro. La pantalla recibe una
// lista plana, más fácil de recorrer con `.map()` y de probar sin depender
// del orden de las claves de un objeto.
export function normalizarProveedores(crudo) {
  const objeto = crudo && typeof crudo === "object" ? crudo : {};
  const ambitos = [
    ...ORDEN_AMBITOS.filter((a) => a in objeto),
    ...Object.keys(objeto).filter((a) => !ORDEN_AMBITOS.includes(a)),
  ];
  return ambitos.map((ambito) => {
    const campos = (objeto[ambito] && objeto[ambito].campos) || {};
    return {
      ambito,
      nombre: NOMBRE_PROVEEDOR[ambito] || ambito,
      campos: Object.keys(campos).map((clave) => {
        const c = campos[clave] || {};
        return {
          clave,
          etiqueta: etiquetaCampo(clave),
          mascara: c.mascara ?? null,
          configurado: c.configurado === true,
          origen: c.origen ?? null,
          actualizadoPor: c.actualizado_por ?? null,
          actualizadoAt: c.actualizado_at ?? null,
        };
      }),
    };
  });
}

// ── GET /api/admin/mensajeria ───────────────────────────────────
export async function listarMensajeria({ adminKey, api, fetchImpl } = {}) {
  const vacio = { ok: false, noAutorizado: false, mensaje: "", proveedores: [], claveMaestra: false };
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ...vacio, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/mensajeria`, { headers: cabeceras(adminKey) });
  } catch (e) {
    return { ...vacio, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) return { ...vacio, noAutorizado: true };

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ...vacio, mensaje };
  }

  return {
    ok: true, noAutorizado: false, mensaje: "",
    proveedores: normalizarProveedores(cuerpo.proveedores),
    // Sin esto en `true`, guardar cualquier campo va a fallar con 503: la
    // pantalla lo muestra antes de que el admin pierda el viaje.
    claveMaestra: cuerpo.hay_llave_maestra === true,
  };
}

// ── POST /api/admin/mensajeria ──────────────────────────────────
// body real: {"valores": [{"ambito","clave","valor"}, ...]}. La pantalla
// guarda un campo a la vez, pero el body ya viaja en la forma de lista que
// el servidor espera, para no tener que tocar esta función el día que la
// pantalla permita guardar varios de una.
export async function guardarCredencial({ ambito, clave, valor, adminKey, api, fetchImpl } = {}) {
  const v = texto(valor).trim();
  if (!v) return { ok: false, noAutorizado: false, mensaje: "Escribí un valor antes de guardar" };

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/mensajeria`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabeceras(adminKey) },
      body: JSON.stringify({ valores: [{ ambito, clave, valor: v }] }),
    });
  } catch (e) {
    return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) return { ok: false, noAutorizado: true, mensaje: "" };

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    // 503 es "no hay clave maestra": la pantalla lo distingue de un error
    // cualquiera para poder decir exactamente eso, no un "Error" genérico.
    return { ok: false, noAutorizado: false, mensaje, sinClaveMaestra: respuesta.status === 503 };
  }
  return { ok: true, noAutorizado: false, mensaje: "Guardado" };
}

// ── DELETE /api/admin/mensajeria/{ambito}/{clave} ───────────────
// Borra la fila de la base; el campo vuelve a leer la variable de entorno,
// sin reiniciar nada, tal como describe la propuesta.
export async function borrarCredencial({ ambito, clave, adminKey, api, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(
      `${api}/api/admin/mensajeria/${encodeURIComponent(ambito)}/${encodeURIComponent(clave)}`,
      { method: "DELETE", headers: cabeceras(adminKey) },
    );
  } catch (e) {
    return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) return { ok: false, noAutorizado: true, mensaje: "" };
  if (!respuesta.ok) {
    const cuerpo = await leerJSON(respuesta);
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, noAutorizado: false, mensaje };
  }
  return { ok: true, noAutorizado: false, mensaje: "" };
}

// ── POST /api/admin/mensajeria/probar ───────────────────────────
// body real: {"proveedor": "sms"|"correo", "destino": "..."}. No pasa por
// `SECRETOS_CLAVE`: prueba la credencial activa ahora mismo, venga de la
// base o del entorno, así que sigue disponible aunque no haya clave
// maestra. El servidor contesta 200 con `ok:false` cuando el proveedor
// rechaza el envío (no lo trata como error HTTP), así que ese caso se lee
// del cuerpo, no del status.
export async function probarEnvio({ ambito, destino, adminKey, api, fetchImpl } = {}) {
  const revision = validarDestino(ambito, destino);
  if (!revision.ok) {
    return {
      ok: false, noAutorizado: false, mensaje: revision.mensaje,
      respuestaProveedor: null, statusProveedor: null,
    };
  }

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) {
    return {
      ok: false, noAutorizado: false, mensaje: SIN_CONEXION,
      respuestaProveedor: null, statusProveedor: null,
    };
  }

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/mensajeria/probar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabeceras(adminKey) },
      body: JSON.stringify({ proveedor: ambito, destino: texto(destino).trim() }),
    });
  } catch (e) {
    return {
      ok: false, noAutorizado: false, mensaje: SIN_CONEXION,
      respuestaProveedor: null, statusProveedor: null,
    };
  }
  if (respuesta.status === 401) {
    return { ok: false, noAutorizado: true, mensaje: "", respuestaProveedor: null, statusProveedor: null };
  }

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    // El 503 de "proveedor no configurado" (ni base ni entorno) llega así.
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, noAutorizado: false, mensaje, respuestaProveedor: null, statusProveedor: null };
  }

  // La respuesta cruda del proveedor viaja tal cual para mostrarla: es la
  // única forma de que un admin vea por qué una credencial "buena" igual
  // rebota (remitente sin aprobar, cuenta sin saldo, lo que sea).
  const proveedorOk = cuerpo.ok !== false;
  return {
    ok: proveedorOk,
    noAutorizado: false,
    mensaje: proveedorOk ? "Enviado" : "El proveedor rechazó el envío",
    respuestaProveedor: cuerpo.respuesta ?? null,
    statusProveedor: cuerpo.status_proveedor ?? null,
  };
}
