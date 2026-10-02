// La credencial de la terminal del mostrador, probada sin navegador.
//
// Lo que se fija acá, en orden de importancia:
//
//   · el token SOBREVIVE AL REINICIO. Es la razón de que viva en
//     `localStorage` y no en memoria como el de la mini-app de Telegram: una
//     pantalla de mostrador se reinicia y tiene que seguir siendo ella misma
//     sin que nadie vuelva a cargar nada.
//   · se usa como todos los demás: `Authorization: Bearer`.
//   · cada agencia tiene su propia llave, así que la de una no contesta por la
//     otra en el mismo navegador.
//   · un 401/403 BORRA la credencial y la pantalla vuelve a pedir el alta; una
//     caída de red NO la borra, porque no es lo mismo.
//   · nada de esto lanza: un throw tiraría la pantalla del local.
import {
  RUTA_CANJE, RUTA_ME, claveDe,
  canjearCodigo, identificarse,
  leerToken, guardarToken, olvidarToken, cabeceraDeTerminal,
} from "./credencialTerminal";

const API = "https://api.ejemplo.test";
const AGENCIA = "AGE002";
const OTRA = "AGE009";

function respuestaFalsa(ok, status, cuerpo) {
  return { ok, status, json: async () => cuerpo };
}

// Un fetch de mentira que anota con qué lo llamaron.
function fetchFalso(...respuestas) {
  const llamadas = [];
  let i = 0;
  const impl = async (url, opciones) => {
    llamadas.push({ url, opciones });
    const r = respuestas[Math.min(i++, respuestas.length - 1)];
    if (r instanceof Error) throw r;
    return r;
  };
  impl.llamadas = llamadas;
  return impl;
}

beforeEach(() => {
  try { localStorage.clear(); } catch (e) {}
  global.fetch = fetchFalso(respuestaFalsa(true, 200, {}));
});

afterEach(() => {
  delete global.fetch;
});


// ══════════════════════════════════════════════════════════════════
// DÓNDE VIVE EL TOKEN
// ══════════════════════════════════════════════════════════════════

describe("dónde vive el token, y por qué", () => {
  test("sobrevive a un reinicio de la pantalla", () => {
    // LA PRUEBA QUE JUSTIFICA LA DECISIÓN. La mini-app de Telegram guarda su
    // token en memoria del módulo porque recibe identidad nueva en cada
    // apertura. Una terminal de mostrador no recibe nada al arrancar: si el
    // token no sobreviviera, cada corte de luz dejaría la pantalla sin
    // credencial hasta que un humano fuera con un código nuevo — y en la
    // práctica, con el código anotado en un papel pegado al costado.
    guardarToken(AGENCIA, "llave-de-la-terminal");

    // Un reinicio es, para este módulo, volver a leer sin nada en memoria.
    expect(leerToken(AGENCIA)).toBe("llave-de-la-terminal");
    expect(localStorage.getItem(claveDe(AGENCIA))).toBe("llave-de-la-terminal");
  });

  test("el encabezado es el mismo que usa todo el resto", () => {
    guardarToken(AGENCIA, "llave-123");

    expect(cabeceraDeTerminal(AGENCIA))
      .toEqual({ Authorization: "Bearer llave-123" });
  });

  test("sin credencial no manda un encabezado roto", () => {
    // Un objeto vacío y no `Authorization: Bearer null`: así el pedido sale
    // igual que antes de este cambio y el 401 que vuelve es el de "no tengo
    // credencial", no el de "mandé basura".
    expect(cabeceraDeTerminal(AGENCIA)).toEqual({});
  });

  test("cada agencia tiene su propia llave", () => {
    // Un mismo navegador puede abrir el Box de dos agencias: un soporte
    // técnico probando, un local que cambió de code. La credencial de una no
    // puede contestar por la otra.
    guardarToken(AGENCIA, "llave-de-una");
    guardarToken(OTRA, "llave-de-la-otra");

    expect(leerToken(AGENCIA)).toBe("llave-de-una");
    expect(leerToken(OTRA)).toBe("llave-de-la-otra");
    expect(claveDe(AGENCIA)).not.toBe(claveDe(OTRA));
  });

  test("olvidar la de una no toca la de la otra", () => {
    guardarToken(AGENCIA, "llave-de-una");
    guardarToken(OTRA, "llave-de-la-otra");

    olvidarToken(AGENCIA);

    expect(leerToken(AGENCIA)).toBeNull();
    expect(leerToken(OTRA)).toBe("llave-de-la-otra");
  });

  test("la clave no distingue mayúsculas de la dirección", () => {
    // La dirección la tipea una persona: /box/age002 y /box/AGE002 son la
    // misma pantalla, y no puede quedar con dos credenciales distintas.
    guardarToken("age002", "llave-123");

    expect(leerToken("AGE002")).toBe("llave-123");
  });

  test("un almacenamiento que lanza no tira la pantalla", () => {
    // En incógnito, con las cookies bloqueadas o con el disco lleno
    // `localStorage` LANZA en vez de devolver null. Una terminal que explota al
    // arrancar es peor que una sin credencial, que al menos sabe pedir el
    // código.
    const original = window.localStorage;
    Object.defineProperty(window, "localStorage", {
      configurable: true,
      get() { throw new Error("almacenamiento bloqueado"); },
    });

    try {
      expect(() => leerToken(AGENCIA)).not.toThrow();
      expect(leerToken(AGENCIA)).toBeNull();
      expect(() => guardarToken(AGENCIA, "x")).not.toThrow();
      expect(() => olvidarToken(AGENCIA)).not.toThrow();
      expect(() => cabeceraDeTerminal(AGENCIA)).not.toThrow();
    } finally {
      Object.defineProperty(window, "localStorage", {
        configurable: true, value: original,
      });
    }
  });

  test("guardar un token vacío no deja basura", () => {
    expect(guardarToken(AGENCIA, "")).toBeNull();
    expect(leerToken(AGENCIA)).toBeNull();
  });
});


