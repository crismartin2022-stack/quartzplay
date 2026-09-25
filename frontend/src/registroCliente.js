// ═══════════════════════════════════════════════════════════════
// REGISTRO DEL JUGADOR — las decisiones del formulario, sin React.
//
// Hasta ahora un jugador solo existía si lo daba de alta una agencia o si
// entraba por Telegram. El alta desde el sitio abrió la tercera puerta, y
// esta es la parte de esa puerta que se puede probar sin un navegador: qué
// se habilita cuándo, qué mensaje se muestra, y qué queda guardado cuando
// el alta sale bien.
//
// Tres reglas ordenan todo lo de abajo:
//
// 1. El registro SÍ pide teléfono, pero no lo verifica ahí mismo. El
//    jugador entra, deposita y juega igual; lo que exige teléfono
//    verificado es el retiro. Por eso `marcaTelefono` y `avisoVerificacion`
//    leen el bloque `verificacion` que manda el servidor en vez de deducir
//    el estado acá: el candado de verdad está en el servidor, y la
//    pantalla tiene que decir lo mismo que él.
//
// 2. El alta ahora tiene dos pasos: `iniciarRegistro` manda un código al
//    correo y `confirmarRegistro` lo cambia por la cuenta creada. Sin eso,
//    cualquiera se registra con un correo ajeno y la recuperación de clave
//    queda apuntando a una bandeja que no es suya. El día que entre el
//    login con Google, ese paso se salta entero —Google ya probó el
//    correo— y por eso vive separado de la validación del resto del
//    formulario, no mezclado con ella.
//
// 3. Los mensajes de error del servidor se muestran tal cual. Vienen del
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
  pais: "Elegí tu país",
  telefono: "Escribí tu número de celular",
  edad: "Tenés que confirmar que sos mayor de edad",
  codigo: "Escribí el código de 6 dígitos",
};

// Ecuador, Argentina y Venezuela: los tres mercados de lanzamiento, y hoy
// los únicos tres que el servidor sabe verificar (`registro_publico.PAISES`
// del lado del bot). Si `GET /api/paises` no contesta, el formulario sigue
// andando con esta lista: perder el listado completo no debería dejar a
// nadie sin poder registrarse.
export const PAISES_RESPALDO = [
  { codigo: "EC", nombre: "Ecuador", indicativo: "+593" },
  { codigo: "AR", nombre: "Argentina", indicativo: "+54" },
  { codigo: "VE", nombre: "Venezuela", indicativo: "+58" },
];

