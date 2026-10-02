import React, { act, StrictMode } from "react";
import { createRoot } from "react-dom/client";

// La pantalla lee la config del entorno al importarse; acá no hay build.
jest.mock("./config", () => ({
  getFrontendConfig: () => ({ apiUrl: "https://api.test" }),
}));
jest.mock("./Icon", () => () => null);
jest.mock("./JuegoEnMarco", () => (props) => (
  <div data-testid="marco" data-url={props.url} />
));
jest.mock("./configSportsbook", () => ({
  useSportsbookC360: jest.fn(),
  AVISO_SPORTSBOOK_APAGADO: "apagado",
  AVISO_APUESTA_SIN_RESOLVER: "sin resolver",
}));

const { useSportsbookC360 } = require("./configSportsbook");
const SportsbookC360 = require("./SportsbookC360").default;

global.IS_REACT_ACT_ENVIRONMENT = true;

const CONFIG = {
  listo: true, activo: true, conHistorial: false,
  juego: { id: "sb1", titulo: "Sportsbook", integracion: "c360" },
};
const USER = { id: 7 };

let container;
let roots;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  roots = [];
  useSportsbookC360.mockReturnValue(CONFIG);
  global.fetch = jest.fn();
});

afterEach(() => {
  act(() => { roots.forEach((r) => r.unmount()); });
  document.body.removeChild(container);
});

function montar(ui, destino = container) {
  const root = createRoot(destino);
  roots.push(root);
  act(() => { root.render(ui); });
  return root;
}

// Una respuesta que el test resuelve a mano, para dejar el lanzamiento en
// vuelo mientras se monta otra vez.
function respuestaPendiente() {
  let resolver;
  const promesa = new Promise((res) => { resolver = res; });
  return {
    promesa,
    ok: (url) => resolver({ ok: true, json: async () => ({ url }) }),
  };
}

const vaciar = () => act(async () => { await Promise.resolve(); });
const boton = (texto) =>
  [...document.body.querySelectorAll("button")]
    .find((b) => b.textContent.includes(texto));
const marco = () => document.body.querySelector("[data-testid=marco]");

describe("SportsbookC360 se abre solo", () => {
  test("al montar lanza una sola vez y enmarca el juego", async () => {
    global.fetch.mockResolvedValue({
      ok: true, json: async () => ({ url: "https://estudio.test/juego" }) });
    montar(<SportsbookC360 user={USER} saldo="$ 10" onRefrescar={() => {}} />);
    await vaciar();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, init] = global.fetch.mock.calls[0];
    expect(url).toBe("https://api.test/api/casino/sesion");
    expect(JSON.parse(init.body)).toEqual({
      user_id: 7, game_id: "sb1", integracion: "c360", language: "es" });
    expect(marco().getAttribute("data-url")).toBe("https://estudio.test/juego");
  });

  test("muestra que está cargando mientras el servidor contesta", async () => {
    const p = respuestaPendiente();
    global.fetch.mockReturnValue(p.promesa);
    montar(<SportsbookC360 user={USER} />);
    expect(container.querySelector("[role=status]").textContent)
      .toMatch(/Abriendo el sportsbook/);
    expect(boton("Abrir el sportsbook")).toBeUndefined();
    p.ok("https://estudio.test/juego");
    await vaciar();
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  test("dos montajes con el primero en vuelo no lanzan dos sesiones", async () => {
    const p = respuestaPendiente();
    global.fetch.mockReturnValue(p.promesa);
    const otro = document.createElement("div");
    document.body.appendChild(otro);
    const primero = montar(<SportsbookC360 user={USER} />);
    // Se vuelve atrás y se entra de nuevo antes de que el proveedor conteste.
    act(() => { primero.unmount(); });
    montar(<SportsbookC360 user={USER} />, otro);
    expect(global.fetch).toHaveBeenCalledTimes(1);
    p.ok("https://estudio.test/juego");
    await vaciar();
    // El montaje nuevo recibe el resultado del lanzamiento compartido.
    expect(marco()).not.toBeNull();
    act(() => { roots.pop().unmount(); });
    document.body.removeChild(otro);
  });

  test("el modo estricto (monta, desmonta, monta) lanza una sola vez", async () => {
    global.fetch.mockResolvedValue({
      ok: true, json: async () => ({ url: "https://estudio.test/juego" }) });
    montar(<StrictMode><SportsbookC360 user={USER} /></StrictMode>);
    await vaciar();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("un re-render con la misma config no vuelve a lanzar", async () => {
    global.fetch.mockResolvedValue({
      ok: true, json: async () => ({ url: "https://estudio.test/juego" }) });
    const root = montar(<SportsbookC360 user={USER} />);
    await vaciar();
    // Objeto de config nuevo, mismos valores: lo que hace el hook en cada render.
    useSportsbookC360.mockReturnValue({ ...CONFIG, juego: { ...CONFIG.juego } });
    act(() => { root.render(<SportsbookC360 user={USER} saldo="$ 20" />); });
    await vaciar();
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test("si falla, muestra el error y un botón de reintento", async () => {
    global.fetch.mockResolvedValue({
      ok: false, json: async () => ({ detail: "Proveedor caído" }) });
    montar(<SportsbookC360 user={USER} />);
    await vaciar();
    expect(container.querySelector("[role=alert]").textContent)
      .toBe("Proveedor caído");
    expect(boton("Reintentar")).toBeDefined();
    expect(container.querySelector("[role=status]")).toBeNull();
  });

  test("el reintento vuelve a intentar y abre el juego", async () => {
    global.fetch
      .mockResolvedValueOnce({ ok: false, json: async () => ({ detail: "Caído" }) })
      .mockResolvedValueOnce({
        ok: true, json: async () => ({ url: "https://estudio.test/juego" }) });
    montar(<SportsbookC360 user={USER} />);
    await vaciar();
    expect(global.fetch).toHaveBeenCalledTimes(1);
    await act(async () => { boton("Reintentar").click(); });
    await vaciar();
    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(marco()).not.toBeNull();
    expect(container.querySelector("[role=alert]")).toBeNull();
  });

  test("no lanza si el sportsbook está apagado", async () => {
    useSportsbookC360.mockReturnValue(
      { listo: true, activo: false, conHistorial: false, juego: null });
    montar(<SportsbookC360 user={USER} />);
    await vaciar();
    expect(global.fetch).not.toHaveBeenCalled();
  });

  test("sin sesión no lanza y avisa que hay que entrar", async () => {
    montar(<SportsbookC360 user={null} />);
    await vaciar();
    expect(global.fetch).not.toHaveBeenCalled();
    await act(async () => { boton("Abrir el sportsbook").click(); });
    expect(container.querySelector("[role=alert]").textContent)
      .toBe("Entrá a tu cuenta para jugar");
  });
});
