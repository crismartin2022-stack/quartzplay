// ═══════════════════════════════════════════════════════════════
// CREDENCIALES DE MENSAJERÍA — la lógica de la pestaña Mensajería,
// sin React.
//
// Ver odd/tasks/credenciales-mensajeria-admin.md para la decisión completa.
// En corto: el secreto de verdad (la clave de Dexatel, la de Resend) vive
// cifrado en la base y nunca vuelve al navegador; llega enmascarado
// («e211…5194») y marcado con `secreto: true`. Los demás campos —el
// remitente, la dirección de salida— no son secretos y llegan enteros: son
// datos que el admin necesita leer, y esconderlos no protege nada.
// Nada de acá decide cuál es cuál: lo decide el servidor, y este módulo lo
// lee tal cual llega, igual que `registroCliente.js` lee `verificacion` sin
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
  // El servidor ya manda este campo (`CAMPOS_MENSAJERIA.sms.plantilla_whatsapp`
  // en `casino_api.py`), pero hasta ahora no tenía etiqueta acá y se mostraba
  // con la clave cruda. Sin ella no hay forma de decir, en la sección de
  // remitentes, que a WhatsApp le falta la plantilla y no el remitente.
  plantilla_whatsapp: "Plantilla de WhatsApp",
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
          // Lo decide el servidor, no la pantalla. Un campo que no es
          // secreto se escribe a la vista: una dirección de correo o un
          // remitente detrás de puntitos no protege nada y sí hace que
          // cargarlos a ciegas termine en un tipeo mal hecho que nadie ve.
          secreto: c.secreto === true,
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
// `pais` es opcional y solo tiene efecto en `ambito==="sms"`: es lo que le
// permite al servidor resolver el remitente igual que lo haría un envío
// real (`_credenciales_para_envio` en `casino_api.py`). Sin país, la prueba
// usa el remitente por defecto del canal, como siempre.
export async function probarEnvio({ ambito, destino, pais, adminKey, api, fetchImpl } = {}) {
  const revision = validarDestino(ambito, destino);
  if (!revision.ok) {
    return {
      ok: false, noAutorizado: false, mensaje: revision.mensaje,
      respuestaProveedor: null, statusProveedor: null, remitenteUsado: null,
    };
  }

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) {
    return {
      ok: false, noAutorizado: false, mensaje: SIN_CONEXION,
      respuestaProveedor: null, statusProveedor: null, remitenteUsado: null,
    };
  }

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/mensajeria/probar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabeceras(adminKey) },
      body: JSON.stringify({
        proveedor: ambito, destino: texto(destino).trim(),
        ...(ambito === AMBITO_SMS && texto(pais).trim() ? { pais: texto(pais).trim() } : {}),
      }),
    });
  } catch (e) {
    return {
      ok: false, noAutorizado: false, mensaje: SIN_CONEXION,
      respuestaProveedor: null, statusProveedor: null, remitenteUsado: null,
    };
  }
  if (respuesta.status === 401) {
    return {
      ok: false, noAutorizado: true, mensaje: "",
      respuestaProveedor: null, statusProveedor: null, remitenteUsado: null,
    };
  }

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    // El 503 de "proveedor no configurado" (ni base ni entorno) llega así.
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return {
      ok: false, noAutorizado: false, mensaje,
      respuestaProveedor: null, statusProveedor: null, remitenteUsado: null,
    };
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
    // Con varios remitentes activos, saber que el envío salió no alcanza:
    // hace falta saber por cuál salió, que es justo lo que cambia si el
    // país de la prueba no está cubierto.
    remitenteUsado: cuerpo.remitente ?? null,
  };
}

// ═══════════════════════════════════════════════════════════════
// REMITENTES POR PAÍS — la sección nueva de la pestaña Mensajería.
//
// Ver odd/tasks/remitentes-por-pais-y-whatsapp.md para la decisión
// completa. En corto: a diferencia de las credenciales de arriba, un
// remitente no es un secreto — es un nombre que el jugador ve en su
// teléfono — así que viaja en texto plano, en su propia tabla
// (`remitentes_mensajeria`), con su lista de países.
//
// `canal` es "sms"|"whatsapp" (los mismos nombres que ya usa
// `mensajeria.SMS`/`mensajeria.WHATSAPP` en el bot), distinto de `ambito`
// ("sms"|"correo") que usan las credenciales de arriba. Para SMS los dos
// valores coinciden en el texto ("sms"), así que no hace falta una
// segunda constante: `AMBITO_SMS` sirve para los dos.
export const CANAL_WHATSAPP = "whatsapp";

function normalizarRemitente(f) {
  const c = f || {};
  return {
    id: c.id,
    remitente: texto(c.remitente),
    paises: Array.isArray(c.paises) ? c.paises : [],
    activo: c.activo === true,
    actualizadoPor: c.actualizado_por ?? null,
    actualizadoAt: c.actualizado_at ?? null,
  };
}

