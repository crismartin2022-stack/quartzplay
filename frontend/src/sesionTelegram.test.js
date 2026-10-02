// El canje de la firma de Telegram por una sesión de cliente, probado sin
// navegador. Dos cosas se fijan acá antes que ninguna otra: que el token se
// usa igual que en el sitio (`Authorization: Bearer`), y que cuando el canje
// falla la app no se queda callada.
//
// Ese segundo punto cambió de sentido en este cambio. Antes "falla el canje"
// significaba "la app anda como ayer", porque ningún endpoint pedía la llave.
// Ahora los nueve la piden, así que un canje fallido deja al jugador sin su
// cuenta: lo que se prueba abajo es el reintento —uno, no infinito— y el
// mensaje que le dice qué hacer cuando tampoco eso alcanza.
import {
  RUTA_CANJE, MENSAJE_SESION_CAIDA,
  canjearSesionTelegram, abrirSesionTelegram, fetchConSesion,
  cabeceraDeSesion, tokenDeSesion, recordarToken, olvidarToken,
  alPerderLaSesion, olvidarOyentesDeSesion,
  recordarContextoDeSesion, olvidarContextoDeSesion,
} from "./sesionTelegram";

const API = "https://api.ejemplo.test";
const INIT_DATA = "auth_date=1700000000&user=%7B%22id%22%3A999111%7D&hash=abc";

function respuestaFalsa(ok, status, cuerpo) {
  return { ok, status, json: async () => cuerpo };
}

// Un fetch de mentira que anota con qué lo llamaron.
function fetchFalso(respuesta) {
  const llamadas = [];
  const impl = async (url, opciones) => {
    llamadas.push({ url, opciones });
    if (respuesta instanceof Error) throw respuesta;
    return respuesta;
  };
  impl.llamadas = llamadas;
  return impl;
}

beforeEach(() => {
  olvidarToken();
  olvidarContextoDeSesion();
  olvidarOyentesDeSesion();
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
});

describe("el canje", () => {
  test("manda el initData al endpoint del canje y se queda con el token", async () => {
    const pedir = fetchFalso(respuestaFalsa(true, 200,
      { registrado: true, token: "llave-123" }));

    const r = await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(r).toEqual({ ok: true, token: "llave-123", registrado: true, motivo: null });
    expect(pedir.llamadas).toHaveLength(1);
    expect(pedir.llamadas[0].url).toBe(`${API}${RUTA_CANJE}`);
    expect(pedir.llamadas[0].opciones.method).toBe("POST");
    expect(JSON.parse(pedir.llamadas[0].opciones.body))
      .toEqual({ init_data: INIT_DATA });
    expect(tokenDeSesion()).toBe("llave-123");
  });

  test("el encabezado que sale después es el mismo que usa el sitio", async () => {
    const pedir = fetchFalso(respuestaFalsa(true, 200, { token: "llave-123" }));

    await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(cabeceraDeSesion()).toEqual({ Authorization: "Bearer llave-123" });
  });

  test("sin initData no se le pregunta nada al servidor", async () => {
    // La app abierta fuera de Telegram: no hay firma que canjear y tampoco
    // hay por qué gastar un pedido.
    const pedir = fetchFalso(respuestaFalsa(true, 200, { token: "llave-123" }));

    const r = await abrirSesionTelegram({ api: API, initData: "", fetchImpl: pedir });

    expect(r.token).toBe(null);
    expect(pedir.llamadas).toHaveLength(0);
  });
});

describe("el token no se guarda donde dure más que la app", () => {
  // El initData ya es legible en la página; una copia en el almacenamiento
  // sobrevive al cierre, la lee cualquier script del mismo origen y no caduca
  // con el arranque. Esta prueba es la que avisa si alguien la agrega.
  test("ni en localStorage ni en sessionStorage queda nada", async () => {
    const pedir = fetchFalso(respuestaFalsa(true, 200, { token: "llave-123" }));

    await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(localStorage.length).toBe(0);
    expect(sessionStorage.length).toBe(0);
  });

  test("al volver a arrancar hay que canjear de nuevo, y alcanza con eso", async () => {
    const pedir = fetchFalso(respuestaFalsa(true, 200, { token: "llave-nueva" }));
    recordarToken("llave-vieja");

    olvidarToken();                    // lo que pasa al cerrar la app
    expect(cabeceraDeSesion()).toEqual({});

    await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });
    expect(cabeceraDeSesion()).toEqual({ Authorization: "Bearer llave-nueva" });
  });
});

