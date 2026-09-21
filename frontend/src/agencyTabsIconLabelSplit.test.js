import fs from "fs";
import path from "path";

// T1 of odd/tasks/panel-polish.md: AgenciaPanel's TABS array packs the
// icon and the label into one `l` value (`l:<><Icon.../> Clientes</>`),
// so the button has nowhere to put a gap between them, and ten tabs have
// no icon at all because there was no slot for one. Admin's TABS array
// keeps `i` and `l` apart (`{k:"agencias", i:<Building2/>, l:"Agencias"}`)
// — that split is what the fix copies.
//
// Structural, source-based assertions — no DOM renderer for Agencia.jsx
// here (see jsxTagsAreBound.test.js / agenciaDesktopSidebar.test.js for
// the same constraint solved the same way).
const AGENCIA = fs.readFileSync(path.resolve(__dirname, "Agencia.jsx"), "utf8");

function tabsArrayText(source) {
  const start = source.indexOf("const TABS=[");
  expect(start).toBeGreaterThan(-1);
  const end = source.indexOf("].filter(", start);
  expect(end).toBeGreaterThan(start);
  return source.slice(start, end);
}

function tabEntries(arrayText) {
  // Every entry is written one per source line (`{k:"...", i:<.../>, l:"..."},`),
  // and an icon's own `size={12}` brace would break a naive brace-matching
  // regex — reading whole lines sidesteps that instead of trying to
  // brace-match nested JSX.
  return arrayText
    .split("\n")
    .filter((line) => /^\s*\{k:"\w+"/.test(line))
    .map((line) => ({ key: line.match(/k:"(\w+)"/)[1], text: line }));
}

describe("agency's TABS array separates the icon from the label", () => {
  const arrayText = tabsArrayText(AGENCIA);
  const entries = tabEntries(arrayText);

  test("there are still eighteen tabs, same keys as before", () => {
    expect(entries.map((e) => e.key)).toEqual([
      "codigo", "envivo", "manual", "combos", "mejorar", "clientes",
      "misagencias", "influencers", "historial", "cashout", "bonos",
      "cierres", "mensajes", "terminales", "desafios", "asesor",
      "soporte", "config",
    ]);
  });

  test("every entry has its own i: field, separate from l:", () => {
    for (const { key, text } of entries) {
      expect({ key, hasI: /\bi:/.test(text) }).toEqual({ key, hasI: true });
    }
  });

  test("no entry packs an icon element inside its l: value", () => {
    // The old bug shape: `l:<>` (a fragment opening right after `l:`).
    for (const { key, text } of entries) {
      expect({ key, packedL: /l:\s*<>/.test(text) }).toEqual({ key, packedL: false });
    }
  });

  test("positive control: the packed-l shape is actually detected", () => {
    const buggy = '{k:"clientes", l:<><Icon name="users" size={12}/> Clientes</>},';
    expect(/l:\s*<>/.test(buggy)).toBe(true);
  });

  test("every entry's l: value is a plain string, not JSX", () => {
    for (const { key, text } of entries) {
      const m = text.match(/l:\s*("(?:[^"\\]|\\.)*")/);
      expect({ key, plainL: Boolean(m) }).toEqual({ key, plainL: true });
    }
  });
});

// odd/tasks/mobile-nav.md: AgenciaPanel's mobile tab strip (the button
// this describe block used to check) is gone, replaced by a hamburger
// button that opens MobileTabMenu.jsx — a component shared with
// Admin's panel. The icon/label split this file is about now needs
// checking in both surviving renderers: AgenciaPanel's desktop sidebar
// button, and MobileTabMenu's shared button.
describe("the button renders the icon with a gap before the label", () => {
  test("AgenciaPanel's desktop sidebar button places t.i and t.l in separate spans, not packed together", () => {
    const start = AGENCIA.indexOf("function AgenciaPanel");
    const end = AGENCIA.indexOf("\nfunction ", start + 1);
    const body = AGENCIA.slice(start, end);
    expect(body).toMatch(/<span style=\{\{fontSize:17,position:"relative",[\s\S]*?\}\}>\{t\.i\}<\/span>/);
    expect(body).toMatch(/<span style=\{\{color:tab===t\.k\?Q\.cyan:Q\.muted,fontSize:TEXT\[12\],[\s\S]*?\}\}>\{t\.l\}<\/span>/);
  });

  test("MobileTabMenu's shared button places t.i and t.l in separate spans, not packed together", () => {
    const fs = require("fs");
    const path = require("path");
    const MENU = fs.readFileSync(path.resolve(__dirname, "MobileTabMenu.jsx"), "utf8");
    expect(MENU).toMatch(/<span style=\{\{fontSize:17,[\s\S]*?\}\}>\{t\.i\}<\/span>/);
    expect(MENU).toMatch(/<span style=\{\{flex:1,minWidth:0,[\s\S]*?\}\}>\{t\.l\}<\/span>/);
  });
});