// ══════════════════════════════════════════════════════════════════
// EL CANJE DEL CÓDIGO DE ALTA
// ══════════════════════════════════════════════════════════════════

describe("el canje del código de alta", () => {
  test("manda el código al endpoint del canje y se queda con el token", async () => {
    global.fetch = fetchFalso(respuestaFalsa(true, 200, {
      ok: true, token: "llave-nueva",
      terminal: { codigo: "AGE0A1B2", nombre: "Mostrador",
                  agencia_code: AGENCIA },
    }));

    const r = await canjearCodigo(API, AGENCIA, "TA-abc123");

    expect(r.ok).toBe(true);
    expect(r.terminal.codigo).toBe("AGE0A1B2");
    expect(global.fetch.llamadas).toHaveLength(1);
    expect(global.fetch.llamadas[0].url).toBe(`${API}${RUTA_CANJE}`);
    expect(global.fetch.llamadas[0].opciones.method).toBe("POST");
    expect(JSON.parse(global.fetch.llamadas[0].opciones.body))
      .toEqual({ codigo: "TA-abc123" });
    expect(leerToken(AGENCIA)).toBe("llave-nueva");
  });

  test("le saca los espacios al código antes de mandarlo", async () => {
    // Se tipea a mano, o se pega desde el panel con un espacio al final.
    global.fetch = fetchFalso(respuestaFalsa(true, 200, { token: "llave" }));

    await canjearCodigo(API, AGENCIA, "  TA-abc123 ");

    expect(JSON.parse(global.fetch.llamadas[0].opciones.body))
      .toEqual({ codigo: "TA-abc123" });
  });

  test("sin código no se le pregunta nada al servidor", async () => {
    const r = await canjearCodigo(API, AGENCIA, "   ");

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-codigo");
    expect(global.fetch.llamadas).toHaveLength(0);
  });

  test("un código rechazado muestra el motivo que dio el servidor", async () => {
    // "Ese código ya se usó", "El código venció", "Esa terminal está apagada":
    // los tres los explica el servidor en castellano y los tres se resuelven
    // igual. Mostrarlos tal cual es mejor que traducirlos a "error".
    global.fetch = fetchFalso(respuestaFalsa(false, 410,
      { detail: "Ese código ya se usó. Pedile a la agencia uno nuevo." }));

    const r = await canjearCodigo(API, AGENCIA, "TA-usada");

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("rechazado");
    expect(r.mensaje).toContain("ya se usó");
  });

  test("un código rechazado no guarda ninguna credencial", async () => {
    global.fetch = fetchFalso(respuestaFalsa(false, 410, { detail: "venció" }));

    await canjearCodigo(API, AGENCIA, "TA-vencida");

    expect(leerToken(AGENCIA)).toBeNull();
  });

  test("un rechazo no borra la credencial que ya andaba", async () => {
    // Alguien tipea un código viejo en una pantalla que ya estaba dada de
    // alta. Sería absurdo que eso la desaloje.
    guardarToken(AGENCIA, "llave-que-sirve");
    global.fetch = fetchFalso(respuestaFalsa(false, 410, { detail: "venció" }));

    await canjearCodigo(API, AGENCIA, "TA-vencida");

    expect(leerToken(AGENCIA)).toBe("llave-que-sirve");
  });

  test("sin red lo dice y no inventa una credencial", async () => {
    global.fetch = fetchFalso(new Error("sin conexión"));

    const r = await canjearCodigo(API, AGENCIA, "TA-abc123");

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-red");
    expect(leerToken(AGENCIA)).toBeNull();
  });

  test("un 200 sin token no deja la pantalla creyendo que tiene llave", async () => {
    // No debería pasar. Si pasa, guardar un `undefined` dejaría la pantalla
    // mandando `Bearer undefined` y culpando al servidor.
    global.fetch = fetchFalso(respuestaFalsa(true, 200, { ok: true }));

    const r = await canjearCodigo(API, AGENCIA, "TA-abc123");

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-token");
    expect(leerToken(AGENCIA)).toBeNull();
  });

  test("el canje no lanza nunca", async () => {
    global.fetch = fetchFalso(new Error("explotó"));

    await expect(canjearCodigo(API, AGENCIA, "TA-abc123")).resolves.toBeDefined();
  });

  test("el canje no manda ninguna credencial vieja", async () => {
    // Es el único pedido que la pantalla hace ANTES de tener credencial, y lo
    // que lo sostiene es el código. Mandar un token viejo ahí no agrega nada y
    // confundiría de qué depende el canje.
    guardarToken(AGENCIA, "llave-vieja");
    global.fetch = fetchFalso(respuestaFalsa(true, 200, { token: "llave-nueva" }));

    await canjearCodigo(API, AGENCIA, "TA-abc123");

    const headers = global.fetch.llamadas[0].opciones.headers;
    expect(headers.Authorization).toBeUndefined();
  });
});