// ── GET /api/paises ──────────────────────────────────────────────
// Público, sin `X-Admin-Key`: es la misma lista que ya consume el
// registro de jugadores. La pantalla de remitentes la usa para el
// checklist de países, no para inventar una lista propia que se
// desincronice de `PAISES_LATAM`.
export async function listarPaises({ api, fetchImpl } = {}) {
  const vacio = { ok: false, mensaje: "", paises: [] };
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ...vacio, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/paises`);
  } catch (e) {
    return { ...vacio, mensaje: SIN_CONEXION };
  }
  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ...vacio, mensaje };
  }
  return { ok: true, mensaje: "", paises: Array.isArray(cuerpo.paises) ? cuerpo.paises : [] };
}

// ── GET /api/admin/remitentes ────────────────────────────────────
// body real: {"remitentes": {"sms": [...], "whatsapp": [...]}}. Se
// devuelven los dos canales siempre presentes (listas vacías si no hay
// filas), para que la pantalla no tenga que adivinar si faltan por
// cargar o si de verdad no hay ninguno todavía.
export async function listarRemitentes({ adminKey, api, fetchImpl } = {}) {
  const vacio = {
    ok: false, noAutorizado: false, mensaje: "",
    remitentes: { [AMBITO_SMS]: [], [CANAL_WHATSAPP]: [] },
  };
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ...vacio, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/remitentes`, { headers: cabeceras(adminKey) });
  } catch (e) {
    return { ...vacio, mensaje: SIN_CONEXION };
  }
  if (respuesta.status === 401) return { ...vacio, noAutorizado: true };

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ...vacio, mensaje };
  }
  const crudo = cuerpo.remitentes || {};
  return {
    ok: true, noAutorizado: false, mensaje: "",
    remitentes: {
      [AMBITO_SMS]: (crudo[AMBITO_SMS] || []).map(normalizarRemitente),
      [CANAL_WHATSAPP]: (crudo[CANAL_WHATSAPP] || []).map(normalizarRemitente),
    },
  };
}

// Lo mínimo antes de salir a la red: el servidor vuelve a validar todo
// (el país contra `PAISES_LATAM`, incluso), pero un remitente vacío es un
// viaje que ya se sabe que va a fallar.
export function validarRemitente({ canal, remitente }) {
  if (canal !== AMBITO_SMS && canal !== CANAL_WHATSAPP) {
    return { ok: false, mensaje: "Canal inválido" };
  }
  if (!texto(remitente).trim()) {
    return { ok: false, mensaje: "Escribí un nombre de remitente" };
  }
  return { ok: true, mensaje: "" };
}

// ── POST /api/admin/remitentes ───────────────────────────────────
// Upsert por (canal, remitente): no hay PATCH, así que editar (incluso
// solo tildar/destildar "activo") re-manda la fila entera. `paises`
// vacío es intencional -no un error de tipeo de la pantalla- y significa
// "remitente por defecto de este canal".
export async function guardarRemitente({ canal, remitente, paises, activo, adminKey, api, fetchImpl } = {}) {
  const revision = validarRemitente({ canal, remitente });
  if (!revision.ok) return { ok: false, noAutorizado: false, mensaje: revision.mensaje, remitente: null };

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION, remitente: null };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/remitentes`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...cabeceras(adminKey) },
      body: JSON.stringify({
        canal, remitente: texto(remitente).trim(),
        paises: Array.isArray(paises) ? paises : [],
        activo: activo !== false,
      }),
    });
  } catch (e) {
    return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION, remitente: null };
  }
  if (respuesta.status === 401) return { ok: false, noAutorizado: true, mensaje: "", remitente: null };

  const cuerpo = await leerJSON(respuesta);
  if (!respuesta.ok) {
    // Acá llega, por ejemplo, "País no habilitado: XX" si se coló un
    // código que no está en `PAISES_LATAM`.
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, noAutorizado: false, mensaje, remitente: null };
  }
  return {
    ok: true, noAutorizado: false, mensaje: "Guardado",
    remitente: cuerpo.remitente ? normalizarRemitente(cuerpo.remitente) : null,
  };
}

// ── DELETE /api/admin/remitentes/{id} ────────────────────────────
// Por id, no por nombre: el remitente es texto libre ("IAQP Col") y
// forzarlo a viajar en la URL es una fuente de problemas de escape que
// un id numérico no tiene. Los países que cubría caen al siguiente
// escalón de `elegir_remitente` (el remitente por defecto, o el entorno).
export async function borrarRemitente({ id, adminKey, api, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, noAutorizado: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/admin/remitentes/${encodeURIComponent(id)}`,
      { method: "DELETE", headers: cabeceras(adminKey) });
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

// Qué países se quedan sin ningún remitente activo que los cubra. Es la
// cuenta que sostiene el aviso de la pantalla: la misma que dejó a
// Ecuador afuera en el feature doc, hecha visible antes de que un
// jugador la sufra.
//
// Un remitente activo con `paises` vacío es el por defecto del canal y
// cubre cualquier país que no tenga uno específico (mismo orden que
// `elegir_remitente` en `mensajeria.py`), así que si existe uno no hay
// país sin cobertura: el respaldo ya está.
export function paisesSinCobertura(remitentes, paises) {
  const activos = (remitentes || []).filter((r) => r.activo);
  if (activos.some((r) => !r.paises || r.paises.length === 0)) return [];
  const cubiertos = new Set(activos.flatMap((r) => r.paises || []));
  return (paises || []).filter((p) => !cubiertos.has(p.codigo));
}

// Si WhatsApp se puede ofrecer: hace falta remitente Y plantilla
// aprobada (`Credenciales.whatsapp_listo` en `mensajeria.py`), los dos a
// la vez. Mostrar la lista de remitentes de WhatsApp sin decir esto
// primero parece un canal listo para usarse cuando en realidad
// `canales_disponibles()` lo está omitiendo del registro de jugadores.
export function whatsappListo(proveedores) {
  const sms = (proveedores || []).find((p) => p.ambito === AMBITO_SMS);
  const campo = (clave) => (sms?.campos || []).find((c) => c.clave === clave);
  const claveOk = !!campo("clave")?.configurado;
  const remitenteOk = !!campo("remitente_whatsapp")?.configurado;
  const plantillaOk = !!campo("plantilla_whatsapp")?.configurado;
  return {
    claveOk, remitenteOk, plantillaOk,
    listo: claveOk && remitenteOk && plantillaOk,
  };
}
