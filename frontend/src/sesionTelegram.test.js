// El canje de la firma de Telegram por una sesión de cliente, probado sin
// navegador. Dos cosas se fijan acá antes que ninguna otra: que el token se
// usa igual que en el sitio (`Authorization: Bearer`), y que cuando el canje
// falla —por cualquier motivo— la app queda exactamente como estaba, porque
// todavía no hay nada que dependa de la llave.
import {
  RUTA_CANJE,
  canjearSesionTelegram, abrirSesionTelegram,
  cabeceraDeSesion, tokenDeSesion, recordarToken, olvidarToken,
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
  try { localStorage.clear(); sessionStorage.clear(); } catch (e) {}
});

describe("el canje", () => {
  test("manda el initData al endpoint del canje y se queda con el token", async () => {
    const pedir = fetchFalso(respuestaFalsa(true, 200,
      { registrado: true, token: "llave-123" }));

    const r = await abrirSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: pedir });

    expect(r).toEqual({ ok: true, token: "llave-123", registrado: true });
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
    const r = await canjearSesionTelegram({ api: API, initData: INIT_DATA, fetchImpl: null });

    expect(r).toEqual({ ok: false, token: null, registrado: false });
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

    expect(r).toEqual({ ok: false, token: null, registrado: false });
    expect(cabeceraDeSesion()).toEqual({});
  });
});
