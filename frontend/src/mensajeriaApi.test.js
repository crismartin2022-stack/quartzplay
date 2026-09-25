// Cada prueba nombra el riesgo que cubre: la pantalla maneja secretos que
// nunca vuelven completos del servidor y un botón que gasta dinero real, así
// que lo que importa no es "pega bien a la URL" sino "nunca manda una prueba
// sin destino", "nunca guarda una máscara como si fuera la clave nueva" y
// "lee la forma real que manda `admin_mensajeria_listar`", que es un objeto
// por ámbito y por campo, no una lista.
import {
  AMBITO_SMS, AMBITO_CORREO, CANAL_WHATSAPP,
  etiquetaCampo, etiquetaOrigen, validarDestino, normalizarProveedores,
  listarMensajeria, guardarCredencial, borrarCredencial, probarEnvio,
  listarPaises, listarRemitentes, validarRemitente, guardarRemitente,
  borrarRemitente, paisesSinCobertura, whatsappListo,
} from "./mensajeriaApi";

function respuestaFalsa(ok, status, cuerpo) {
  return { ok, status, json: async () => cuerpo };
}

describe("de dónde sale el valor hoy: la distinción que le da sentido a la pantalla", () => {
  test("una fila con origen base se marca como base de datos", () => {
    expect(etiquetaOrigen("base")).toBe("Base de datos");
  });

  test("origen entorno se marca como variable de entorno", () => {
    expect(etiquetaOrigen("entorno")).toBe("Variable de entorno");
  });

  test("sin origen (ni base ni entorno) es un tercer estado, no un sinónimo de entorno", () => {
    expect(etiquetaOrigen(null)).toBe("Sin configurar");
    expect(etiquetaOrigen(undefined)).toBe("Sin configurar");
  });
});

describe("la etiqueta de cada campo: el servidor no manda ninguna, solo la clave", () => {
  test("los campos de SMS que expone CAMPOS_MENSAJERIA", () => {
    expect(etiquetaCampo("clave")).toBe("Clave de API");
    expect(etiquetaCampo("remitente_sms")).toBe("Remitente SMS");
    expect(etiquetaCampo("remitente_whatsapp")).toBe("Remitente WhatsApp");
  });

  test("los campos de correo: la clave real es 'remitente', no 'desde'", () => {
    expect(etiquetaCampo("api_key")).toBe("Clave de API");
    expect(etiquetaCampo("remitente")).toBe("Remitente");
  });

  test("un campo del todo desconocido muestra su propia clave, no queda en blanco", () => {
    expect(etiquetaCampo("algo_nuevo")).toBe("algo_nuevo");
  });

  test("la plantilla de WhatsApp tiene etiqueta propia, no la clave cruda del servidor", () => {
    expect(etiquetaCampo("plantilla_whatsapp")).toBe("Plantilla de WhatsApp");
  });
});

describe("validar el destino de la prueba, antes de gastar un envío real", () => {
  test("sin nada escrito, no se manda", () => {
    expect(validarDestino(AMBITO_SMS, "").ok).toBe(false);
    expect(validarDestino(AMBITO_SMS, "   ").ok).toBe(false);
  });

  test("un teléfono con menos de ocho dígitos no alcanza", () => {
    expect(validarDestino(AMBITO_SMS, "12345").ok).toBe(false);
  });

  test("un teléfono con el indicativo pasa, con o sin separadores", () => {
    expect(validarDestino(AMBITO_SMS, "+54 9 11 2233-4455").ok).toBe(true);
    expect(validarDestino(AMBITO_SMS, "5491122334455").ok).toBe(true);
  });

  test("un correo sin arroba no pasa", () => {
    expect(validarDestino(AMBITO_CORREO, "no-es-correo").ok).toBe(false);
  });

  test("un correo con forma válida pasa", () => {
    expect(validarDestino(AMBITO_CORREO, "prueba@dominio.com").ok).toBe(true);
  });
});