// ══════════════════════════════════════════════════════════════════
// QUIÉN SOY: LA CREDENCIAL QUE TODAVÍA SIRVE
// ══════════════════════════════════════════════════════════════════

describe("identificarse al arrancar", () => {
  test("sin credencial guardada no se le pregunta nada al servidor", async () => {
    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-credencial");
    expect(global.fetch.llamadas).toHaveLength(0);
  });

  test("con credencial válida devuelve quién es la terminal", async () => {
    guardarToken(AGENCIA, "llave-123");
    global.fetch = fetchFalso(respuestaFalsa(true, 200, {
      codigo: "AGE0A1B2", nombre: "Mostrador", agencia_code: AGENCIA,
      agencia: "Agencia del Centro", puede_cashout: true,
    }));

    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(true);
    expect(r.terminal.codigo).toBe("AGE0A1B2");
    expect(r.terminal.puede_cashout).toBe(true);
    expect(global.fetch.llamadas[0].url).toBe(`${API}${RUTA_ME}`);
    expect(global.fetch.llamadas[0].opciones.headers)
      .toEqual({ Authorization: "Bearer llave-123" });
  });

  test("la identidad la dice el servidor, no la dirección", async () => {
    // El Box se abre en /box/AGE002, pero el `agencia_code` que vale es el que
    // devuelve el servidor desde la fila de la terminal. Si alguien abre la
    // pantalla con otra dirección, la credencial sigue siendo de su agencia.
    guardarToken(AGENCIA, "llave-123");
    global.fetch = fetchFalso(respuestaFalsa(true, 200, {
      codigo: "AGE0A1B2", nombre: "Mostrador", agencia_code: "LA-DE-VERDAD",
      puede_cashout: false,
    }));

    const r = await identificarse(API, AGENCIA);

    expect(r.terminal.agencia_code).toBe("LA-DE-VERDAD");
  });

  test("un 401 borra la credencial y la pantalla vuelve a pedir el alta", async () => {
    // El token venció. Dejarlo guardado haría que cada arranque repitiera el
    // mismo pedido condenado, y la pantalla no sabría distinguir "nunca me
    // dieron de alta" de "mi credencial ya no vale" — que en el mostrador es la
    // misma cosa y se resuelve igual.
    guardarToken(AGENCIA, "llave-vencida");
    global.fetch = fetchFalso(respuestaFalsa(false, 401,
      { detail: "Esta pantalla no tiene credencial." }));

    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-credencial");
    expect(leerToken(AGENCIA)).toBeNull();
  });

  test("un 403 de terminal apagada también borra la credencial", async () => {
    // La agencia la apagó. El servidor corta en el acto —mira `activa` en el
    // mismo UPDATE con el que autoriza—, así que la pantalla no tiene por qué
    // seguir presentando una llave que ya no abre.
    guardarToken(AGENCIA, "llave-de-una-apagada");
    global.fetch = fetchFalso(respuestaFalsa(false, 403,
      { detail: "Esta terminal está apagada." }));

    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-credencial");
    expect(leerToken(AGENCIA)).toBeNull();
  });

  test("una caída de red NO borra la credencial", async () => {
    // LA DIFERENCIA QUE IMPORTA. Un wifi que se corta no es una credencial
    // revocada: si se borrara acá, la terminal pediría un código nuevo cada vez
    // que el local pierde internet un rato.
    guardarToken(AGENCIA, "llave-que-sirve");
    global.fetch = fetchFalso(new Error("sin conexión"));

    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(false);
    expect(r.motivo).toBe("sin-red");
    expect(leerToken(AGENCIA)).toBe("llave-que-sirve");
  });

  test("un 500 tampoco borra la credencial", async () => {
    // Un servidor caído no dice nada sobre si la terminal sigue siendo válida.
    guardarToken(AGENCIA, "llave-que-sirve");
    global.fetch = fetchFalso(respuestaFalsa(false, 500, {}));

    const r = await identificarse(API, AGENCIA);

    expect(r.motivo).toBe("sin-red");
    expect(leerToken(AGENCIA)).toBe("llave-que-sirve");
  });

  test("una respuesta sin código no se toma por una identidad", async () => {
    guardarToken(AGENCIA, "llave-123");
    global.fetch = fetchFalso(respuestaFalsa(true, 200, {}));

    const r = await identificarse(API, AGENCIA);

    expect(r.ok).toBe(false);
    expect(r.terminal).toBeNull();
    // No se borra: un cuerpo raro no prueba que la credencial sea mala.
    expect(leerToken(AGENCIA)).toBe("llave-123");
  });

  test("identificarse no lanza nunca", async () => {
    guardarToken(AGENCIA, "llave-123");
    global.fetch = fetchFalso(new Error("explotó"));

    await expect(identificarse(API, AGENCIA)).resolves.toBeDefined();
  });
});