describe("si el canje falla, la app sigue andando", () => {
  // Cada caso termina igual: sin token, sin excepción y con el encabezado
  // vacío, así que los pedidos salen tal como salían antes de este cambio.
  test.each([
    ["la firma no cierra o venció", respuestaFalsa(false, 401, { detail: "Identidad de Telegram inválida o vencida" })],
    ["la cuenta está bloqueada", respuestaFalsa(false, 403, { detail: "Tu cuenta está bloqueada. Consultá en tu agencia." })],
    ["el servidor se cayó", respuestaFalsa(false, 500, {})],
    ["el cuerpo no es JSON", { ok: true, status: 200, json: async () => { throw new Error("roto"); } }],
    ["el token viene vacío", respuestaFalsa(true, 200, { token: "" })],
    ["el token no es un texto", respuestaFalsa(true, 200, { token: { a: 1 } })],
  ])("%s: queda sin token y no lanza", async (_caso, respuesta) => {
    const pedir = fetchFalso(respuesta);

    const r = await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(r.ok).toBe(false);
    expect(r.token).toBe(null);
    expect(tokenDeSesion()).toBe(null);
    expect(cabeceraDeSesion()).toEqual({});
  });

  test("sin conexión tampoco lanza", async () => {
    const pedir = fetchFalso(new Error("Failed to fetch"));

    const r = await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(r.token).toBe(null);
    expect(cabeceraDeSesion()).toEqual({});
  });

  test("sin fetch disponible devuelve la misma forma", async () => {
    // Hay que sacar el `fetch` global a mano: jsdom trae uno, así que con
    // `fetchImpl: null` el módulo cae a ése y nunca entra a esta rama. Esta
    // prueba venía pasando por eso —los dos caminos devolvían el mismo objeto
    // y la diferencia no se veía—; ahora que cada motivo es distinto, quedó a
    // la vista que probaba otra cosa.
    const original = global.fetch;
    global.fetch = undefined;
    try {
      const r = await canjearSesionTelegram({
        api: API, initData: INIT_DATA, fetchImpl: null });
      expect(r).toEqual({ ok: false, token: null, registrado: false,
        motivo: "sin-firma" });
    } finally {
      global.fetch = original;
    }
  });

  test("un canje fallido borra la llave anterior en vez de dejarla colgada", async () => {
    recordarToken("llave-vieja");
    const pedir = fetchFalso(respuestaFalsa(false, 401, {}));

    await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(tokenDeSesion()).toBe(null);
  });
});

describe("el usuario de Telegram que todavía no tiene cuenta", () => {
  test("no recibe token y la app muestra su propio registro, como hoy", async () => {
    // El servidor contesta 200 con `registrado: false` y sin token: no hay
    // alta implícita, y la pantalla de registro sigue siendo la de siempre,
    // que decide con lo que contesta /api/me.
    const pedir = fetchFalso(respuestaFalsa(true, 200,
      { registrado: false, token: null }));

    const r = await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(r).toEqual({ ok: false, token: null, registrado: false,
      motivo: "sin-cuenta" });
    expect(cabeceraDeSesion()).toEqual({});
  });
});

// ═══════════════════════════════════════════════════════════════
// EL REINTENTO
//
// La parte del cambio que puede dejar gente afuera si está mal. Cubre dos
// jugadores reales: el que tenía la app abierta y se le venció el token —dura
// doce horas— y el que cargó el bundle viejo justo antes del despliegue y
// todavía no canjeó nada. Los dos reciben un 401 del servidor, y con un solo
// canje más vuelven a ver su cuenta.
//
// Un servidor de mentira que lleva la cuenta de qué llave le mostraron: así
// las pruebas distinguen "repitió el pedido" de "repitió el pedido con la
// llave nueva", que es lo único que sirve.
// ═══════════════════════════════════════════════════════════════

const URL_PEDIDO = `${API}/api/historial/501`;

