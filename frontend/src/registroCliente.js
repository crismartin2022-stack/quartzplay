// ═══════════════════════════════════════════════════════════════
// REGISTRO DEL JUGADOR — las decisiones del formulario, sin React.
//
// Hasta ahora un jugador solo existía si lo daba de alta una agencia o si
// entraba por Telegram. `POST /api/cliente/registro` abrió la tercera
// puerta, y esta es la parte de esa puerta que se puede probar sin un
// navegador: qué se habilita cuándo, qué mensaje se muestra, y qué queda
// guardado cuando el alta sale bien.
//
// Dos reglas ordenan todo lo de abajo:
//
// 1. El registro NO pide teléfono. El jugador entra, deposita y juega. Lo
//    que exige teléfono verificado es el retiro. Por eso `marcaTelefono` y
//    `avisoVerificacion` leen el bloque `verificacion` que manda el
//    servidor en vez de deducir el estado acá: el candado de verdad está
//    en el servidor, y la pantalla tiene que decir lo mismo que él.
//
// 2. Los mensajes de error del servidor se muestran tal cual. Vienen del
//    campo `detail`, ya escritos para una persona. Las validaciones de acá
//    repiten esas mismas palabras a propósito: la pantalla avisa antes para
//    no hacerle perder el viaje, pero si igual llega al servidor, la
//    persona no lee dos versiones distintas del mismo problema.
// ═══════════════════════════════════════════════════════════════
import { mensajeDeDetalle } from "./betBestActions";

// La misma clave que ya usa la sesión del sitio: registrarse entra directo,
// no deja al jugador en la puerta pidiéndole que ahora inicie sesión.
export const CLAVE_SESION = "qp_sesion";

// El aviso se cierra para esta pestaña, no para siempre: vuelve en la
// próxima visita, porque el retiro sigue bloqueado hasta que verifique.
export const CLAVE_AVISO = "qp_aviso_verificacion";

// Ocho, no seis: la clave de mostrador la elige un cajero frente a la
// persona; esta se prueba desde internet, toda la noche.
export const LARGO_MINIMO_CLAVE = 8;

// El mismo juego de caracteres que `USUARIO_VALIDO` del servidor.
const USUARIO_VALIDO = /^[a-z0-9._-]{3,40}$/;

// Deliberadamente flojo. El servidor es el que decide si un correo sirve;
// acá solo se atajan los que no tienen forma de correo, para no gastarle
// un viaje a la persona.
const CORREO_CON_FORMA = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const SIN_CONEXION = "Sin conexión con el servidor";

// Palabra por palabra lo que contesta el servidor ante el mismo dato malo.
export const MENSAJES = {
  nombre: "Decinos tu nombre",
  usuarioVacio: "Elegí un nombre de usuario",
  usuario: "El usuario admite letras, números, punto, guion y guion bajo, "
    + "de 3 a 40 caracteres",
  correo: "Necesitamos un correo válido para que puedas recuperar tu cuenta",
  clave: `La clave necesita al menos ${LARGO_MINIMO_CLAVE} caracteres`,
  edad: "Tenés que confirmar que sos mayor de edad",
};

// El usuario viaja en minúsculas porque el servidor lo compara así. No se
// recorta a 40: si alguien escribe de más y se lo cortamos en silencio, se
// va con un usuario distinto del que eligió.
export function normalizarUsuario(crudo) {
  return String(crudo || "").trim().toLowerCase();
}

// El código de agencia viaja en mayúsculas y recortado, como lo guarda
// `limpiar_referido`.
export function normalizarReferido(crudo) {
  return String(crudo || "").trim().toUpperCase().slice(0, 40);
}

function texto(valor) {
  return String(valor === null || valor === undefined ? "" : valor);
}

// ── Qué se habilita cuándo ───────────────────────────────────────
//
// El botón mira esto y nada más: los cuatro campos obligatorios con algo
// escrito y la casilla de mayoría de edad tildada. Un botón apagado porque
// la clave es corta, sin decirlo, es un botón roto; el largo y el formato
// los revisa `validarRegistro` al apretar y los contesta con el mensaje
// exacto, debajo del campo que falla.
export function camposCompletos(campos) {
  const c = campos || {};
  return texto(c.nombre).trim() !== ""
    && texto(c.usuario).trim() !== ""
    && texto(c.correo).trim() !== ""
    && texto(c.clave) !== ""
    && c.mayorDeEdad === true;
}

// ── Qué error se muestra ─────────────────────────────────────────
//
// Devuelve los errores por campo, en el orden en que están en el
// formulario, más el primero de ellos para el resumen de arriba.
export function validarRegistro(campos) {
  const c = campos || {};
  const errores = {};

  if (texto(c.nombre).trim().length < 2) errores.nombre = MENSAJES.nombre;

  const usuario = normalizarUsuario(c.usuario);
  if (usuario === "") errores.usuario = MENSAJES.usuarioVacio;
  else if (!USUARIO_VALIDO.test(usuario)) errores.usuario = MENSAJES.usuario;

  if (!CORREO_CON_FORMA.test(texto(c.correo).trim())) errores.correo = MENSAJES.correo;

  if (texto(c.clave).length < LARGO_MINIMO_CLAVE) errores.clave = MENSAJES.clave;

  if (c.mayorDeEdad !== true) errores.mayorDeEdad = MENSAJES.edad;

  const orden = ["nombre", "usuario", "correo", "clave", "mayorDeEdad"];
  const primero = orden.find((campo) => errores[campo]);

  return {
    ok: primero === undefined,
    errores,
    primero: primero ? errores[primero] : "",
  };
}

