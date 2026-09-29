import {
  codigoDeReferido,
  enlaceAlBot,
  enlaceAlSitio,
  estaEnTelegram,
} from "./puertaTelegram";

// ── Detectar Telegram ────────────────────────────────────────────

test("sin initData no estamos en Telegram", () => {
  expect(estaEnTelegram(undefined)).toBe(false);
  expect(estaEnTelegram({})).toBe(false);
  expect(estaEnTelegram({ Telegram: {} })).toBe(false);
  expect(estaEnTelegram({ Telegram: { WebApp: {} } })).toBe(false);
});

test("initData vacío tampoco cuenta", () => {
  // Telegram inyecta el objeto aunque la firma no esté; tomar la
  // presencia del objeto como prueba dejaría pasar a un navegador.
  expect(estaEnTelegram({ Telegram: { WebApp: { initData: "" } } })).toBe(false);
});

test("con initData firmado sí estamos adentro", () => {
  expect(estaEnTelegram({ Telegram: { WebApp: { initData: "user=%7B%22id%22" } } })).toBe(true);
});

// ── El código de referido ────────────────────────────────────────

test("el código sobrevive la puerta", () => {
  // Si se pierde acá, el influencer no cobra por un jugador que trajo.
  expect(codigoDeReferido("?ref=JUAN")).toBe("JUAN");
  expect(codigoDeReferido("?scan=PEDRO")).toBe("PEDRO");
});

test("también viene del start_param del bot", () => {
  expect(codigoDeReferido("", "combo_ABC")).toBe("ABC");
  expect(codigoDeReferido("", "scan_XYZ")).toBe("XYZ");
});

test("sin código no se inventa nada", () => {
  expect(codigoDeReferido("")).toBe("");
  expect(codigoDeReferido("?otra=cosa")).toBe("");
  expect(codigoDeReferido(undefined, undefined)).toBe("");
});

// ── Las dos salidas ──────────────────────────────────────────────

test("el enlace al bot lleva el código adelante", () => {
  expect(enlaceAlBot("iaqp_bot", "JUAN")).toBe("https://t.me/iaqp_bot?start=JUAN");
});

test("la arroba del usuario no se duplica", () => {
  expect(enlaceAlBot("@iaqp_bot")).toBe("https://t.me/iaqp_bot");
});

test("sin usuario de bot no se arma un enlace roto", () => {
  // Preferimos no ofrecer la salida antes que mandar a t.me/undefined.
  expect(enlaceAlBot("")).toBe("");
});

test("el enlace al sitio también lleva el código", () => {
  expect(enlaceAlSitio("JUAN")).toBe("/sitio?ref=JUAN");
  expect(enlaceAlSitio()).toBe("/sitio");
});

test("un código con caracteres raros no rompe la URL", () => {
  expect(enlaceAlSitio("a b&c")).toBe("/sitio?ref=a%20b%26c");
  expect(enlaceAlBot("iaqp_bot", "a b&c")).toBe("https://t.me/iaqp_bot?start=a%20b%26c");
});
