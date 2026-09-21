// Today an empty state in this product is a line of grey text and
// nothing else. The prototype's own empty states (`.mascot-empty`) carry
// the assistant character beside the message; this pins that every empty
// state built the same way — a plain, unillustrated line of muted,
// centered text — now renders the mascot too, not just the text.
//
// Empty states that already carry their own icon (an emoji, like the
// "Todavía no está disponible" blocks or the 🌙/⚽/🎥/👋/🎟️ states) are a
// different shape — already illustrated — and are left alone, along with
// every "Cargando…" loading state, which is not an empty state at all.
//
// Structural, source-based assertions: the way ticketStaysVisible.test.js
// and scanPanel.test.js read this project's mega-components, since there
// is no DOM renderer for App.jsx/Web.jsx here.
const fs = require("fs");
const path = require("path");

const read = (file) => fs.readFileSync(path.resolve(__dirname, file), "utf8");

const APP = read("App.jsx");
const WEB = read("Web.jsx");

function mascotPrecedesText(source, needle, lookBehind = 400) {
  const at = source.indexOf(needle);
  expect(at).toBeGreaterThan(-1);
  const before = source.slice(Math.max(0, at - lookBehind), at);
  return /<Mascot\b/.test(before);
}

describe("App.jsx's plain-text empty states carry the mascot", () => {
  test.each([
    "No hay eventos en vivo ahora",
    "No hay movimientos en este período.",
    "Todavía no jugaste al casino.",
    "Todavía no participaste de ningún desafío.",
    "Todavía no hay cotización para tu moneda.",
  ])("%s", (needle) => {
    expect(mascotPrecedesText(APP, needle)).toBe(true);
  });
});

describe("Web.jsx's plain-text empty states carry the mascot", () => {
  test.each([
    "No hay novedades por ahora.",
    "Todavía no jugaste nada.",
    "Todavía no participaste de ningún desafío.",
    "Todavía no hay cotización para tu moneda.",
    "No hay partidos en vivo en este momento.",
    "No hay partidos disponibles en este momento.",
  ])("%s", (needle) => {
    expect(mascotPrecedesText(WEB, needle)).toBe(true);
  });
});

describe("the mascot in an empty state is decorative", () => {
  test("App.jsx imports Mascot", () => {
    // App.jsx also takes the named MASCOT_FACE_ASSET from this module, for
    // the bot's avatar in the conversation. The default import is what this
    // test is about, so the pattern allows the named list beside it rather
    // than pinning the whole line.
    expect(APP).toMatch(/import Mascot(?:,\s*\{[^}]*\})? from ["']\.\/Mascot["'];?/);
  });
  test("Web.jsx imports Mascot", () => {
    expect(WEB).toMatch(/import Mascot from ["']\.\/Mascot["'];?/);
  });
});

describe("the home screen carries the mascot in its header, like the prototype's player-home.html", () => {
  test("ScreenHome renders Mascot", () => {
    const start = APP.indexOf("function ScreenHome");
    expect(start).toBeGreaterThan(-1);
    const end = APP.indexOf("\nfunction ", start);
    const body = APP.slice(start, end);
    expect(body).toContain("<Mascot");
  });
});

describe("loading states are left alone (not an empty state)", () => {
  test("a 'Cargando' block right before a plain empty state is not mistaken for it", () => {
    // Sanity check on the test helper itself: the "No hay eventos en vivo
    // ahora" card is preceded by a live-matches loop, not a loading state,
    // so a false positive here would mean the helper is too loose.
    const at = APP.indexOf("No hay eventos en vivo ahora");
    const before = APP.slice(Math.max(0, at - 40), at);
    expect(before).not.toContain("Cargando");
  });
});