// El cuerpo que espera el endpoint. `mayor_de_edad` va como booleano
// literal porque el servidor compara con `is True`: un "true" de texto lo
// rechaza.
export function cuerpoDeRegistro(campos) {
  const c = campos || {};
  const cuerpo = {
    nombre: texto(c.nombre).trim(),
    username: normalizarUsuario(c.usuario),
    password: texto(c.clave),
    email: texto(c.correo).trim(),
    mayor_de_edad: true,
  };
  const referido = normalizarReferido(c.referido);
  if (referido) cuerpo.referido = referido;
  return cuerpo;
}

// ── El alta ──────────────────────────────────────────────────────
//
// Valida, pide el alta y devuelve o la sesión o el mensaje que hay que
// mostrar. No toca el almacenamiento: quien guarda la sesión es el mismo
// efecto que ya la guarda cuando el jugador entra con usuario y clave, así
// hay un solo escritor de `qp_sesion`.
export async function registrarCliente({ campos, api, fetchImpl } = {}) {
  const revision = validarRegistro(campos);
  if (!revision.ok) {
    return { ok: false, mensaje: revision.primero, errores: revision.errores };
  }

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION, errores: {} };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/cliente/registro`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoDeRegistro(campos)),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION, errores: {} };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    // 400, 409 y 429 llegan con el texto ya escrito en castellano dentro de
    // `detail`. Se muestra tal cual; `mensajeDeDetalle` solo desarma la
    // forma de diccionario que usan algunos rechazos.
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, mensaje, errores: {} };
  }

  return { ok: true, sesion: cuerpo, mensaje: "", errores: {} };
}

// ── La sesión ────────────────────────────────────────────────────
//
// Las dos mitades que ya existían sueltas dentro de la raíz del sitio,
// acá para que el alta y el login guarden exactamente lo mismo.
export function leerSesion(almacen) {
  try {
    const guardado = almacen && almacen.getItem(CLAVE_SESION);
    return guardado ? JSON.parse(guardado) : null;
  } catch (e) { return null; }
}

export function guardarSesion(sesion, almacen) {
  try {
    if (!almacen) return false;
    if (sesion) almacen.setItem(CLAVE_SESION, JSON.stringify(sesion));
    else almacen.removeItem(CLAVE_SESION);
    return true;
  } catch (e) { return false; }
}

// ── La marca de teléfono ─────────────────────────────────────────
//
// Todo lo que sigue lee `verificacion` tal como viene del servidor. Si el
// bloque no está — el login todavía no lo manda — no hay marca: inventar
// un estado que el servidor no afirmó es peor que no mostrar nada.
export function marcaTelefono(verificacion) {
  const v = verificacion;
  if (!v || typeof v !== "object") return null;

  const verificado = v.telefono_verificado === true;
  const requiere = v.requiere_verificacion === true;
  // Al jugador que dio de alta una agencia no se le cambian las reglas: no
  // requiere verificación y no tiene nada que mostrar.
  if (!requiere && !verificado) return null;

  if (verificado) {
    return { verificado: true, etiqueta: "Teléfono verificado", detalle: "" };
  }
  return {
    verificado: false,
    etiqueta: "Teléfono sin verificar",
    detalle: texto(v.motivo).trim(),
  };
}

// El aviso al entrar: una línea con lo que puede y lo que no. La línea la
// escribe el servidor (`motivo`), que es el que sabe por qué está frenado.
export function avisoVerificacion(verificacion) {
  const v = verificacion;
  if (!v || typeof v !== "object") return { mostrar: false, linea: "" };
  if (v.puede_retirar !== false) return { mostrar: false, linea: "" };

  const linea = texto(v.motivo).trim();
  return {
    mostrar: true,
    linea: linea || "Para retirar necesitás verificar tu teléfono. "
      + "Podés seguir depositando y jugando mientras tanto.",
  };
}

export function avisoCerrado(almacen) {
  try { return Boolean(almacen && almacen.getItem(CLAVE_AVISO)); }
  catch (e) { return false; }
}

export function cerrarAviso(almacen) {
  try {
    if (!almacen) return false;
    almacen.setItem(CLAVE_AVISO, "1");
    return true;
  } catch (e) { return false; }
}

// ── Ofrecer verificar, o no ──────────────────────────────────────
//
// `GET /api/telefono/canales` contesta `{"canales": []}` mientras Twilio no
// esté configurado. Un botón "Verificar mi teléfono" que no puede mandar
// nada es peor que no tener botón: promete y falla. Así que la acción pide
// las dos cosas — que haya un canal por donde mandar el código, y que esta
// pantalla tenga adónde llevar a la persona. Hoy falta la segunda, así que
// se muestra el estado sin la acción.
export function ofreceVerificar(canales, hayFlujo) {
  return Array.isArray(canales) && canales.length > 0 && hayFlujo === true;
}
