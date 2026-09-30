// Cada prueba nombra el riesgo que cubre: un interruptor que apaga el casino
// de producción. Lo que importa no es que pegue a la URL sino que (1) nunca
// mande más que `codigo` y `activa`, (2) nunca se quede mostrando un estado
// que el servidor no confirmó, y (3) nunca afirme «cifrada» sin que el
// servidor lo haya dicho.
import {
  cambiarActiva, estadoInicial, iniciarCambio, cambioConfirmado,
  cambioFallido, recargar, requiereConfirmacion, textoConfirmacionApagado,
  estadoClave, resumenIps, normalizarProveedor, textoJuegos,
} from "./proveedoresApi";

const respuesta = (ok, status, cuerpo) => ({ ok, status, json: async () => cuerpo });

const FILAS = [
  { codigo: "44neoluck", nombre: "44Neoluck", activa: true, adaptador: "legado",
    monedas: "ARS", juegos: 120, prioridad: 10, tiene_credenciales: true,
    ips_permitidas: [] },
  { codigo: "atomic", nombre: "Atomic", activa: false, adaptador: "atomic",
    monedas: "ARS,USD", juegos: 1, prioridad: 20, tiene_credenciales: true,
    clave_cifrada: true, ips_permitidas: ["1.2.3.4/32", "5.6.7.8/32", "9.9.9.9/32", "8.8.8.8/32"] },
];

describe("cambiarActiva: el pedido que puede apagar el casino", () => {
  test("manda solo codigo y activa, nunca el resto de la fila", async () => {
    const pedir = jest.fn().mockResolvedValue(respuesta(true, 200, { ok: true }));
    await cambiarActiva({ api: "http://x", adminKey: "k", codigo: "atomic", activa: true, fetchImpl: pedir });
    const [url, init] = pedir.mock.calls[0];
    expect(url).toBe("http://x/api/admin/casino/integraciones");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ codigo: "atomic", activa: true });
    expect(init.headers["X-Admin-Key"]).toBe("k");
  });

  test("un 200 sin {ok:true} no cuenta como guardado", async () => {
    const pedir = jest.fn().mockResolvedValue(respuesta(true, 200, {}));
    const r = await cambiarActiva({ api: "", codigo: "a", activa: false, fetchImpl: pedir });
    expect(r.ok).toBe(false);
  });

  test("el detalle del servidor llega tal cual", async () => {
    const pedir = jest.fn().mockResolvedValue(respuesta(false, 400, { detail: "Adaptador inválido" }));
    const r = await cambiarActiva({ api: "", codigo: "a", activa: false, fetchImpl: pedir });
    expect(r).toMatchObject({ ok: false, mensaje: "Adaptador inválido" });
  });

  test("sin red falla con mensaje, no lanza", async () => {
    const pedir = jest.fn().mockRejectedValue(new Error("boom"));
    const r = await cambiarActiva({ api: "", codigo: "a", activa: false, fetchImpl: pedir });
    expect(r).toMatchObject({ ok: false, mensaje: "Sin conexión con el servidor" });
  });

  test("401 se distingue para volver a pedir la clave", async () => {
    const pedir = jest.fn().mockResolvedValue(respuesta(false, 401, {}));
    const r = await cambiarActiva({ api: "", codigo: "a", activa: false, fetchImpl: pedir });
    expect(r.noAutorizado).toBe(true);
  });
});