describe("aplanar la forma real de `proveedores`: objeto por ámbito, objeto de campos por clave", () => {
  const CRUDO = {
    sms: {
      campos: {
        clave: { configurado: true, mascara: "e211…5194", origen: "base",
          actualizado_por: "ana", actualizado_at: "25/09/2026 10:32" },
        remitente_sms: { configurado: true, mascara: "••••", origen: "entorno",
          actualizado_por: null, actualizado_at: null },
        remitente_whatsapp: { configurado: false, mascara: null, origen: null,
          actualizado_por: null, actualizado_at: null },
      },
    },
    correo: {
      campos: {
        api_key: { configurado: false, mascara: null, origen: null,
          actualizado_por: null, actualizado_at: null },
        remitente: { configurado: true, mascara: "hola…lat", origen: "base",
          actualizado_por: "admin", actualizado_at: "24/09/2026 09:00" },
      },
    },
  };

  test("SMS va primero, como en la propuesta", () => {
    const r = normalizarProveedores(CRUDO);
    expect(r.map((p) => p.ambito)).toEqual(["sms", "correo"]);
  });

  test("cada proveedor trae su nombre legible", () => {
    const r = normalizarProveedores(CRUDO);
    expect(r[0].nombre).toBe("SMS (Dexatel)");
    expect(r[1].nombre).toBe("Correo (Resend)");
  });

  test("cada campo aplanado conserva máscara, origen y quién/cuándo", () => {
    const r = normalizarProveedores(CRUDO);
    const clave = r[0].campos.find((c) => c.clave === "clave");
    expect(clave.mascara).toBe("e211…5194");
    expect(clave.origen).toBe("base");
    expect(clave.actualizadoPor).toBe("ana");
    expect(clave.actualizadoAt).toBe("25/09/2026 10:32");
    expect(clave.etiqueta).toBe("Clave de API");
  });

  test("el remitente de correo (clave real 'remitente') no se pierde como 'desde'", () => {
    const r = normalizarProveedores(CRUDO);
    const remitente = r[1].campos.find((c) => c.clave === "remitente");
    expect(remitente).toBeDefined();
    expect(remitente.etiqueta).toBe("Remitente");
    expect(remitente.mascara).toBe("hola…lat");
  });

  test("un campo sin nada configurado llega con origen null, no 'entorno'", () => {
    const r = normalizarProveedores(CRUDO);
    const wa = r[0].campos.find((c) => c.clave === "remitente_whatsapp");
    expect(wa.origen).toBe(null);
    expect(wa.configurado).toBe(false);
  });

  test("un crudo vacío o sin forma no revienta: lista vacía", () => {
    expect(normalizarProveedores(null)).toEqual([]);
    expect(normalizarProveedores(undefined)).toEqual([]);
    expect(normalizarProveedores({})).toEqual([]);
  });
});

describe("listar el estado de los proveedores", () => {
  test("pega en GET /api/admin/mensajeria con la clave de admin", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, {
      hay_llave_maestra: true, proveedores: { sms: { campos: {} } },
    }));
    await listarMensajeria({ adminKey: "clave-x", api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/mensajeria");
    expect(opciones.headers["X-Admin-Key"]).toBe("clave-x");
  });

  test("lee 'hay_llave_maestra', el nombre real del campo", async () => {
    const r = await listarMensajeria({
      api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        hay_llave_maestra: true, proveedores: {},
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.claveMaestra).toBe(true);
  });

  test("sin clave maestra, lo dice: es lo que apaga el botón de guardar", async () => {
    const r = await listarMensajeria({
      api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, { hay_llave_maestra: false, proveedores: {} }),
    });
    expect(r.claveMaestra).toBe(false);
  });

  test("los proveedores ya llegan aplanados y listos para recorrer", async () => {
    const r = await listarMensajeria({
      api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        hay_llave_maestra: true,
        proveedores: { sms: { campos: { clave: { configurado: true, mascara: "e211…5194", origen: "base" } } } },
      }),
    });
    expect(r.proveedores).toHaveLength(1);
    expect(r.proveedores[0].campos[0].mascara).toBe("e211…5194");
  });

  test("un 401 se marca aparte: la pantalla saca al admin, no muestra un error cualquiera", async () => {
    const r = await listarMensajeria({
      api: "http://x", fetchImpl: async () => respuestaFalsa(false, 401, {}),
    });
    expect(r.noAutorizado).toBe(true);
    expect(r.ok).toBe(false);
  });

  test("sin red, no revienta y lo dice con las mismas palabras de siempre", async () => {
    const r = await listarMensajeria({
      api: "http://x", fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("Sin conexión con el servidor");
    expect(r.proveedores).toEqual([]);
  });
});