// ══════════════════════════════════════════════════════════════════
// EL CAMINO COMPLETO
// ══════════════════════════════════════════════════════════════════

test("darse de alta, reiniciar, y seguir siendo la misma terminal", async () => {
  // El recorrido entero, que es lo que el dueño pidió: la pantalla pide el
  // código una vez, lo canjea, y a partir de ahí manda `Bearer` — incluso
  // después de reiniciarse, sin que nadie vuelva a cargar nada.
  global.fetch = fetchFalso(respuestaFalsa(true, 200, {
    ok: true, token: "llave-de-la-terminal",
    terminal: { codigo: "AGE0A1B2", nombre: "Mostrador" },
  }));

  const alta = await canjearCodigo(API, AGENCIA, "TA-abc123");
  expect(alta.ok).toBe(true);

  // Acá se reinicia la terminal: el módulo no guarda nada en memoria, así que
  // lo único que queda es lo que haya en el almacenamiento.
  global.fetch = fetchFalso(respuestaFalsa(true, 200, {
    codigo: "AGE0A1B2", nombre: "Mostrador", agencia_code: AGENCIA,
    puede_cashout: true,
  }));

  const despues = await identificarse(API, AGENCIA);

  expect(despues.ok).toBe(true);
  expect(despues.terminal.codigo).toBe("AGE0A1B2");
  expect(global.fetch.llamadas[0].opciones.headers)
    .toEqual({ Authorization: "Bearer llave-de-la-terminal" });
});

test("si la agencia la apaga, el reinicio siguiente pide el alta de nuevo", async () => {
  guardarToken(AGENCIA, "llave-de-la-terminal");
  global.fetch = fetchFalso(respuestaFalsa(false, 403,
    { detail: "Esta terminal está apagada." }));

  const primero = await identificarse(API, AGENCIA);
  expect(primero.motivo).toBe("sin-credencial");

  // Y el arranque siguiente ya no pregunta: no tiene nada con qué preguntar.
  global.fetch = fetchFalso(respuestaFalsa(true, 200, { codigo: "X" }));
  const segundo = await identificarse(API, AGENCIA);

  expect(segundo.motivo).toBe("sin-credencial");
  expect(global.fetch.llamadas).toHaveLength(0);
});