function servidorFalso({ llaveQueAcepta, tokensQueEmite = [],
  canjeRompe = false, aceptaLoQueEmite = true }) {
  const s = {
    pedidos: [],      // {url, token}
    canjes: 0,
    llaveQueAcepta,
  };
  s.impl = async (url, opciones = {}) => {
    const token = ((opciones.headers || {}).Authorization || "")
      .replace("Bearer ", "") || null;

    if (url.endsWith(RUTA_CANJE)) {
      s.canjes += 1;
      if (canjeRompe) return respuestaFalsa(false, 503, { detail: "no se pudo" });
      const nueva = tokensQueEmite.shift() || null;
      // `aceptaLoQueEmite: false` es el servidor que emite una llave y después
      // no la reconoce: raro, pero es el caso en el que el reintento no puede
      // salvar nada y hay que avisarle a la persona.
      if (aceptaLoQueEmite) s.llaveQueAcepta = nueva;
      return respuestaFalsa(true, 200, { registrado: true, token: nueva });
    }

    s.pedidos.push({ url, token });
    if (!token || token !== s.llaveQueAcepta) {
      return respuestaFalsa(false, 401, { detail: "Sesión vencida. Volvé a entrar." });
    }
    return respuestaFalsa(true, 200, { movimientos: [] });
  };
  return s;
}

describe("un 401 dispara un canje y repite el pedido", () => {
  test("el token venció con la app abierta: vuelve a ver su cuenta", async () => {
    const s = servidorFalso({ llaveQueAcepta: "llave-nueva",
      tokensQueEmite: ["llave-nueva"] });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-vencida");

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(200);
    expect(s.canjes).toBe(1);
    expect(s.pedidos.map((p) => p.token))
      .toEqual(["llave-vencida", "llave-nueva"]);
  });

  test("el bundle viejo todavía no tenía token: el 401 se lo consigue", async () => {
    const s = servidorFalso({ llaveQueAcepta: "llave-nueva",
      tokensQueEmite: ["llave-nueva"] });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(200);
    expect(s.pedidos.map((p) => p.token)).toEqual([null, "llave-nueva"]);
    expect(tokenDeSesion()).toBe("llave-nueva");
  });

  test("el pedido que anda no gasta ningún canje", async () => {
    const s = servidorFalso({ llaveQueAcepta: "llave-buena" });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-buena");

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(200);
    expect(s.canjes).toBe(0);
    expect(s.pedidos).toHaveLength(1);
  });

  test("un 403 no se reintenta: pidió la cuenta de otro, no es la sesión", async () => {
    // El 403 del servidor dice "esa cuenta no es la tuya". Canjear de nuevo no
    // cambiaría nada y escondería un bug de la pantalla que armó la URL.
    const pedir = fetchFalso(respuestaFalsa(false, 403, { detail: "Esa cuenta no es la tuya" }));
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: pedir });
    recordarToken("llave-buena");

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(403);
    expect(pedir.llamadas).toHaveLength(1);
  });
});

describe("dos 401 seguidos avisan y no reintentan más", () => {
  test("el segundo 401 muestra el mensaje y corta", async () => {
    // El canje funciona y emite una llave que el servidor igual no reconoce:
    // lo que esté roto no se arregla repitiendo.
    const s = servidorFalso({ llaveQueAcepta: "la-que-nunca-emite",
      tokensQueEmite: ["llave-que-no-sirve"], aceptaLoQueEmite: false });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-vencida");

    const avisos = [];
    alPerderLaSesion((m) => avisos.push(m));

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(401);
    expect(s.canjes).toBe(1);               // uno, no dos ni infinitos
    expect(s.pedidos).toHaveLength(2);      // el original y el reintento
    expect(avisos).toEqual([MENSAJE_SESION_CAIDA]);
  });

  test("si el canje del reintento falla, avisa sin gastar un segundo pedido", async () => {
    // El 503 honesto que ahora propaga `sesion_guardar`. Antes la app lo
    // descartaba en silencio y el jugador se quedaba sin token y sin
    // explicación: esa es exactamente la pantalla que esto evita.
    const s = servidorFalso({ llaveQueAcepta: "llave-nueva", canjeRompe: true });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-vencida");

    const avisos = [];
    alPerderLaSesion((m) => avisos.push(m));

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(401);
    expect(s.canjes).toBe(1);
    expect(s.pedidos).toHaveLength(1);
    expect(avisos).toEqual([MENSAJE_SESION_CAIDA]);
  });

  test("el mensaje dice qué hacer, no solo que algo falló", () => {
    // Una pantalla vacía o un spinner eterno la dejan esperando algo que no
    // va a llegar. Cerrar y volver a abrir la mini-app le da un initData
    // nuevo, que es justo lo que falta.
    expect(MENSAJE_SESION_CAIDA).toMatch(/sesión/i);
    expect(MENSAJE_SESION_CAIDA).toMatch(/Cerrá y volvé a abrir/);
  });

  test("se puede dejar de escuchar", () => {
    const avisos = [];
    const dejar = alPerderLaSesion((m) => avisos.push(m));
    dejar();
    // Sin oyentes nadie se entera, pero tampoco explota nada.
    expect(avisos).toEqual([]);
  });
});

