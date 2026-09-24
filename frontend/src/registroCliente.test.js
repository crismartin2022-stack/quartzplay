// La lógica del formulario de registro, probada sin navegador: qué habilita
// el botón, qué mensaje se muestra ante cada dato malo y ante cada rechazo
// del servidor, y qué queda guardado cuando el alta sale bien.
import {
  CLAVE_SESION, CLAVE_AVISO, MENSAJES,
  camposCompletos, validarRegistro, cuerpoDeRegistro, normalizarReferido,
  registrarCliente, guardarSesion, leerSesion,
  marcaTelefono, avisoVerificacion, avisoCerrado, cerrarAviso,
  ofreceVerificar,
} from "./registroCliente";

const VALIDOS = {
  nombre: "Ana Pérez",
  usuario: "ana.perez",
  correo: "ana@correo.com",
  clave: "unaclavelarga",
  referido: "",
  mayorDeEdad: true,
};

// Un localStorage de mentira: guarda en memoria y se deja inspeccionar.
function almacenFalso(inicial = {}) {
  const datos = { ...inicial };
  return {
    datos,
    getItem: (k) => (k in datos ? datos[k] : null),
    setItem: (k, v) => { datos[k] = String(v); },
    removeItem: (k) => { delete datos[k]; },
  };
}

function respuestaFalsa(ok, status, cuerpo) {
  return { ok, status, json: async () => cuerpo };
}

describe("qué habilita el botón de crear cuenta", () => {
  test("con los cuatro campos y la casilla de edad, se habilita", () => {
    expect(camposCompletos(VALIDOS)).toBe(true);
  });

  test.each([
    ["nombre", { nombre: "" }],
    ["usuario", { usuario: "   " }],
    ["correo", { correo: "" }],
    ["clave", { clave: "" }],
  ])("sin %s, sigue apagado", (_campo, falta) => {
    expect(camposCompletos({ ...VALIDOS, ...falta })).toBe(false);
  });

  test("sin tildar la mayoría de edad, sigue apagado", () => {
    expect(camposCompletos({ ...VALIDOS, mayorDeEdad: false })).toBe(false);
  });

  test("una casilla que no es el booleano `true` no alcanza", () => {
    expect(camposCompletos({ ...VALIDOS, mayorDeEdad: "true" })).toBe(false);
  });

  test("el código de referido es opcional: sin él también se habilita", () => {
    const { referido, ...sinReferido } = VALIDOS;
    expect(camposCompletos(sinReferido)).toBe(true);
  });

  test("sin campos no explota", () => {
    expect(camposCompletos(undefined)).toBe(false);
  });
});

describe("qué error se muestra por cada dato que el servidor va a rechazar", () => {
  test("los datos válidos no dejan ningún error", () => {
    const r = validarRegistro(VALIDOS);
    expect(r.ok).toBe(true);
    expect(r.errores).toEqual({});
    expect(r.primero).toBe("");
  });

  test("un nombre de una letra pide el nombre", () => {
    expect(validarRegistro({ ...VALIDOS, nombre: "A" }).errores.nombre)
      .toBe(MENSAJES.nombre);
  });

  test("un usuario vacío pide elegir uno", () => {
    expect(validarRegistro({ ...VALIDOS, usuario: "" }).errores.usuario)
      .toBe(MENSAJES.usuarioVacio);
  });

  test.each([
    ["dos caracteres", "ab"],
    ["un espacio en el medio", "ana perez"],
    ["un signo que no admite", "ana@perez"],
    ["más de cuarenta", "a".repeat(41)],
  ])("un usuario con %s explica qué admite", (_caso, usuario) => {
    expect(validarRegistro({ ...VALIDOS, usuario }).errores.usuario)
      .toBe(MENSAJES.usuario);
  });

  test("el usuario se compara en minúsculas, como lo guarda el servidor", () => {
    expect(validarRegistro({ ...VALIDOS, usuario: "Ana.Perez" }).ok).toBe(true);
  });

  test("un correo sin arroba pide un correo válido", () => {
    expect(validarRegistro({ ...VALIDOS, correo: "ana.correo.com" }).errores.correo)
      .toBe(MENSAJES.correo);
  });

  test("una clave de siete caracteres pide ocho", () => {
    expect(validarRegistro({ ...VALIDOS, clave: "1234567" }).errores.clave)
      .toBe(MENSAJES.clave);
    expect(validarRegistro({ ...VALIDOS, clave: "12345678" }).errores.clave)
      .toBeUndefined();
  });

  test("sin la casilla de edad, lo dice con las palabras del servidor", () => {
    expect(validarRegistro({ ...VALIDOS, mayorDeEdad: false }).errores.mayorDeEdad)
      .toBe(MENSAJES.edad);
  });

  test("el resumen de arriba muestra el primer campo que falla, no el último", () => {
    const r = validarRegistro({ ...VALIDOS, nombre: "", clave: "corta" });
    expect(r.primero).toBe(MENSAJES.nombre);
  });
});