describe("la máquina del interruptor", () => {
  test("al tocar, el interruptor se mueve y queda en vuelo", () => {
    const e0 = estadoInicial(FILAS);
    const paso = iniciarCambio(e0, "44neoluck", false);
    expect(paso.enviar).toBe(true);
    expect(paso.anterior).toBe(true);
    expect(paso.estado.lista[0].activa).toBe(false);
    expect(paso.estado.pendientes).toEqual({ "44neoluck": false });
  });

  test("un segundo toque con el pedido en vuelo no envía nada", () => {
    const paso = iniciarCambio(estadoInicial(FILAS), "44neoluck", false);
    const otro = iniciarCambio(paso.estado, "44neoluck", true);
    expect(otro.enviar).toBe(false);
    expect(otro.estado).toBe(paso.estado);
  });

  test("pedir el estado que ya tiene no envía nada", () => {
    expect(iniciarCambio(estadoInicial(FILAS), "44neoluck", true).enviar).toBe(false);
  });

  test("si falla, vuelve al valor anterior y deja el motivo", () => {
    const paso = iniciarCambio(estadoInicial(FILAS), "44neoluck", false);
    const e = cambioFallido(paso.estado, "44neoluck", paso.anterior, "Sin conexión con el servidor");
    expect(e.lista[0].activa).toBe(true);
    expect(e.pendientes).toEqual({});
    expect(e.errores["44neoluck"]).toBe("Sin conexión con el servidor");
  });

  test("un fallo sin mensaje igual dice algo", () => {
    const paso = iniciarCambio(estadoInicial(FILAS), "atomic", true);
    const e = cambioFallido(paso.estado, "atomic", paso.anterior, "");
    expect(e.errores.atomic).toMatch(/No se pudo/);
    expect(e.lista[1].activa).toBe(false);
  });

  test("el fallo de un proveedor no toca a los demás", () => {
    let e = iniciarCambio(estadoInicial(FILAS), "atomic", true).estado;
    e = iniciarCambio(e, "44neoluck", false).estado;
    e = cambioFallido(e, "44neoluck", true, "x");
    expect(e.lista[1].activa).toBe(true);
    expect(e.pendientes).toEqual({ atomic: true });
  });

  test("al confirmar se libera el pendiente y se conserva el valor", () => {
    const paso = iniciarCambio(estadoInicial(FILAS), "atomic", true);
    const e = cambioConfirmado(paso.estado, "atomic");
    expect(e.pendientes).toEqual({});
    expect(e.lista[1].activa).toBe(true);
  });

  test("un reintento limpia el error anterior", () => {
    const p1 = iniciarCambio(estadoInicial(FILAS), "atomic", true);
    const fallado = cambioFallido(p1.estado, "atomic", false, "x");
    const p2 = iniciarCambio(fallado, "atomic", true);
    expect(p2.estado.errores).toEqual({});
  });

  test("una recarga que llega con el pedido en vuelo no hace saltar el interruptor", () => {
    const paso = iniciarCambio(estadoInicial(FILAS), "44neoluck", false);
    const e = recargar(paso.estado, FILAS); // el servidor aún dice activa: true
    expect(e.lista[0].activa).toBe(false);
  });

  test("una recarga sin pendientes refleja lo que dice el servidor", () => {
    const e = recargar(estadoInicial(FILAS), [{ ...FILAS[0], activa: false }]);
    expect(e.lista[0].activa).toBe(false);
  });
});

describe("confirmación: solo al apagar", () => {
  test("apagar un proveedor activo pide confirmación", () => {
    expect(requiereConfirmacion(true, false)).toBe(true);
  });
  test("encender no la pide", () => {
    expect(requiereConfirmacion(false, true)).toBe(false);
  });
  test("el texto dice a quién afecta y no promete efecto inmediato", () => {
    const t = textoConfirmacionApagado(normalizarProveedor(FILAS[0]));
    expect(t).toContain("44Neoluck");
    expect(t).toContain("120 juegos");
    expect(t).toContain("jugadores");
    expect(t).not.toMatch(/de inmediato/);
  });
});

describe("estado de la clave: tres estados, no dos", () => {
  test("cifrada solo si el servidor lo dijo", () => {
    expect(estadoClave(normalizarProveedor(FILAS[1])).id).toBe("cifrada");
  });
  test("en texto plano es una alerta", () => {
    const p = normalizarProveedor({ ...FILAS[0], clave_cifrada: false });
    expect(estadoClave(p)).toMatchObject({ id: "plano", alerta: true });
  });
  test("si el servidor no lo dice, no se afirma nada", () => {
    const e = estadoClave(normalizarProveedor(FILAS[0]));
    expect(e.id).toBe("sin_dato");
    expect(e.texto).not.toMatch(/cifrada$/);
  });
  test("sin credenciales gana sobre todo lo demás", () => {
    const p = normalizarProveedor({ ...FILAS[1], tiene_credenciales: false });
    expect(estadoClave(p).id).toBe("faltan");
  });
});

describe("IPs y conteos", () => {
  test("lista vacía se señala", () => {
    expect(resumenIps(normalizarProveedor(FILAS[0])).vacia).toBe(true);
  });
  test("se muestran las primeras y se cuenta el resto", () => {
    const r = resumenIps(normalizarProveedor(FILAS[1]));
    expect(r.visibles).toHaveLength(3);
    expect(r.resto).toBe(1);
  });
  test("singular y plural", () => {
    expect(textoJuegos(1)).toBe("1 juego");
    expect(textoJuegos(0)).toBe("0 juegos");
  });
  test("una fila rara no rompe la normalización", () => {
    const p = normalizarProveedor({ codigo: "x", juegos: null, ips_permitidas: null });
    expect(p).toMatchObject({ juegos: 0, ips: [], activa: false });
  });
});