describe("lo que no amerita un cartel", () => {
  test("fuera de Telegram no se avisa nada: no hay sesión que recuperar", async () => {
    // Sin initData el canje no puede ni salir. Decirle "cerrá y volvé a abrir
    // la app" a quien abrió el sitio en un navegador sería mentirle.
    const s = servidorFalso({ llaveQueAcepta: "nunca" });
    recordarContextoDeSesion({ api: API, initData: "", fetchImpl: s.impl });

    const avisos = [];
    alPerderLaSesion((m) => avisos.push(m));

    const r = await fetchConSesion(URL_PEDIDO);

    expect(r.status).toBe(401);
    expect(avisos).toEqual([]);
  });

  test("el usuario de Telegram sin cuenta tampoco recibe el cartel", async () => {
    const pedirCanje = async (url) => {
      if (url.endsWith(RUTA_CANJE)) {
        return respuestaFalsa(true, 200, { registrado: false, token: null });
      }
      return respuestaFalsa(false, 401, {});
    };
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: pedirCanje });

    const avisos = [];
    alPerderLaSesion((m) => avisos.push(m));

    await fetchConSesion(URL_PEDIDO);

    expect(avisos).toEqual([]);
  });

  test("`avisar:false` reintenta igual pero no pone el cartel", async () => {
    // El latido del Súper Bono cada dos minutos: la persona no lo pidió y no
    // está mirando nada. Reintentar sí; interrumpirla, no.
    const s = servidorFalso({ llaveQueAcepta: "la-que-nunca-emite",
      tokensQueEmite: ["llave-que-no-sirve"], aceptaLoQueEmite: false });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-vencida");

    const avisos = [];
    alPerderLaSesion((m) => avisos.push(m));

    await fetchConSesion(URL_PEDIDO, {}, { avisar: false });

    expect(s.canjes).toBe(1);
    expect(s.pedidos).toHaveLength(2);
    expect(avisos).toEqual([]);
  });
});

describe("varios pedidos juntos comparten un solo canje", () => {
  test("dos pantallas que salen a la vez no piden dos llaves", async () => {
    // `HistorialJuegos` dispara historial e historial-juegos en el mismo
    // efecto. Si cada 401 pidiera su propio canje, el segundo invalidaría el
    // token que acababa de guardar el primero y se irían turnando para
    // dejarse afuera.
    const s = servidorFalso({ llaveQueAcepta: "llave-nueva",
      tokensQueEmite: ["llave-nueva", "otra-llave"] });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-vencida");

    const [a, b] = await Promise.all([
      fetchConSesion(`${API}/api/historial/501`),
      fetchConSesion(`${API}/api/historial-juegos/501`),
    ]);

    expect(a.status).toBe(200);
    expect(b.status).toBe(200);
    expect(s.canjes).toBe(1);
  });
});

describe("el encabezado que manda `fetchConSesion`", () => {
  test("no pisa los encabezados que ya traía el pedido", async () => {
    const s = servidorFalso({ llaveQueAcepta: "llave-buena" });
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: s.impl });
    recordarToken("llave-buena");

    const vistos = [];
    const espia = async (url, opciones) => {
      vistos.push(opciones.headers);
      return s.impl(url, opciones);
    };
    recordarContextoDeSesion({ api: API, initData: INIT_DATA, fetchImpl: espia });

    await fetchConSesion(URL_PEDIDO, { headers: { "X-Propio": "1" } });

    expect(vistos[0]).toEqual({
      "X-Propio": "1", Authorization: "Bearer llave-buena",
    });
  });
});