describe("el cuerpo que viaja al servidor", () => {
  test("manda el usuario en minúsculas y sin espacios", () => {
    expect(cuerpoDeRegistro({ ...VALIDOS, usuario: "  Ana.Perez  " }).username)
      .toBe("ana.perez");
  });

  test("la mayoría de edad viaja como booleano, no como texto", () => {
    expect(cuerpoDeRegistro(VALIDOS).mayor_de_edad).toBe(true);
  });

  test("sin código de referido, la clave no viaja", () => {
    expect("referido" in cuerpoDeRegistro(VALIDOS)).toBe(false);
  });

  test("con código de referido, viaja en mayúsculas", () => {
    expect(cuerpoDeRegistro({ ...VALIDOS, referido: " agencia-7 " }).referido)
      .toBe("AGENCIA-7");
  });

  test("el referido se recorta a lo que el servidor guarda", () => {
    expect(normalizarReferido("x".repeat(60))).toHaveLength(40);
  });

  test("la clave viaja tal cual, con espacios incluidos", () => {
    expect(cuerpoDeRegistro({ ...VALIDOS, clave: " con espacios " }).password)
      .toBe(" con espacios ");
  });
});

describe("el alta contra el servidor", () => {
  const RESPUESTA = {
    token: "tok-123",
    user: { id: 7, username: "ana.perez", nombre: "Ana Pérez", saldo: 0 },
    verificacion: {
      telefono_verificado: false, requiere_verificacion: true,
      puede_retirar: false, puede_depositar: true, puede_jugar: true,
      motivo: "Para retirar necesitás verificar tu teléfono.",
    },
  };

  test("no sale a la red si el formulario no está bien", async () => {
    const pedir = jest.fn();
    const r = await registrarCliente({
      campos: { ...VALIDOS, clave: "corta" }, api: "http://x", fetchImpl: pedir,
    });
    expect(pedir).not.toHaveBeenCalled();
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe(MENSAJES.clave);
  });

  test("con datos buenos pega en el endpoint del registro", async () => {
    const pedir = jest.fn(async () => respuestaFalsa(true, 200, RESPUESTA));
    await registrarCliente({ campos: VALIDOS, api: "http://x", fetchImpl: pedir });
    const [url, opciones] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/cliente/registro");
    expect(opciones.method).toBe("POST");
    expect(JSON.parse(opciones.body).username).toBe("ana.perez");
  });

  test("devuelve la sesión entera, con la verificación que manda el servidor", async () => {
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, RESPUESTA),
    });
    expect(r.ok).toBe(true);
    expect(r.sesion).toEqual(RESPUESTA);
  });

  test.each([
    [409, "Ese usuario ya está tomado"],
    [409, "Ya hay una cuenta con ese correo"],
    [429, "Probá de nuevo en un rato"],
    [400, "Necesitamos un correo válido para que puedas recuperar tu cuenta"],
  ])("el %s del servidor se muestra tal cual lo escribió", async (status, detail) => {
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, status, { detail }),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe(detail);
  });

  test("un detail con forma de diccionario también se lee", async () => {
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 400, {
        detail: { reason: "invalido", message: "Revisá los datos" },
      }),
    });
    expect(r.mensaje).toBe("Revisá los datos");
  });

  test("un rechazo sin texto no muestra «[object Object]» ni un código", async () => {
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(false, 500, {}),
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).not.toMatch(/object|500/);
    expect(r.mensaje.length).toBeGreaterThan(0);
  });

  test("sin red lo dice con las palabras que ya usa el ingreso", async () => {
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => { throw new TypeError("Failed to fetch"); },
    });
    expect(r.ok).toBe(false);
    expect(r.mensaje).toBe("Sin conexión con el servidor");
  });
});