// El servidor ya manda la lista en el orden correcto (los tres mercados de
// lanzamiento primero, el resto alfabético) adentro de `{"paises": [...]}`.
// Acá no se reordena nada: solo se decide qué mostrar si el pedido falla.
export async function obtenerPaises({ api, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return PAISES_RESPALDO;
  try {
    const respuesta = await pedir(`${api}/api/paises`);
    if (!respuesta.ok) return PAISES_RESPALDO;
    const cuerpo = await respuesta.json();
    const lista = cuerpo && Array.isArray(cuerpo.paises) ? cuerpo.paises : null;
    return lista && lista.length > 0 ? lista : PAISES_RESPALDO;
  } catch (e) {
    return PAISES_RESPALDO;
  }
}

// Deja solo los dígitos. Sirve tanto para el código de 6 cifras como para
// lo que la persona pega en el campo de teléfono.
export function soloDigitos(crudo) {
  return String(crudo || "").replace(/\D/g, "");
}

// Cuenta atrás en mm:ss, para el vencimiento del código y para el bloqueo
// del reenvío. Un negativo se pisa en cero: un contador que muestra
// "-1:00" es peor que uno que se queda quieto.
export function formatearRestante(segundosTotales) {
  const s = Math.max(0, Math.floor(segundosTotales || 0));
  const min = Math.floor(s / 60);
  const seg = s % 60;
  return `${min}:${String(seg).padStart(2, "0")}`;
}

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
// El botón mira esto y nada más: los campos obligatorios con algo escrito
// y la casilla de mayoría de edad tildada. Un botón apagado porque la
// clave es corta, sin decirlo, es un botón roto; el largo y el formato los
// revisa `validarRegistro` al apretar y los contesta con el mensaje
// exacto, debajo del campo que falla.
export function camposCompletos(campos) {
  const c = campos || {};
  return texto(c.nombre).trim() !== ""
    && texto(c.usuario).trim() !== ""
    && texto(c.correo).trim() !== ""
    && texto(c.clave) !== ""
    && texto(c.pais).trim() !== ""
    && texto(c.telefono).trim() !== ""
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

  if (texto(c.pais).trim() === "") errores.pais = MENSAJES.pais;

  // Suelto a propósito: quien decide si el número sirve para mandar un
  // código es el servidor, con la librería que conoce el formato de cada
  // país. Acá solo se ataja lo que claramente no tiene forma de teléfono,
  // para no gastarle un viaje a la persona.
  if (soloDigitos(c.telefono).length < 6) errores.telefono = MENSAJES.telefono;

  if (c.mayorDeEdad !== true) errores.mayorDeEdad = MENSAJES.edad;

  const orden = ["nombre", "usuario", "correo", "clave", "pais", "telefono", "mayorDeEdad"];
  const primero = orden.find((campo) => errores[campo]);

  return {
    ok: primero === undefined,
    errores,
    primero: primero ? errores[primero] : "",
  };
}

// El cuerpo que espera `/api/cliente/registro/iniciar`. Mismos nombres de
// campo que usaba el alta vieja de un solo paso (`username`, `password`,
// `mayor_de_edad`): el endpoint nuevo es la continuación de aquel, no un
// contrato distinto. `mayor_de_edad` va como booleano literal porque el
// servidor lo compara con `is True`: un "true" de texto lo rechaza. El
// teléfono viaja tal como lo escribió la persona, sin el indicativo: el
// país ya va aparte y es el servidor el que arma el número completo con
// la librería que conoce cada formato.
export function cuerpoDeInicio(campos) {
  const c = campos || {};
  const cuerpo = {
    nombre: texto(c.nombre).trim(),
    username: normalizarUsuario(c.usuario),
    email: texto(c.correo).trim(),
    password: texto(c.clave),
    pais: texto(c.pais).trim().toUpperCase(),
    telefono: texto(c.telefono).trim(),
    mayor_de_edad: true,
  };
  const referido = normalizarReferido(c.referido);
  if (referido) cuerpo.referido = referido;
  return cuerpo;
}

// ── El alta, en dos pasos ──────────────────────────────────────────
//
// `iniciarRegistro` valida, manda el código al correo y devuelve el
// token `pendiente` que hay que guardar hasta que la persona lo escriba.
// Nada de esto crea la cuenta todavía: eso lo hace `confirmarRegistro`.
export async function iniciarRegistro({ campos, api, fetchImpl } = {}) {
  const revision = validarRegistro(campos);
  if (!revision.ok) {
    return { ok: false, mensaje: revision.primero, errores: revision.errores };
  }

  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION, errores: {} };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/cliente/registro/iniciar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(cuerpoDeInicio(campos)),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION, errores: {} };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    // 400, 409, 429 y el 503 de "no se pudo mandar el correo" llegan con
    // el texto ya escrito en castellano dentro de `detail`. Se muestra
    // tal cual; `mensajeDeDetalle` solo desarma la forma de diccionario
    // que usan algunos rechazos.
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, mensaje, errores: {} };
  }

  return {
    ok: true,
    pendiente: cuerpo.pendiente,
    correoEnmascarado: cuerpo.correo_enmascarado || "",
    expiraEnMinutos: cuerpo.expira_en_minutos || 15,
    mensaje: "",
    errores: {},
  };
}

