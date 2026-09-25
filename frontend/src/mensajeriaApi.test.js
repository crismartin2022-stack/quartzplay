// Cada prueba nombra el riesgo que cubre: la pantalla maneja secretos que
// nunca vuelven completos del servidor y un botón que gasta dinero real, así
// que lo que importa no es "pega bien a la URL" sino "nunca manda una prueba
// sin destino", "nunca guarda una máscara como si fuera la clave nueva" y
// "lee la forma real que manda `admin_mensajeria_listar`", que es un objeto
// por ámbito y por campo, no una lista.
import {
  AMBITO_SMS, AMBITO_CORREO,
  etiquetaCampo, etiquetaOrigen, validarDestino, normalizarProveedores,
  listarMensajeria, guardarCredencial, borrarCredencial, probarEnvio,
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
});
