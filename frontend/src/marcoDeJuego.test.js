import {
  ALTO_CABECERA,
  abrirAparte,
  dimensionesMarco,
  estadoInicial,
  reducirMarco,
  urlDeJuego,
} from "./marcoDeJuego";

// ── El enlace ────────────────────────────────────────────────────

test("acepta un enlace https y lo devuelve normalizado", () => {
  expect(urlDeJuego("https://pusg.grgr.forum/juego?token=abc"))
    .toBe("https://pusg.grgr.forum/juego?token=abc");
});

test("quita los espacios de los bordes", () => {
  expect(urlDeJuego("  https://estudio.test/g  ")).toBe("https://estudio.test/g");
});

test("rechaza lo que ejecutaría código en nuestro dominio", () => {
  expect(urlDeJuego("javascript:alert(1)")).toBeNull();
  expect(urlDeJuego("data:text/html,<script>1</script>")).toBeNull();
});

test("rechaza lo que no es un enlace", () => {
  expect(urlDeJuego("")).toBeNull();
  expect(urlDeJuego(undefined)).toBeNull();
  expect(urlDeJuego(42)).toBeNull();
  expect(urlDeJuego("no es una url")).toBeNull();
});

// ── El estado del marco ──────────────────────────────────────────

test("empieza cargando", () => {
  expect(estadoInicial()).toBe("cargando");
});

test("el aviso de carga lo deja listo", () => {
  expect(reducirMarco("cargando", "cargo")).toBe("listo");
});

test("si vence el plazo sin aviso, queda lento", () => {
  expect(reducirMarco("cargando", "vencio")).toBe("lento");
});

test("un plazo que vence después de cargar no rompe lo que ya anda", () => {
  // El temporizador se cancela al cargar, pero una carrera entre ambos
  // no puede tapar con un cartel de error un juego que ya está andando.
  expect(reducirMarco("listo", "vencio")).toBe("listo");
});

test("un juego lento que termina cargando pasa a listo", () => {
  expect(reducirMarco("lento", "cargo")).toBe("listo");
});

test("reintentar vuelve a esperar", () => {
  expect(reducirMarco("lento", "reintentar")).toBe("cargando");
});

test("un evento desconocido no cambia nada", () => {
  expect(reducirMarco("listo", "algo")).toBe("listo");
});

// ── La forma del marco ───────────────────────────────────────────

test("en un teléfono vertical ocupa todo el espacio menos la cabecera", () => {
  expect(dimensionesMarco(360, 740))
    .toEqual({ ancho: 360, alto: 740 - ALTO_CABECERA });
});

test("en un teléfono horizontal también ocupa todo", () => {
  // 800x360: alto útil 312, muy bajo para achicar el ancho a 16:9.
  expect(dimensionesMarco(800, 360))
    .toEqual({ ancho: 800, alto: 360 - ALTO_CABECERA });
});

test("en una pantalla ancha no estira el juego más allá de 16:9", () => {
  const d = dimensionesMarco(2000, 900);
  expect(d.alto).toBe(900 - ALTO_CABECERA);
  expect(d.ancho).toBe(Math.round((900 - ALTO_CABECERA) * 16 / 9));
});

test("en un escritorio más alto que 16:9 llena el ancho", () => {
  expect(dimensionesMarco(1000, 900))
    .toEqual({ ancho: 1000, alto: 900 - ALTO_CABECERA });
});

test("nunca devuelve medidas negativas ni NaN", () => {
  expect(dimensionesMarco(0, 0)).toEqual({ ancho: 0, alto: 0 });
  expect(dimensionesMarco(NaN, NaN)).toEqual({ ancho: 0, alto: 0 });
  expect(dimensionesMarco(300, 20)).toEqual({ ancho: 300, alto: 0 });
});

// ── Abrir aparte ─────────────────────────────────────────────────

test("en Telegram usa el navegador propio", () => {
  const openLink = jest.fn();
  const open = jest.fn();
  const ok = abrirAparte(
    { Telegram: { WebApp: { initData: "firmado", openLink } }, open },
    "https://estudio.test/g");
  expect(ok).toBe(true);
  expect(openLink).toHaveBeenCalledWith("https://estudio.test/g");
  expect(open).not.toHaveBeenCalled();
});

test("en un navegador abre una pestaña y la aísla", () => {
  const ventana = { opener: "nosotros" };
  const open = jest.fn(() => ventana);
  expect(abrirAparte({ open }, "https://estudio.test/g")).toBe(true);
  expect(open).toHaveBeenCalledWith("https://estudio.test/g", "_blank");
  expect(ventana.opener).toBeNull();
});

test("si el navegador bloquea la ventana lo dice", () => {
  expect(abrirAparte({ open: () => null }, "https://estudio.test/g")).toBe(false);
});

test("no abre un enlace que no pasó la validación", () => {
  const open = jest.fn();
  expect(abrirAparte({ open }, "javascript:alert(1)")).toBe(false);
  expect(open).not.toHaveBeenCalled();
});

test("sin ventana no hay nada que abrir", () => {
  expect(abrirAparte(undefined, "https://estudio.test/g")).toBe(false);
});