describe("guardar un campo: nunca un valor vacío, siempre envuelto en 'valores'", () => {
  test("no sale a la red si no hay nada escrito", async () => {
    const pedir = jest.fn();
    const r = await guardarCredencial({
      ambito: "sms", clave: "clave", valor: "   ", api: "http://x", fetchImpl: pedir,
    });
    expect(pedir).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  test("con valor, pega en POST con el body real: {valores:[{ambito,clave,valor}]}", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true, guardados: [] }));
    await guardarCredencial({
      ambito: "correo", clave: "api_key", valor: "  re_123  ",
      adminKey: "k", api: "http://x", fetchImpl: pedir,
    });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/mensajeria");
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body)).toEqual({
      valores: [{ ambito: "correo", clave: "api_key", valor: "re_123" }],
    });
  });

  test("un 503 se marca como falta de clave maestra, no como error genérico", async () => {
    const r = await guardarCredencial({
      ambito: "sms", clave: "clave", valor: "algo", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 503, { detail: "Falta SECRETOS_CLAVE" }),
    });
    expect(r.ok).toBe(false);
    expect(r.sinClaveMaestra).toBe(true);
    expect(r.mensaje).toBe("Falta SECRETOS_CLAVE");
  });

  test("un 401 no confunde con un rechazo cualquiera", async () => {
    const r = await guardarCredencial({
      ambito: "sms", clave: "clave", valor: "algo", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 401, {}),
    });
    expect(r.noAutorizado).toBe(true);
  });
});

describe("borrar un campo: vuelve a leer del entorno", () => {
  test("pega en DELETE con ámbito y clave en la ruta", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true }));
    await borrarCredencial({ ambito: "sms", clave: "remitente_sms", adminKey: "k", api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/mensajeria/sms/remitente_sms");
    expect(opciones.method).toBe("DELETE");
  });

  test("un rechazo se muestra tal cual lo escribió el servidor", async () => {
    const r = await borrarCredencial({
      ambito: "sms", clave: "clave", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 400, { detail: "No hay nada que borrar" }),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("No hay nada que borrar");
  });
});

describe("probar el envío: la parte que cuesta plata", () => {
  test("con destino inválido, no sale a la red", async () => {
    const pedir = jest.fn();
    const r = await probarEnvio({ ambito: "sms", destino: "abc", api: "http://x", fetchImpl: pedir });
    expect(pedir).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  test("con destino válido, pega en POST /probar con 'proveedor' (no 'ambito') y destino", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true, respuesta: { id: "m1" } }));
    await probarEnvio({ ambito: "correo", destino: "prueba@dominio.com", adminKey: "k", api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/mensajeria/probar");
    expect(JSON.parse(opciones.body)).toEqual({ proveedor: "correo", destino: "prueba@dominio.com" });
  });

  test("la respuesta cruda del proveedor viaja tal cual, para mostrarla completa", async () => {
    const cruda = { id: "m1", status: "queued" };
    const r = await probarEnvio({
      ambito: "sms", destino: "+5491122334455", api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        ok: true, identificador: "m1", status_proveedor: 202, respuesta: cruda,
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.respuestaProveedor).toEqual(cruda);
    expect(r.statusProveedor).toBe(202);
  });

  test("el proveedor puede rechazar con HTTP 200 y ok:false; no se lee como éxito", async () => {
    const r = await probarEnvio({
      ambito: "sms", destino: "+5491122334455", api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        ok: false, status_proveedor: 401, respuesta: { message: "remitente no aprobado" },
      }),
    });
    expect(r.ok).toBe(false);
    expect(r.respuestaProveedor).toEqual({ message: "remitente no aprobado" });
    expect(r.statusProveedor).toBe(401);
  });

  test("un 503 (proveedor no configurado, ni base ni entorno) se muestra tal cual y sin respuesta", async () => {
    const r = await probarEnvio({
      ambito: "sms", destino: "+5491122334455", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 503, { detail: "falta configurar el envío de SMS" }),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("falta configurar el envío de SMS");
    expect(r.respuestaProveedor).toBe(null);
  });

  test("un 401 no dispara ni mensaje ni respuesta: solo saca al admin", async () => {
    const r = await probarEnvio({
      ambito: "sms", destino: "+5491122334455", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 401, {}),
    });
    expect(r.noAutorizado).toBe(true);
    expect(r.respuestaProveedor).toBe(null);
  });

  test("con país y ambito sms, el país viaja en el body: es lo que deja al servidor elegir el remitente real", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true, remitente: "IAQP EC" }));
    await probarEnvio({ ambito: "sms", destino: "+593987654321", pais: "EC", api: "http://x", fetchImpl: pedir });
    const [, opciones] = pedir.mock.calls[0];
    expect(JSON.parse(opciones.body)).toEqual({ proveedor: "sms", destino: "+593987654321", pais: "EC" });
  });

  test("sin país, no se manda 'pais' en el body: sigue siendo el remitente por defecto, como siempre", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true }));
    await probarEnvio({ ambito: "sms", destino: "+5491122334455", api: "http://x", fetchImpl: pedir });
    const [, opciones] = pedir.mock.calls[0];
    expect(JSON.parse(opciones.body)).toEqual({ proveedor: "sms", destino: "+5491122334455" });
  });

  test("el país no aplica a correo: no tiene sentido ahí y no viaja aunque se pase", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true }));
    await probarEnvio({ ambito: "correo", destino: "x@y.com", pais: "EC", api: "http://x", fetchImpl: pedir });
    const [, opciones] = pedir.mock.calls[0];
    expect(JSON.parse(opciones.body)).toEqual({ proveedor: "correo", destino: "x@y.com" });
  });

  test("el remitente que usó el envío viaja para mostrarlo: con varios remitentes, saber que salió no alcanza", async () => {
    const r = await probarEnvio({
      ambito: "sms", destino: "+593987654321", pais: "EC", api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, { ok: true, remitente: "IAQP EC" }),
    });
    expect(r.remitenteUsado).toBe("IAQP EC");
  });

  test("sin remitente en la respuesta, no revienta: queda null, no undefined ni string vacío", async () => {
    const r = await probarEnvio({
      ambito: "correo", destino: "x@y.com", api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, { ok: true }),
    });
    expect(r.remitenteUsado).toBe(null);
  });
});