describe("la sesión queda guardada al registrarse", () => {
  const RESPUESTA = {
    token: "tok-123",
    user: { id: 7, username: "ana.perez" },
    verificacion: { telefono_verificado: false, requiere_verificacion: true,
      puede_retirar: false, motivo: "Para retirar verificá tu teléfono." },
  };

  test("registrarse y guardar deja la sesión donde el sitio la busca al recargar", async () => {
    const almacen = almacenFalso();
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, RESPUESTA),
    });
    guardarSesion(r.sesion, almacen);

    expect(JSON.parse(almacen.datos[CLAVE_SESION])).toEqual(RESPUESTA);
    expect(leerSesion(almacen)).toEqual(RESPUESTA);
  });

  test("la verificación sobrevive al guardado: la marca no se pierde al recargar", async () => {
    const almacen = almacenFalso();
    const r = await registrarCliente({
      campos: VALIDOS, api: "http://x",
      fetchImpl: async () => respuestaFalsa(true, 200, RESPUESTA),
    });
    guardarSesion(r.sesion, almacen);

    expect(leerSesion(almacen).verificacion.puede_retirar).toBe(false);
  });

  test("cerrar sesión borra lo guardado", () => {
    const almacen = almacenFalso({ [CLAVE_SESION]: "{}" });
    guardarSesion(null, almacen);
    expect(almacen.getItem(CLAVE_SESION)).toBe(null);
  });

  test("un almacenamiento que tira error no rompe el alta", () => {
    const roto = {
      getItem: () => { throw new Error("bloqueado"); },
      setItem: () => { throw new Error("bloqueado"); },
      removeItem: () => { throw new Error("bloqueado"); },
    };
    expect(leerSesion(roto)).toBe(null);
    expect(guardarSesion({ token: "x" }, roto)).toBe(false);
  });

  test("una sesión guardada ilegible se lee como sin sesión", () => {
    expect(leerSesion(almacenFalso({ [CLAVE_SESION]: "{roto" }))).toBe(null);
  });
});

describe("la marca de teléfono sale del servidor, no del navegador", () => {
  test("sin bloque de verificación no hay marca", () => {
    expect(marcaTelefono(undefined)).toBe(null);
    expect(marcaTelefono(null)).toBe(null);
  });

  test("al jugador de agencia, que no requiere verificación, no se le marca nada", () => {
    expect(marcaTelefono({ requiere_verificacion: false, telefono_verificado: false }))
      .toBe(null);
  });

  test("el jugador del sitio sin verificar queda marcado, con el motivo del servidor", () => {
    const marca = marcaTelefono({
      requiere_verificacion: true, telefono_verificado: false,
      motivo: "Para retirar necesitás verificar tu teléfono.",
    });
    expect(marca.verificado).toBe(false);
    expect(marca.etiqueta).toBe("Teléfono sin verificar");
    expect(marca.detalle).toBe("Para retirar necesitás verificar tu teléfono.");
  });

  test("el jugador verificado queda marcado como verificado", () => {
    const marca = marcaTelefono({
      requiere_verificacion: true, telefono_verificado: true, motivo: "",
    });
    expect(marca.verificado).toBe(true);
    expect(marca.etiqueta).toBe("Teléfono verificado");
  });
});

describe("el aviso al entrar", () => {
  test("no aparece sin bloque de verificación", () => {
    expect(avisoVerificacion(undefined).mostrar).toBe(false);
  });

  test("no aparece si el servidor dice que puede retirar", () => {
    expect(avisoVerificacion({ puede_retirar: true, motivo: "" }).mostrar).toBe(false);
  });

  test("aparece con la línea que escribió el servidor", () => {
    const aviso = avisoVerificacion({
      puede_retirar: false,
      motivo: "Para retirar necesitás verificar tu teléfono. "
        + "Podés seguir depositando y jugando mientras tanto.",
    });
    expect(aviso.mostrar).toBe(true);
    expect(aviso.linea).toContain("depositando y jugando");
  });

  test("si el servidor no manda motivo, la línea igual dice qué puede y qué no", () => {
    const aviso = avisoVerificacion({ puede_retirar: false });
    expect(aviso.mostrar).toBe(true);
    expect(aviso.linea).toMatch(/retirar/i);
    expect(aviso.linea).toMatch(/depositando|jugando/i);
  });

  test("cerrado se recuerda para esta pestaña", () => {
    const almacen = almacenFalso();
    expect(avisoCerrado(almacen)).toBe(false);
    cerrarAviso(almacen);
    expect(avisoCerrado(almacen)).toBe(true);
    expect(almacen.datos[CLAVE_AVISO]).toBe("1");
  });

  test("una pestaña nueva lo vuelve a mostrar", () => {
    cerrarAviso(almacenFalso());
    expect(avisoCerrado(almacenFalso())).toBe(false);
  });
});

describe("no se ofrece verificar lo que hoy no se puede verificar", () => {
  test("con la lista de canales vacía, no hay acción", () => {
    expect(ofreceVerificar([], true)).toBe(false);
  });

  test("sin haber pedido los canales todavía, no hay acción", () => {
    expect(ofreceVerificar(null, true)).toBe(false);
  });

  test("con canales pero sin flujo adónde llevar a la persona, tampoco", () => {
    expect(ofreceVerificar(["sms"], false)).toBe(false);
  });

  test("con canal y con flujo, recién ahí se ofrece", () => {
    expect(ofreceVerificar(["sms"], true)).toBe(true);
  });
});