// `confirmarRegistro` cambia el código por la cuenta. Si sale bien, la
// respuesta trae exactamente lo mismo que el login: token, user y
// verificación, para que la raíz del sitio la guarde igual que a
// cualquier sesión. No toca el almacenamiento por el mismo motivo que
// antes: hay un solo escritor de `qp_sesion`.
export async function confirmarRegistro({ pendiente, codigo, api, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION, expirado: false };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/cliente/registro/confirmar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendiente, codigo: soloDigitos(codigo) }),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION, expirado: false };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    // El 410 es el único caso en que no alcanza con mostrar el mensaje:
    // la pantalla tiene que dejar de contar el código como vigente y
    // empujar hacia el reenvío, porque el que tenía escrito ya no sirve.
    return { ok: false, mensaje, expirado: respuesta.status === 410 };
  }

  return { ok: true, sesion: cuerpo, mensaje: "", expirado: false };
}

// `reenviarCodigoRegistro` pide uno nuevo sin perder el `pendiente` ni
// los datos que la persona ya escribió: solo actualiza cuánto falta para
// que el código nuevo venza.
export async function reenviarCodigoRegistro({ pendiente, api, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/cliente/registro/reenviar`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pendiente }),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, mensaje };
  }

  return { ok: true, expiraEnMinutos: cuerpo.expira_en_minutos || 15, mensaje: "" };
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
// `GET /api/telefono/canales` contesta `{"canales": []}` mientras el proveedor de SMS no
// esté configurado. Un botón "Verificar mi teléfono" que no puede mandar
// nada es peor que no tener botón: promete y falla. Así que la acción pide
// las dos cosas — que haya un canal por donde mandar el código, y que esta
// pantalla tenga adónde llevar a la persona.
export function ofreceVerificar(canales, hayFlujo) {
  return Array.isArray(canales) && canales.length > 0 && hayFlujo === true;
}

// Lo que le toca decir a la pantalla cuando ya se sabe que no hay ningún
// canal: no un botón muerto, sino la verdad. Mientras `canales` todavía no
// llegó (`null`) no se dice nada, para no avisar algo que un instante
// después puede ser mentira.
export function avisoSinCanales(canales, hayFlujo) {
  if (hayFlujo !== true) return { mostrar: false, linea: "" };
  if (!Array.isArray(canales) || canales.length > 0) return { mostrar: false, linea: "" };
  return {
    mostrar: true,
    linea: "Por ahora no podemos mandarte un código: la verificación "
      + "todavía no está disponible. Te avisamos apenas lo esté.",
  };
}

// ── Verificar el teléfono ────────────────────────────────────────
//
// Los mismos dos endpoints valen para el jugador de Telegram y para el
// del navegador (`_jugador_actual`, del lado del servidor). Acá solo se
// manda la mitad del navegador: el token de la sesión en el encabezado,
// igual que el resto del sitio habla con la API.
export async function pedirCodigoTelefono({ telefono, pais, canal, api, token, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/me/telefono/codigo`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telefono: texto(telefono).trim(),
        pais: texto(pais).trim().toUpperCase(),
        canal,
      }),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, mensaje };
  }

  return { ok: true, mensaje: "", venceEnMinutos: cuerpo.vence_en_minutos || 10 };
}

export async function verificarCodigoTelefono({ telefono, pais, codigo, api, token, fetchImpl } = {}) {
  const pedir = fetchImpl || (typeof fetch === "function" ? fetch : null);
  if (!pedir) return { ok: false, mensaje: SIN_CONEXION };

  let respuesta;
  try {
    respuesta = await pedir(`${api}/api/me/telefono/verificar`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        telefono: texto(telefono).trim(),
        pais: texto(pais).trim().toUpperCase(),
        codigo: soloDigitos(codigo),
      }),
    });
  } catch (e) {
    return { ok: false, mensaje: SIN_CONEXION };
  }

  let cuerpo = {};
  try { cuerpo = await respuesta.json(); } catch (e) { cuerpo = {}; }

  if (!respuesta.ok) {
    const { mensaje } = mensajeDeDetalle(cuerpo.detail);
    return { ok: false, mensaje };
  }

  return { ok: true, mensaje: "", estado: cuerpo.estado || null };
}