describe("GET /api/paises: el checklist de países de la pantalla de remitentes", () => {
  test("pega sin X-Admin-Key: es el mismo endpoint público que usa el registro", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { paises: [] }));
    await listarPaises({ api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/paises");
    expect(opciones).toBeUndefined();
  });

  test("devuelve la lista tal cual, con nombre legible por código", async () => {
    const r = await listarPaises({
      api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        paises: [{ codigo: "EC", nombre: "Ecuador", indicativo: "+593" }],
      }),
    });
    expect(r.ok).toBe(true);
    expect(r.paises).toEqual([{ codigo: "EC", nombre: "Ecuador", indicativo: "+593" }]);
  });

  test("sin red, no revienta: lista vacía y el mismo mensaje de siempre", async () => {
    const r = await listarPaises({
      api: "http://x", fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    });
    expect(r.ok).toBe(false);
    expect(r.paises).toEqual([]);
  });
});

describe("GET /api/admin/remitentes: la lista por canal", () => {
  test("separa sms y whatsapp, cada uno con su propia lista", async () => {
    const r = await listarRemitentes({
      adminKey: "k", api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, {
        remitentes: {
          sms: [{ id: 1, remitente: "IAQP Col", paises: ["AR", "CO"], activo: true,
            actualizado_por: "ana", actualizado_at: "25/09 10:30" }],
          whatsapp: [],
        },
      }),
    });
    expect(r.remitentes.sms).toHaveLength(1);
    expect(r.remitentes.sms[0]).toEqual({
      id: 1, remitente: "IAQP Col", paises: ["AR", "CO"], activo: true,
      actualizadoPor: "ana", actualizadoAt: "25/09 10:30",
    });
    expect(r.remitentes[CANAL_WHATSAPP]).toEqual([]);
  });

  test("un canal ausente en la respuesta no revienta: queda como lista vacía, no undefined", async () => {
    const r = await listarRemitentes({
      api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, { remitentes: { sms: [] } }),
    });
    expect(r.remitentes[CANAL_WHATSAPP]).toEqual([]);
  });

  test("un 401 se marca aparte, igual que en las credenciales", async () => {
    const r = await listarRemitentes({
      api: "http://x", fetchImpl: async () => respuestaFalsa(false, 401, {}),
    });
    expect(r.noAutorizado).toBe(true);
  });

  test("sin red, no revienta y devuelve los dos canales vacíos", async () => {
    const r = await listarRemitentes({
      api: "http://x", fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    });
    expect(r.ok).toBe(false);
    expect(r.remitentes).toEqual({ sms: [], whatsapp: [] });
  });
});

