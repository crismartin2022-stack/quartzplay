import fs from "fs";
import path from "path";
import { salirDeLaSesion } from "./Agencia";

// Agencia.jsx lee la config del entorno al importarse; acá no hay build.
jest.mock("./config", () => ({
  getFrontendConfig: () => ({
    apiUrl: "https://api.test", appOrigin: "https://app.test", botUsername: "bot",
  }),
}));

// Salir del panel limpia lo local y además avisa al servidor. Lo delicado:
// si el aviso falla, lo local se limpia igual. Dejar a alguien "adentro" de
// su panel porque no se pudo avisar es peor que una sesión huérfana que
// vence sola.

describe("salirDeLaSesion", () => {
  test("limpia lo local y avisa al servidor con el token", async () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn().mockResolvedValue({ ok: true });
    const ok = await salirDeLaSesion("tok-1", limpiar, fetchFn);
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(fetchFn).toHaveBeenCalledTimes(1);
    const [url, opts] = fetchFn.mock.calls[0];
    expect(url).toMatch(/\/api\/agencias\/logout$/);
    expect(opts.method).toBe("POST");
    // Sin esto el aviso se corta si la pestaña se recarga justo al salir.
    expect(opts.keepalive).toBe(true);
    expect(opts.headers.Authorization).toBe("Bearer tok-1");
    expect(ok).toBe(true);
  });

  test("si el servidor rechaza la conexion, lo local se limpia igual", async () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn().mockRejectedValue(new TypeError("network"));
    await expect(salirDeLaSesion("tok-1", limpiar, fetchFn)).resolves.toBe(false);
    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  test("si fetch lanza de forma sincrona, lo local se limpia igual", async () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn(() => { throw new Error("boom"); });
    await expect(salirDeLaSesion("tok-1", limpiar, fetchFn)).resolves.toBe(false);
    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  test("si el servidor contesta error (401 por vencida, 503), lo local se limpia", async () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn().mockResolvedValue({ ok: false, status: 503 });
    await expect(salirDeLaSesion("tok-1", limpiar, fetchFn)).resolves.toBe(false);
    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  test("si el servidor nunca contesta, lo local ya estaba limpio", () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn(() => new Promise(() => {}));
    salirDeLaSesion("tok-1", limpiar, fetchFn);
    expect(limpiar).toHaveBeenCalledTimes(1);
  });

  test("sin token no hay a quien avisar, pero igual se limpia", async () => {
    const limpiar = jest.fn();
    const fetchFn = jest.fn();
    await salirDeLaSesion(null, limpiar, fetchFn);
    expect(limpiar).toHaveBeenCalledTimes(1);
    expect(fetchFn).not.toHaveBeenCalled();
  });
});

describe("las tres salidas del panel pasan por salirDeLaSesion", () => {
  const SRC = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");

  test("ningun boton Salir vuelve a limpiar solo el estado local", () => {
    expect(SRC).not.toMatch(/onLogout=\{\(\)=>setAgencia\(null\)\}/);
    expect(SRC).not.toMatch(/onClick=\{\(\)=>setAgencia\(null\)\}/);
    expect([...SRC.matchAll(/onLogout=\{salir\}/g)]).toHaveLength(2);
    expect([...SRC.matchAll(/onClick=\{salir\}/g)]).toHaveLength(1);
  });
});
