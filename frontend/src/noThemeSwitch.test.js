// The product renders one theme now: dark, always. The switch that used to
// let a visitor pick "claro" is gone from all three screens that used to
// offer it, and so is the stored preference it used to read and write.
//
// Scanned the way scanGate.test.js and theme.test.js scan Web/App/Box: by
// reading the source, since there is no testing-library in this project.
// Every check below runs over all three screens with test.each, so a switch
// that comes back in one file — not just the one somebody happened to look
// at — fails the suite.
import fs from "fs";
import path from "path";

const SRC = path.resolve(__dirname);
const SCREENS = ["Web.jsx", "App.jsx", "Box.jsx"];

const sources = Object.fromEntries(
  SCREENS.map((name) => [name, fs.readFileSync(path.join(SRC, name), "utf8")])
);

describe("no screen renders a theme control", () => {
  test.each(SCREENS)("%s does not define BotonTema", (name) => {
    expect(sources[name]).not.toMatch(/function\s+BotonTema/);
  });

  test.each(SCREENS)("%s does not render <BotonTema", (name) => {
    expect(sources[name]).not.toMatch(/<BotonTema/);
  });

  test.each(SCREENS)("%s does not thread a tema/onTema toggle through props", (name) => {
    expect(sources[name]).not.toMatch(/\bonTema\b/);
    expect(sources[name]).not.toMatch(/\bcambiarTema\b/);
  });
});

describe("no screen reads or writes a stored theme preference", () => {
  test.each(SCREENS)("%s does not read or write the qp_tema key", (name) => {
    expect(sources[name]).not.toMatch(/qp_tema/);
  });

  test.each(SCREENS)("%s does not define temaGuardado", (name) => {
    expect(sources[name]).not.toMatch(/function\s+temaGuardado/);
  });

  test.each(SCREENS)("%s carries no theme-name state to toggle", (name) => {
    expect(sources[name]).not.toMatch(/useState\(\s*temaGuardado/);
    expect(sources[name]).not.toMatch(/\[\s*tema\s*,\s*setTema\s*\]/);
  });
});

describe("the app renders dark regardless of what a browser has stored", () => {
  test.each(SCREENS)("%s no longer carries a switchable TEMA variable", (name) => {
    // The old mutable `let TEMA = temaGuardado();` picked a theme name at
    // load. With one theme there is nothing left to pick.
    expect(sources[name]).not.toMatch(/\bTEMA\b/);
  });

  test.each(SCREENS)("%s takes its palette from the theme module directly", (name) => {
    expect(sources[name]).toMatch(/import\s*\{[^}]*\boscuro\s+as\s+Q\b[^}]*\}\s*from\s*"\.\/theme"/s);
  });
});

describe("ov() has one answer, not a branch that can never be taken", () => {
  const ovBody = (name) => {
    const start = sources[name].indexOf("function ov(");
    expect(start).toBeGreaterThan(-1);
    const end = sources[name].indexOf("\n}", start);
    expect(end).toBeGreaterThan(start);
    return sources[name].slice(start, end);
  };

  test.each(SCREENS)("%s's ov() no longer branches on a theme name", (name) => {
    const body = ovBody(name);
    expect(body).not.toMatch(/claro/);
    expect(body).not.toContain("?");
  });

  test.each(SCREENS)("%s's ov() still answers with the dark overlay", (name) => {
    expect(ovBody(name)).toContain("rgba(255,255,255,");
  });
});