describe("guardar un remitente: upsert por (canal, remitente), sin PATCH", () => {
  test("sin remitente escrito, no sale a la red", async () => {
    const pedir = jest.fn();
    const r = await guardarRemitente({ canal: "sms", remitente: "  ", api: "http://x", fetchImpl: pedir });
    expect(pedir).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
  });

  test("un canal que no es sms ni whatsapp no sale a la red", async () => {
    const pedir = jest.fn();
    const r = await guardarRemitente({ canal: "correo", remitente: "IAQP", api: "http://x", fetchImpl: pedir });
    expect(pedir).not.toHaveBeenCalled();
    expect(r.mensaje).toBe("Canal inválido");
  });

  test("países vacíos u omitidos viajan como lista vacía: 'por defecto', no un error", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true, remitente: {} }));
    await guardarRemitente({ canal: "sms", remitente: "IAQP Col", adminKey: "k", api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/remitentes");
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body)).toEqual({
      canal: "sms", remitente: "IAQP Col", paises: [], activo: true,
    });
  });

  test("activo:false viaja tal cual, no se pisa con el default", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true, remitente: {} }));
    await guardarRemitente({
      canal: "whatsapp", remitente: "IAQP WA", paises: ["EC"], activo: false,
      adminKey: "k", api: "http://x", fetchImpl: pedir,
    });
    const [, opciones] = pedir.mock.calls[0];
    expect(JSON.parse(opciones.body)).toEqual({
      canal: "whatsapp", remitente: "IAQP WA", paises: ["EC"], activo: false,
    });
  });

  test("un país no habilitado rebota con el mensaje del servidor, no uno genérico", async () => {
    const r = await guardarRemitente({
      canal: "sms", remitente: "IAQP", paises: ["ZZ"], api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 400, { detail: "País no habilitado: ZZ" }),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("País no habilitado: ZZ");
  });

  test("un 401 no se confunde con un rechazo de validación", async () => {
    const r = await guardarRemitente({
      canal: "sms", remitente: "IAQP", api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 401, {}),
    });
    expect(r.noAutorizado).toBe(true);
  });
});

describe("borrar un remitente: por id, nunca por nombre", () => {
  test("pega en DELETE con el id en la ruta", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, { ok: true }));
    await borrarRemitente({ id: 7, adminKey: "k", api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/remitentes/7");
    expect(opciones.method).toBe("DELETE");
  });

  test("un id que ya no existe (404) muestra el mensaje del servidor", async () => {
    const r = await borrarRemitente({
      id: 99, api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 404, { detail: "Ese remitente no existe" }),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("Ese remitente no existe");
  });
});

describe("qué países se quedan sin remitente: el aviso que evita el caso Ecuador del feature doc", () => {
  const PAISES = [{ codigo: "EC" }, { codigo: "AR" }, { codigo: "CO" }];

  test("sin ningún remitente activo, todos quedan sin cubrir", () => {
    expect(paisesSinCobertura([], PAISES).map((p) => p.codigo)).toEqual(["EC", "AR", "CO"]);
  });

  test("un remitente que cubre AR y CO deja a EC afuera, el caso exacto del feature doc", () => {
    const r = paisesSinCobertura(
      [{ activo: true, paises: ["AR", "CO"] }], PAISES);
    expect(r.map((p) => p.codigo)).toEqual(["EC"]);
  });

  test("un remitente inactivo no cuenta como cobertura", () => {
    const r = paisesSinCobertura(
      [{ activo: false, paises: ["AR", "CO", "EC"] }], PAISES);
    expect(r.map((p) => p.codigo)).toEqual(["EC", "AR", "CO"]);
  });

  test("un remitente activo por defecto (países vacíos) cubre todo: sin aviso", () => {
    const r = paisesSinCobertura(
      [{ activo: true, paises: [] }], PAISES);
    expect(r).toEqual([]);
  });

  test("el por defecto gana aunque haya otro específico: el respaldo ya existe", () => {
    const r = paisesSinCobertura(
      [{ activo: true, paises: ["AR"] }, { activo: true, paises: [] }], PAISES);
    expect(r).toEqual([]);
  });
});

describe("si WhatsApp se puede ofrecer: remitente Y plantilla, los dos a la vez", () => {
  function proveedoresCon(remitenteOk, plantillaOk, claveOk = true) {
    return [{
      ambito: "sms",
      campos: [
        { clave: "clave", configurado: claveOk },
        { clave: "remitente_whatsapp", configurado: remitenteOk },
        { clave: "plantilla_whatsapp", configurado: plantillaOk },
      ],
    }];
  }

  test("con clave, remitente y plantilla, WhatsApp está listo", () => {
    expect(whatsappListo(proveedoresCon(true, true)).listo).toBe(true);
  });

  test("con remitente pero sin plantilla, no está listo: la plantilla es la que falta", () => {
    const r = whatsappListo(proveedoresCon(true, false));
    expect(r.listo).toBe(false);
    expect(r.remitenteOk).toBe(true);
    expect(r.plantillaOk).toBe(false);
  });

  test("con plantilla pero sin remitente, tampoco está listo", () => {
    const r = whatsappListo(proveedoresCon(false, true));
    expect(r.listo).toBe(false);
    expect(r.remitenteOk).toBe(false);
  });

  test("sin proveedores todavía cargados, no revienta: se lee como no listo", () => {
    expect(whatsappListo([]).listo).toBe(false);
    expect(whatsappListo(undefined).listo).toBe(false);
  });
});
